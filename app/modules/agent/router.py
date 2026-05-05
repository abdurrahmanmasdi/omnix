from google import genai
from google.genai import types

class IntentRouter:
    def __init__(self, api_key: str):
        # We use flash because it's insanely fast for simple classification
        
        self.client = genai.Client(api_key=api_key)
        self.model_id = "gemini-2.5-flash"

    async def requires_knowledge_search(self, message: str) -> bool:
        prompt = f"""
        Analyze the user's message in a medical clinic sales chat.
        Does the user's message require looking up specific clinic information (like prices, medical procedures, doctor details, or location)?
        
        If it's a greeting ("hi"), a simple acknowledgement ("okay thanks"), or small talk, return FALSE.
        If it asks a specific question about the clinic or services, return TRUE.

        Respond with ONLY the word TRUE or FALSE.

        User Message: "{message}"
        """

        # Strict typing for configurations
        config = types.GenerateContentConfig(
            system_instruction=prompt,
            temperature=0.2,
        )
        
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_id,
                contents=message,
                config=config
            )
            result = response.text.strip().upper()
            
            if "TRUE" in result:
                return True
            return False
            
        except Exception as e:
            print(f"⚠️ Router failed, defaulting to True for safety: {e}")
            return True # Safe fallback: if the router breaks, just search the DB