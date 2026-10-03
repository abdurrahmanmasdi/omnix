import logging
import uuid

import fitz  # PyMuPDF
from sqlalchemy.orm import Session
from sqlalchemy import delete, text
from app.core.database import OrganizationKnowledge
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.infrastructure.llm_factory import EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, LLMFactory

logger = logging.getLogger(__name__)

# Match the Nest upload boundary (10 MiB); check before parsing or embedding.
MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024


def validate_pdf_size(file_content: bytes) -> None:
    if len(file_content) > MAX_PDF_SIZE_BYTES:
        raise ValueError("PDF_TOO_LARGE")


class DocumentService:
    def __init__(self, db_session: Session):
        self.db = db_session
        self.client = LLMFactory.get_async_openai_client()

    async def process_and_save_pdf(self, org_id: str, documentation_id: str, file_name: str, file_content: bytes) -> int:
        validate_pdf_size(file_content)
        if not org_id or not documentation_id:
            raise ValueError("DOCUMENT_ID_REQUIRED")
        logger.info("DOCUMENT_PROCESS_STARTED documentation_id=%s", documentation_id)
        
        with fitz.open(stream=file_content, filetype="pdf") as doc:
            full_text = "\n".join(page.get_text() for page in doc)

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=150,
            length_function=len,
            is_separator_regex=False,
        )
        
        raw_chunks = text_splitter.split_text(full_text)
        new_chunks = []

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
            
            new_chunks.append(new_chunk)

        # Embed first, so provider failures preserve the previous committed knowledge.
        # Serialize concurrent re-ingests across processes without extra table grants.
        # Lock + tenant/document DELETE + INSERT share one transaction.
        try:
            self.db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:document_key, 0))"),
                {"document_key": f"{org_id}:{documentation_id}"},
            )
            self.db.execute(delete(OrganizationKnowledge).where(
                OrganizationKnowledge.organizationId == org_id,
                OrganizationKnowledge.documentationId == documentation_id,
            ))
            self.db.add_all(new_chunks)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        chunks_saved = len(new_chunks)
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
