import grpc
import rag_pb2
import rag_pb2_grpc
from app.modules.rag.document_processor import DocumentService
from app.modules.rag.experience_processor import ExperienceProcessor
from app.core.database import SessionLocal
from app.core.config import settings

class DocumentProcessorServicer(rag_pb2_grpc.DocumentProcessorServicer):
    async def IngestPdf(self, request, context):
        org_id = getattr(request, 'organizationId', getattr(request, 'organization_id', None))
        doc_id = getattr(request, 'documentationId', getattr(request, 'documentation_id', None))
        file_name = getattr(request, 'fileName', getattr(request, 'file_name', None))
        file_content = getattr(request, 'fileContent', getattr(request, 'file_content', None))

        print(f"📥 [gRPC] NestJS asked to ingest PDF: {file_name}")
        
        db = SessionLocal()
        try:
            doc_service = DocumentService(db_session=db, api_key=settings.OPENAI_API_KEY)
            
            chunks = await doc_service.process_and_save_pdf(
                org_id=org_id,
                documentation_id=doc_id,
                file_name=file_name,
                file_content=file_content
            )
            
            return rag_pb2.IngestResponse(success=True, chunksProcessed=chunks)
        except Exception as e:
            print(f"❌ Error processing PDF: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return rag_pb2.IngestResponse(success=False, chunksProcessed=0)
        finally:
            db.close()

    async def EmbedExperience(self, request, context):
        processor = ExperienceProcessor()
        success = await processor.embed_and_save_experience(
            experience_id=request.experience_id,
            org_id=request.organization_id
        )
        
        if success:
            return rag_pb2.EmbedExperienceResponse(
                success=True, 
                message="Vector generated and saved successfully."
            )
        else:
            return rag_pb2.EmbedExperienceResponse(
                success=False, 
                message="Failed to generate vector."
            )

    async def DeleteFile(self, request, context):
        print(f"📥 [gRPC] NestJS asked to delete vectors for: {request.fileName}")
        
        db = SessionLocal()
        try:
            doc_service = DocumentService(db_session=db, api_key=settings.OPENAI_API_KEY)
            deleted_count = await doc_service.delete_file_knowledge(
                org_id=request.organizationId,
                file_name=request.fileName
            )
            return rag_pb2.DeleteResponse(success=True, chunksDeleted=deleted_count)
        except Exception as e:
            print(f"❌ Error deleting vectors: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return rag_pb2.DeleteResponse(success=False, chunksDeleted=0)
        finally:
            db.close()
