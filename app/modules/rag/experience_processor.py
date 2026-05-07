import os
from sqlalchemy.orm import Session
from langchain_openai import OpenAIEmbeddings
from sqlalchemy.orm import Session
from app.core.database import OrganizationExperience, SessionLocal
from app.core.config import settings

class ExperienceProcessor:
    def __init__(self):
        # Initialize OpenAI Embeddings (Flagship 3072)
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-large", 
            dimensions=3072,
            api_key=settings.OPENAI_API_KEY
        )

    async def embed_and_save_experience(self, experience_id: str, org_id: str) -> bool:
        db: Session = SessionLocal()
        try:
            # 1. Fetch the newly created experience from the database
            experience = db.query(OrganizationExperience).filter(
                OrganizationExperience.id == experience_id,
                OrganizationExperience.organizationId == org_id
            ).first()

            if not experience:
                print(f"❌ Experience {experience_id} not found in DB.")
                return False

            print(f"🧠 Generating vector for story: {experience.title}")

            # 2. Concatenate the data so the vector captures the FULL context
            # We add the country and procedure to the text so the math knows exactly what this story is about.
            text_to_embed = f"""
            Title: {experience.title}
            Patient Country: {experience.patientCountry or 'Unknown'}
            Procedure: {experience.procedureType or 'General'}
            Story: {experience.storyText}
            """

            # 3. Call OpenAI to get the 3072-number array
            vector = await self.embeddings.aembed_query(text_to_embed)

            # 4. Save the vector into PostgreSQL
            experience.embedding = vector
            db.commit()

            print(f"✅ Successfully saved 3072-dim vector for Experience {experience_id}")
            return True

        except Exception as e:
            print(f"❌ Error embedding experience: {e}")
            db.rollback()
            return False
        finally:
            db.close()