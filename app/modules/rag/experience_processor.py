import logging

from sqlalchemy.orm import Session
from app.core.database import OrganizationExperience, SessionLocal
from app.infrastructure.llm_factory import EMBEDDING_DIMENSIONS, LLMFactory

logger = logging.getLogger(__name__)


class ExperienceProcessor:
    def __init__(self):
        self.embeddings = LLMFactory.get_embeddings()

    async def embed_and_save_experience(self, experience_id: str, org_id: str) -> bool:
        db: Session = SessionLocal()
        try:
            experience = db.query(OrganizationExperience).filter(
                OrganizationExperience.id == experience_id,
                OrganizationExperience.organizationId == org_id
            ).first()

            if not experience:
                logger.error("Experience %s not found in DB", experience_id)
                return False

            logger.info("EXPERIENCE_EMBED_STARTED experience_id=%s", experience_id)

            text_to_embed = f"""
            Title: {experience.title}
            Patient Country: {experience.patientCountry or 'Unknown'}
            Procedure: {experience.procedureType or 'General'}
            Story: {experience.storyText}
            """

            vector = await self.embeddings.aembed_query(text_to_embed)

            experience.embedding = vector
            db.commit()

            logger.info("Saved %d-dim vector for Experience %s", EMBEDDING_DIMENSIONS, experience_id)
            return True

        except Exception:
            logger.error("EXPERIENCE_EMBED_FAILED experience_id=%s", experience_id)
            db.rollback()
            return False
        finally:
            db.close()
