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
    async def ping():
        """Readiness probe: one trivial query, off the event loop."""
        def _ping():
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
        await asyncio.to_thread(_ping)

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

    @staticmethod
    async def get_clinic_knowledge(org_id: str, max_chars: int) -> str | None:
        """Existing clinic-uploaded knowledge; None means use retrieval instead.

        The schema has no approval flag: clinic approval remains an upload/ops
        prerequisite. Do not mistake document processing status for approval.
        Bound returned text even if knowledge changes between the two reads.
        """
        if not org_id:
            raise ValueError("Knowledge requires tenant context")

        def _fetch():
            with SessionLocal() as db:
                size = db.execute(text(
                    'SELECT COALESCE(SUM(length(content)), 0) + GREATEST(COUNT(*) - 1, 0) * 2 '
                    'FROM organization_knowledge WHERE "organizationId" = :org_id'
                ), {"org_id": org_id}).scalar_one()
                if size > max_chars:
                    return None
                rows = db.execute(text(
                    'SELECT left(content, :text_limit) FROM organization_knowledge '
                    'WHERE "organizationId" = :org_id ORDER BY "createdAt", id LIMIT :row_limit'
                ), {"org_id": org_id, "text_limit": max_chars + 1,
                    "row_limit": max_chars + 1}).scalars().all()
                content = "\n\n".join(rows)
                return content if len(content) <= max_chars else None
        return await asyncio.to_thread(_fetch)
