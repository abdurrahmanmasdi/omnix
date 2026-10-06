import grpc
import hmac
import logging

logger = logging.getLogger(__name__)

class AuthInterceptor(grpc.aio.ServerInterceptor):
    def __init__(self, secret: str):
        if not secret:
            raise ValueError("INTERNAL_RPC_SECRET is not configured.")
        self._secret = secret.encode("utf-8")

    async def intercept_service(self, continuation, handler_call_details):
        # We can inspect headers before invoking continuation.
        metadata = dict(handler_call_details.invocation_metadata)
        token = metadata.get("authorization")

        is_valid = False
        if token and token.startswith("Bearer "):
            token_bytes = token[7:].encode("utf-8")
            is_valid = hmac.compare_digest(self._secret, token_bytes)

        if not is_valid:
            logger.warning(f"gRPC UNAUTHENTICATED: method={handler_call_details.method}")
            
            # To abort early in an aio interceptor without a context, we can define a dummy handler
            # that just aborts.
            async def abort_handler(request, context):
                await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid or missing credentials")
                
            return grpc.unary_unary_rpc_method_handler(abort_handler)

        return await continuation(handler_call_details)
