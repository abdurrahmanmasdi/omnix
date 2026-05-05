import logging
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

class LLMService:
    client: genai.Client;
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model_id = "gemini-2.5-flash"
        
    async def generate_response(self, user_message: str, context: str) -> str:
        logger.info("✍️ Generating AI response using new genai SDK...")
        
        system_instruction = f"""
        You are a highly professional and helpful sales assistant for a medical clinic. 
        Your goal is to answer patient inquiries accurately using ONLY the provided knowledge base context.

        CRITICAL RULES:
        1. LANGUAGE: You MUST detect the language of the USER MESSAGE and reply in that EXACT SAME language. If they speak English, translate the context and reply in English.
        2. FACTUALITY: If the answer is not in the context, politely state that you need to check with the medical team. Do NOT invent prices or procedures.
        3. TONE: Keep your answers concise, friendly, and formatted for a WhatsApp message.
        4. SECRECY: Do not mention "context", "database", or "documents". Just answer naturally.

        KNOWLEDGE BASE CONTEXT:
        {context}

        USER MESSAGE:
        {user_message}
        """

        # Strict typing for configurations
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.2,
        )

        try:
            # Execute async generation
            response = await self.client.aio.models.generate_content(
                model=self.model_id,
                contents=user_message,
                config=config
            )
            return response.text.strip()
            
        except Exception as e:
            logger.error(f"Failed to generate AI response: {e}")
            return "I apologize, but our system is currently updating. Please hold on."