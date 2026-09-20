"""
Seed organization battlecards from the clinic knowledge base.

Run inside the python-ai-service environment with DATABASE_URL and OPENAI_API_KEY set:

    cd python-ai-service-v2
    python scripts/seed_battlecards.py <organization_id>

The script generates OpenAI embeddings for each battlecard so the fetch_battlecard
vector search can match patient objections.
"""

import asyncio
import sys
import uuid
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.infrastructure.llm_factory import EMBEDDING_MODEL, EMBEDDING_DIMENSIONS
from langchain_openai import OpenAIEmbeddings


BATTLECARDS = [
    {
        "competitorName": "Generic / Market",
        "objectionType": "PRICE",
        "rebuttalText": (
            "We use premium implant systems such as Straumann (Swiss, lifetime warranty) "
            "and Nobel Biocare (US/Swiss) because long-term safety and success matter most. "
            "Our pricing reflects the quality of materials, the experience of our surgeons, "
            "and the comprehensive follow-up care included in your treatment plan."
        ),
    },
    {
        "competitorName": "Generic / Market",
        "objectionType": "QUALITY",
        "rebuttalText": (
            "Our lead surgeon is a consultant in oral and maxillofacial surgery with 15+ years "
            "of experience, trained at Istanbul University, and a member of the European Board "
            "for Oral Implantology (EAO). We combine clinical expertise with digital smile design "
            "technology for predictable, natural results."
        ),
    },
    {
        "competitorName": "Generic / Market",
        "objectionType": "FEAR",
        "rebuttalText": (
            "Implant placement is performed under local anesthesia, so you will not feel pain "
            "during the procedure. Mild soreness afterward is normal and manageable with standard "
            "pain relief. We also provide a clear step-by-step guide and are available for any "
            "post-operative concerns."
        ),
    },
    {
        "competitorName": "Generic / Market",
        "objectionType": "PROCESS",
        "rebuttalText": (
            "A standard Hollywood Smile design typically requires 2-3 sessions: examination and "
            "preparation, prototype try-in, and final placement. Veneers such as Lumineers may "
            "need only two visits because they require minimal or no enamel reduction."
        ),
    },
    {
        "competitorName": "Generic / Market",
        "objectionType": "LOCATION",
        "rebuttalText": (
            "Our clinic is centrally located with easy access, open Saturday through Monday. "
            "We welcome international and local patients and offer flexible payment options, "
            "including installment plans, to make treatment accessible."
        ),
    },
]


def seed_battlecards(organization_id: str) -> None:
    if not organization_id:
        raise ValueError("organization_id is required")

    try:
        uuid.UUID(organization_id)
    except ValueError as exc:
        raise ValueError("organization_id must be a valid UUID") from exc

    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    embeddings = OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        dimensions=EMBEDDING_DIMENSIONS,
        api_key=settings.OPENAI_API_KEY,
    )

    try:
        inserted = 0
        for card in BATTLECARDS:
            text_to_embed = (
                f"Competitor: {card['competitorName']}\n"
                f"Objection: {card['objectionType']}\n"
                f"Rebuttal: {card['rebuttalText']}"
            )
            vector = embeddings.embed_query(text_to_embed)

            db.execute(
                text("""
                    INSERT INTO organization_battlecards (
                        id, "organizationId", "competitorName", "objectionType", "rebuttalText", embedding
                    ) VALUES (
                        gen_random_uuid(), :org_id, :competitor, :objection, :rebuttal, :embedding
                    )
                """),
                {
                    "org_id": organization_id,
                    "competitor": card["competitorName"],
                    "objection": card["objectionType"],
                    "rebuttal": card["rebuttalText"],
                    "embedding": str(vector),
                },
            )
            inserted += 1

        db.commit()
        print(f"Inserted {inserted} battlecards for organization {organization_id}")
    except Exception as e:
        db.rollback()
        print(f"Failed to seed battlecards: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/seed_battlecards.py <organization_id>")
        sys.exit(1)

    seed_battlecards(sys.argv[1])
