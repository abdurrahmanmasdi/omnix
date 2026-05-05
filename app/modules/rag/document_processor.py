import fitz  # PyMuPDF
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import delete
from app.core.database import OrganizationKnowledge
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import AsyncOpenAI


class DocumentService:    
    def __init__(self, db_session: Session, api_key: str):
        self.db = db_session
        # Make sure to set your OpenAI API key in your environment variables!
        self.client = AsyncOpenAI(api_key=api_key)

    # Note: We now pass documentation_id so we can link the vectors!
    async def process_and_save_pdf(self, org_id: str, documentation_id: str, file_name: str, file_path: str) -> int:
        print(f"📄 Reading PDF: {file_path}")
        
        doc = fitz.open(file_path)
        full_text = "\n".join([page.get_text() for page in doc])

        # 🚀 Industry standard chunking
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,   # Roughly 150-250 words per chunk
            chunk_overlap=150, # 150 characters of overlap to maintain context between chunks
            length_function=len,
            is_separator_regex=False,
        )
        
        raw_chunks = text_splitter.split_text(full_text)
        chunks_saved = 0

        for chunk_text in raw_chunks:
            result = await self.client.embeddings.create(
                input=chunk_text,
                model="text-embedding-3-small",
            )
            
            embedding_vector = result.data[0].embedding

            new_chunk = OrganizationKnowledge(
                id=uuid.uuid4(),
                organizationId=org_id,
                documentationId=documentation_id, # Link it!
                file_name=file_name,
                content=chunk_text,
                embedding=embedding_vector
            )
            
            self.db.add(new_chunk)
            chunks_saved += 1

        self.db.commit()
        print(f"✅ Saved {chunks_saved} highly optimized vectorized chunks for {file_name}")
        return chunks_saved
    
    async def delete_file_knowledge(self, org_id: str, file_name: str) -> int:
        print(f"🗑️ Deleting knowledge vectors for {file_name}")
        
        # Delete all chunks matching the org_id and file_name
        stmt = delete(OrganizationKnowledge).where(
            OrganizationKnowledge.organizationId == org_id,
            OrganizationKnowledge.file_name == file_name
        )
        
        result = self.db.execute(stmt)
        self.db.commit()
        
        deleted_count = result.rowcount
        print(f"✅ Deleted {deleted_count} vector chunks for {file_name}.")
        return deleted_count