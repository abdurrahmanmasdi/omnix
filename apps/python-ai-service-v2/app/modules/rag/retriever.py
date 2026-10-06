import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import OrganizationKnowledge
from app.infrastructure.llm_factory import EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, LLMFactory

logger = logging.getLogger(__name__)


class RAGRetriever:
    def __init__(self, db_session: Session):
        self.db = db_session
        self.client = LLMFactory.get_async_openai_client()

    async def get_relevant_context(self, org_id: str, query: str) -> str:
        # 1. Turn the user's WhatsApp message into a vector
        response = await self.client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=query,
            dimensions=EMBEDDING_DIMENSIONS
        )
        query_vector = response.data[0].embedding

        # 2. Search pgvector for the top 4 most relevant chunks
        stmt = select(OrganizationKnowledge.content)\
            .filter(OrganizationKnowledge.organizationId == org_id)\
            .order_by(OrganizationKnowledge.embedding.cosine_distance(query_vector))\
            .limit(4) 

        # Run synchronous SQLAlchemy in a thread to avoid blocking the event loop
        results = await asyncio.to_thread(
            lambda: self.db.execute(stmt).scalars().all()
        )

        if not results:
            logger.warning("No relevant context found for org %s", org_id)
            return "UNVERIFIED: No clinic documentation was found for this question."

        logger.info("Found %d relevant chunks for org %s", len(results), org_id)
        return "\n\n---\n\n".join(results)
