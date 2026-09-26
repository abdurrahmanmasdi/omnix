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
    async def get_conversation_lead_info(conv_id: str, org_id: str):
        def _fetch():
            with SessionLocal() as db:
                query = text("""
                    SELECT c.id as conv_id, l.id as lead_id, l."firstName", l."lastName", l.gender, l.country, l.status, l.priority, c."externalContactId"
                    FROM conversations c
                    LEFT JOIN leads l ON c."leadId" = l.id 
                    WHERE c.id = :conv_id AND c."organizationId" = :org_id
                """)
                return db.execute(query, {"conv_id": conv_id, "org_id": org_id}).fetchone()
        return await asyncio.to_thread(_fetch)


    @staticmethod
    async def get_messages_by_ids(message_ids: list[str], conv_id: str, org_id: str):
        if not message_ids:
            return []
        def _fetch():
            with SessionLocal() as db:
                return db.execute(
                    text('SELECT m.id, m.content, m.type, m."mediaUrl", m."createdAt" FROM messages m JOIN conversations c ON m."conversationId" = c.id WHERE m.id = ANY(:message_ids) AND m."conversationId" = :conv_id AND c."organizationId" = :org_id ORDER BY m."createdAt" ASC'),
                    {"message_ids": message_ids, "conv_id": conv_id, "org_id": org_id}
                ).fetchall()
        return await asyncio.to_thread(_fetch)

    @staticmethod
    async def get_conversation_history(conv_id: str, org_id: str, limit: int = 120):
        def _fetch():
            with SessionLocal() as db:
                query = text("""
                    SELECT sub.id, sub.content, sub.type FROM (
                        SELECT m.id, m.content, m.type, m."createdAt"
                        FROM messages m
                        JOIN conversations c ON m."conversationId" = c.id
                        WHERE m."conversationId" = :conv_id AND c."organizationId" = :org_id
                        ORDER BY m."createdAt" DESC
                        LIMIT :limit
                    ) sub
                    ORDER BY sub."createdAt" ASC
                """)
                return db.execute(query, {"conv_id": conv_id, "org_id": org_id, "limit": limit}).fetchall()
        return await asyncio.to_thread(_fetch)
