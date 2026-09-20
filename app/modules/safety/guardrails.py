class SafetyService:
    async def verify_no_hallucinations(self, generated_text: str, context: str) -> bool:
        # You can use a smaller, faster model (like gpt-5.4-mini) to verify
        # or use standard regex/keyword checks.
        if "guarantee" in generated_text.lower():
            return False # We don't make guarantees!
        return True

    async def verify_no_pii_leak(self, generated_text: str) -> bool:
        """Reject generated content that could expose encoded patient media."""
        normalized = generated_text.lower()
        return "data:image" not in normalized and "base64" not in normalized
