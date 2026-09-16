import logging
import uuid

import fitz  # PyMuPDF
from openai import AsyncOpenAI
from sqlalchemy.orm import Session
from sqlalchemy import delete
from app.core.database import OrganizationKnowledge
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.infrastructure.llm_factory import EMBEDDING_MODEL, EMBEDDING_DIMENSIONS

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, db_session: Session, api_key: str):
        self.db = db_session
        self.client = AsyncOpenAI(api_key=api_key)

    async def process_and_save_pdf(self, org_id: str, documentation_id: str, file_name: str, file_content: bytes) -> int:
        logger.info("Processing PDF: %s", file_name)
        
        doc = fitz.open(stream=file_content, filetype="pdf")
        full_text = "\n".join([page.get_text() for page in doc])

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=150,
            length_function=len,
            is_separator_regex=False,
        )
        
        raw_chunks = text_splitter.split_text(full_text)
        chunks_saved = 0

        for chunk_text in raw_chunks:
            response = await self.client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=chunk_text,
                dimensions=EMBEDDING_DIMENSIONS
            )
            
            embedding_vector = response.data[0].embedding

            new_chunk = OrganizationKnowledge(
                id=uuid.uuid4(),
                organizationId=org_id,
                documentationId=documentation_id,
                file_name=file_name,
                content=chunk_text,
                embedding=embedding_vector
            )
            
            self.db.add(new_chunk)
            chunks_saved += 1

        self.db.commit()
        logger.info("Saved %d vectorized chunks for %s", chunks_saved, file_name)
        return chunks_saved
    
    async def delete_file_knowledge(self, org_id: str, file_name: str) -> int:
        logger.info("Deleting knowledge vectors for %s", file_name)
        
        stmt = delete(OrganizationKnowledge).where(
            OrganizationKnowledge.organizationId == org_id,
            OrganizationKnowledge.file_name == file_name
        )
        
        result = self.db.execute(stmt)
        self.db.commit()
        
        deleted_count = result.rowcount
        logger.info("Deleted %d vector chunks for %s", deleted_count, file_name)
        return deleted_count
