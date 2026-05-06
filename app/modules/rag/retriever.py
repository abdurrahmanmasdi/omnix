from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import OrganizationKnowledge

class RAGRetriever:
    
    client: genai.Client;
    def __init__(self, db_session: Session, gemini_api_key: str):
        self.db = db_session
        self.client = genai.Client(api_key=gemini_api_key)

    async def get_relevant_context(self, org_id: str, query: str) -> str:
        print(f"🔍 Embedding user query: '{query}'")
        
        # 1. Turn the user's WhatsApp message into a vector
        result = await self.client.aio.models.embed_content(
            model='gemini-embedding-001',
            contents=query,
             # This config tells Google to compress the 3072 vector down to 768
            config=types.EmbedContentConfig(output_dimensionality=768)
        )
        query_vector = result.embeddings[0].values

        # 2. Search pgvector for the top 4 most relevant chunks
        print(f"🧠 Searching pgvector for closest matches...")
        stmt = select(OrganizationKnowledge.content)\
            .filter(OrganizationKnowledge.organizationId == org_id)\
            .order_by(OrganizationKnowledge.embedding.cosine_distance(query_vector))\
            .limit(4) 

        results = self.db.execute(stmt).scalars().all()

        if not results:
            print("⚠️ No relevant context found in the database.")
            return "No specific clinic documentation found."

        print(f"✅ Found {len(results)} relevant chunks.")
        # Combine the paragraphs into one string for the LLM
        return "\n\n---\n\n".join(results)