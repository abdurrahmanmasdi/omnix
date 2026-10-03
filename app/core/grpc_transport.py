"""Transport security for the internal Nest -> Python gRPC link (KI-002).

One switch, named the same in both services: INTERNAL_GRPC_TLS=required|disabled.
- required (default): the server loads its certificate and key from
  INTERNAL_GRPC_TLS_CERT / INTERNAL_GRPC_TLS_KEY (file paths) or the *_B64 variants
  (base64 PEM). Missing or unreadable material stops startup (fail closed).
- disabled: plaintext, allowed only with INTERNAL_GRPC_PRIVATE_NETWORK=true as an
  explicit acknowledgement that the link runs on a private network; logs a warning.
Which mode each deployment uses is decided in P1-11.
"""
import base64
import binascii
import logging
from pathlib import Path

import grpc

logger = logging.getLogger(__name__)


class TransportConfigError(RuntimeError):
    """The gRPC transport configuration is missing or invalid."""


def _pem(path: str | None, encoded: str | None, name: str) -> bytes:
    if path and encoded:
        raise TransportConfigError(f"Set either {name} or {name}_B64, not both")
    if path:
        try:
            data = Path(path).read_bytes()
        except OSError as error:
            raise TransportConfigError(f"{name} file cannot be read") from error
    elif encoded:
        try:
            data = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as error:
            raise TransportConfigError(f"{name}_B64 is not valid base64") from error
    else:
        raise TransportConfigError(f"INTERNAL_GRPC_TLS=required needs {name} or {name}_B64")
    if b"-----BEGIN" not in data:
        raise TransportConfigError(f"{name} must be PEM encoded")
    return data


def server_credentials(settings) -> grpc.ServerCredentials | None:
    """Credentials for the gRPC listener, or None for an acknowledged plaintext listener."""
    if settings.INTERNAL_GRPC_TLS == "disabled":
        if not settings.INTERNAL_GRPC_PRIVATE_NETWORK:
            raise TransportConfigError(
                "INTERNAL_GRPC_TLS=disabled requires INTERNAL_GRPC_PRIVATE_NETWORK=true "
                "(acknowledge that the Nest -> Python link is on a private network)"
            )
        logger.warning(
            "INTERNAL_GRPC_TLS_DISABLED: internal gRPC is plaintext; only acceptable on a private network"
        )
        return None
    cert = _pem(settings.INTERNAL_GRPC_TLS_CERT, settings.INTERNAL_GRPC_TLS_CERT_B64, "INTERNAL_GRPC_TLS_CERT")
    key = _pem(settings.INTERNAL_GRPC_TLS_KEY, settings.INTERNAL_GRPC_TLS_KEY_B64, "INTERNAL_GRPC_TLS_KEY")
    return grpc.ssl_server_credentials([(key, cert)])
