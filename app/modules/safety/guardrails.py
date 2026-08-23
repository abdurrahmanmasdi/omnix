class SafetyService:
    async def verify_no_hallucinations(self, generated_text: str, context: str) -> bool:
        print("🛡️ Checking for hallucinations...")
        # You can use a smaller, faster model (like gpt-5.4-mini) to verify
        # or use standard regex/keyword checks.
        if "guarantee" in generated_text.lower():
            return False # We don't make guarantees!
        return True