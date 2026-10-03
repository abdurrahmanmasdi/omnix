"""WP-C C2.3 (KI-002): one INTERNAL_GRPC_TLS switch; TLS with test certs works, misconfig fails closed."""
import base64
import datetime
import ipaddress
import logging
from pathlib import Path

import grpc
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

import agent_pb2
import agent_pb2_grpc
from app.core.config import Settings
from app.core.grpc_transport import TransportConfigError, server_credentials
from app.grpc_services.agent_servicer import SalesAgentServicer
from app.grpc_services.auth_interceptor import AuthInterceptor

BASE = dict(
    OPENAI_API_KEY="synthetic-key",
    DATABASE_URL="postgresql://synthetic:synthetic@127.0.0.1:5432/omnix_synthetic",
    INTERNAL_RPC_SECRET="synthetic-rpc-secret",
)


def _settings(**overrides):
    return Settings(_env_file=None, **{**BASE, **overrides})


def _self_signed() -> tuple[bytes, bytes]:
    """Synthetic, test-only localhost certificate (generated per run, never committed)."""
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=1))
        .not_valid_after(now + datetime.timedelta(hours=1))
        .add_extension(
            x509.SubjectAlternativeName([x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
            critical=False,
        )
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    key_pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    return cert.public_bytes(serialization.Encoding.PEM), key_pem


def test_tls_is_required_by_default():
    assert _settings().INTERNAL_GRPC_TLS == "required"


def test_required_without_cert_and_key_fails_closed():
    with pytest.raises(TransportConfigError, match="INTERNAL_GRPC_TLS_CERT"):
        server_credentials(_settings())


def test_required_with_unreadable_material_fails_closed(tmp_path):
    with pytest.raises(TransportConfigError):
        server_credentials(_settings(
            INTERNAL_GRPC_TLS_CERT=str(tmp_path / "missing.pem"), INTERNAL_GRPC_TLS_KEY=str(tmp_path / "missing.key"),
        ))
    with pytest.raises(TransportConfigError):
        server_credentials(_settings(INTERNAL_GRPC_TLS_CERT_B64="%%%", INTERNAL_GRPC_TLS_KEY_B64="%%%"))


def test_disabled_needs_the_private_network_acknowledgement():
    with pytest.raises(TransportConfigError, match="INTERNAL_GRPC_PRIVATE_NETWORK"):
        server_credentials(_settings(INTERNAL_GRPC_TLS="disabled"))


def test_disabled_with_acknowledgement_warns(caplog):
    with caplog.at_level(logging.WARNING):
        assert server_credentials(_settings(INTERNAL_GRPC_TLS="disabled", INTERNAL_GRPC_PRIVATE_NETWORK=True)) is None
    assert "INTERNAL_GRPC_TLS_DISABLED" in caplog.text


def test_no_placeholder_tls_left():
    main = (Path(__file__).resolve().parents[1] / "main.py").read_text()
    assert "ssl_server_credentials([])" not in main


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
@pytest.mark.parametrize("encoding", ["path", "base64"])
async def test_tls_round_trip_with_test_certificate(tmp_path, encoding):
    cert, key = _self_signed()
    if encoding == "path":
        (tmp_path / "server.pem").write_bytes(cert)
        (tmp_path / "server.key").write_bytes(key)
        config = _settings(INTERNAL_GRPC_TLS_CERT=str(tmp_path / "server.pem"), INTERNAL_GRPC_TLS_KEY=str(tmp_path / "server.key"))
    else:
        config = _settings(
            INTERNAL_GRPC_TLS_CERT_B64=base64.b64encode(cert).decode(),
            INTERNAL_GRPC_TLS_KEY_B64=base64.b64encode(key).decode(),
        )
    server = grpc.aio.server(interceptors=[AuthInterceptor("synthetic-rpc-secret")])
    agent_pb2_grpc.add_SalesAgentServicer_to_server(SalesAgentServicer(), server)
    port = server.add_secure_port("127.0.0.1:0", server_credentials(config))
    await server.start()
    request = agent_pb2.AgentRequest(organizationId="org-tls", conversationId="conv-tls")
    try:
        # Trusted CA: the handshake succeeds and the call reaches the auth interceptor.
        async with grpc.aio.secure_channel(f"localhost:{port}", grpc.ssl_channel_credentials(cert)) as channel:
            with pytest.raises(grpc.RpcError) as error:
                await agent_pb2_grpc.SalesAgentStub(channel).GenerateReply(
                    request, metadata=(("authorization", "Bearer wrong"),), timeout=5,
                )
            assert error.value.code() == grpc.StatusCode.UNAUTHENTICATED
        # Plaintext client against the TLS port never gets through.
        async with grpc.aio.insecure_channel(f"localhost:{port}") as channel:
            with pytest.raises(grpc.RpcError) as error:
                await agent_pb2_grpc.SalesAgentStub(channel).GenerateReply(request, timeout=5)
            assert error.value.code() == grpc.StatusCode.UNAVAILABLE
    finally:
        await server.stop(None)
