import logging
import asyncio
from types import SimpleNamespace

from app.grpc_services import document_servicer
from app.modules.agent import tools


def test_tool_and_provider_errors_keep_private_values_out_of_logs(monkeypatch, caplog):
    private_values = [
        "S11_PATIENT_TEXT_40b7",
        "S11_PHONE_06da",
        "S11_ACCESS_TOKEN_527e",
        "S11_CRM_TOKEN_b0fe",
        "S11_MEDIA_URL_d9ac",
    ]
    db = SimpleNamespace(close=lambda: None)
    monkeypatch.setattr(tools, "SessionLocal", lambda: db)
    monkeypatch.setattr(document_servicer, "SessionLocal", lambda: db)

    class FailingRetriever:
        def __init__(self, **kwargs):
            pass

        async def get_relevant_context(self, org_id, query):
            raise RuntimeError(" ".join(private_values))

    class FailingDocumentService:
        def __init__(self, **kwargs):
            pass

        async def process_and_save_pdf(self, **kwargs):
            raise RuntimeError(" ".join(private_values))

    monkeypatch.setattr(tools, "RAGRetriever", FailingRetriever)
    monkeypatch.setattr(document_servicer, "DocumentService", FailingDocumentService)

    details = []
    context = SimpleNamespace(set_code=lambda code: None, set_details=details.append)
    request = SimpleNamespace(
        organizationId="org-s11",
        documentationId="doc-s11",
        fileName=private_values[1],
        fileContent=b"synthetic",
    )

    async def exercise():
        tool_result = await tools.search_clinic_knowledge.coroutine(
            private_values[0], config={"configurable": {"organization_id": "org-s11"}}
        )
        response = await document_servicer.DocumentProcessorServicer().IngestPdf(
            request, context
        )
        return tool_result, response

    with caplog.at_level(logging.INFO):
        tool_result, response = asyncio.run(exercise())

    assert isinstance(tool_result, str)
    assert response.success is False
    assert details == ["DOCUMENT_INGEST_FAILED"]
    captured = "\n".join(record.getMessage() for record in caplog.records)
    assert "KNOWLEDGE_SEARCH_FAILED" in captured
    assert "DOCUMENT_INGEST_FAILED document_id=doc-s11" in captured
    assert not any(value in captured for value in private_values)
