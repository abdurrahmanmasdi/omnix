import asyncio
from sqlalchemy import text
from app.core.database import SessionLocal

class DatabaseService:
    """
    OOP wrapper for Database operations.
    Uses asyncio.to_thread to prevent synchronous SQLAlchemy calls 
    from blocking the async event loop.
    """

    @staticmethod
    async def get_conversation_lead_info(conv_id: str):
        def _fetch():
            with SessionLocal() as db:
                query = text("""
                    SELECT c.id as conv_id, l.id as lead_id, l."firstName", l."lastName", l.gender, l.country, l.status, l.priority, c."externalContactId"
                    FROM conversations c
                    LEFT JOIN leads l ON c."leadId" = l.id 
                    WHERE c.id = :conv_id
                """)
                return db.execute(query, {"conv_id": conv_id}).fetchone()
        return await asyncio.to_thread(_fetch)

    @staticmethod
    async def get_conversation_history(conv_id: str, limit: int = 120):
        def _fetch():
            with SessionLocal() as db:
                query = text("""
                    SELECT content, type 
                    FROM messages 
                    WHERE "conversationId" = :conv_id 
                    ORDER BY "createdAt" ASC 
                    LIMIT :limit
                """)
                return db.execute(query, {"conv_id": conv_id, "limit": limit}).fetchall()
        return await asyncio.to_thread(_fetch)
