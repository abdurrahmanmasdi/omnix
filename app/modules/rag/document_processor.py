import logging
import uuid

import fitz  # PyMuPDF
from sqlalchemy.orm import Session
from sqlalchemy import delete
from app.core.database import OrganizationKnowledge
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.infrastructure.llm_factory import EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, LLMFactory

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, db_session: Session):
        self.db = db_session
        self.client = LLMFactory.get_async_openai_client()

    async def process_and_save_pdf(self, org_id: str, documentation_id: str, file_name: str, file_content: bytes) -> int:
        logger.info("DOCUMENT_PROCESS_STARTED documentation_id=%s", documentation_id)
        
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
        logger.info("DOCUMENT_PROCESS_COMPLETE documentation_id=%s chunks=%d", documentation_id, chunks_saved)
        return chunks_saved
    
    async def delete_file_knowledge(self, org_id: str, file_name: str) -> int:
        logger.info("DOCUMENT_VECTORS_DELETE_STARTED organization_id=%s", org_id)
        
        stmt = delete(OrganizationKnowledge).where(
            OrganizationKnowledge.organizationId == org_id,
            OrganizationKnowledge.file_name == file_name
        )
        
        result = self.db.execute(stmt)
        self.db.commit()
        
        deleted_count = result.rowcount
        logger.info("DOCUMENT_VECTORS_DELETE_COMPLETE organization_id=%s chunks=%d", org_id, deleted_count)
        return deleted_count
