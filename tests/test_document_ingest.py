"""WP-C C4.1: synthetic PDFs, mocked embeddings/transactions; no model/DB calls."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import fitz
import grpc
import pytest
from sqlalchemy.sql.elements import TextClause

from app.grpc_services import document_servicer
from app.modules.rag import document_processor
from app.modules.rag.document_processor import DocumentService


class MemoryTransaction:
    def __init__(self):
        self.rows = []
        self.committed = []
        self.statements = []
        self.fail_commit = False

    def execute(self, statement, parameters=None):
        self.statements.append((statement, parameters))
        if not isinstance(statement, TextClause):
            params = statement.compile().params
            self.rows = [row for row in self.rows if not (
                row.organizationId == params['organizationId_1'] and
                row.documentationId == params['documentationId_1']
            )]
        return SimpleNamespace(rowcount=0)

    def add_all(self, rows):
        self.rows.extend(rows)

    def add(self, row):
        self.rows.append(row)

    def commit(self):
        if self.fail_commit:
            raise RuntimeError('synthetic database failure')
        self.committed = self.rows.copy()

    def rollback(self):
        self.rows = self.committed.copy()


@pytest.fixture
def ingest(monkeypatch):
    with fitz.open() as pdf:
        page = pdf.new_page()
        page.insert_text((72, 72), 'Synthetic clinic knowledge.')
        content = pdf.tobytes()
    embed = AsyncMock(return_value=SimpleNamespace(data=[SimpleNamespace(embedding=[0.0] * 3072)]))
    monkeypatch.setattr(document_processor.LLMFactory, 'get_async_openai_client', lambda: SimpleNamespace(embeddings=SimpleNamespace(create=embed)))
    db = MemoryTransaction()
    return DocumentService(db), db, content, embed


def process(service, content, doc='doc-a', org='org-a', name='same.pdf'):
    return asyncio.run(service.process_and_save_pdf(org, doc, name, content))


def test_reingest_replaces_only_the_same_document_in_the_same_clinic(ingest):
    service, db, content, _ = ingest
    process(service, content)
    process(service, content, doc='doc-b')
    process(service, content, org='org-b')
    process(service, content, name='renamed.pdf')
    assert len(db.rows) == 3
    assert [(row.organizationId, row.documentationId, row.file_name) for row in db.rows] == [
        ('org-a', 'doc-b', 'same.pdf'), ('org-b', 'doc-a', 'same.pdf'), ('org-a', 'doc-a', 'renamed.pdf'),
    ]
    # Concurrent replacements serialize on a transaction-scoped lock, before DELETE.
    lock, params = db.statements[-2]
    assert 'pg_advisory_xact_lock' in str(lock)
    assert params == {'document_key': 'org-a:doc-a'}


def test_embedding_failure_keeps_previously_committed_chunks(ingest):
    service, db, content, embed = ingest
    process(service, content)
    before = db.rows.copy()
    embed.side_effect = RuntimeError('synthetic embedding failure')
    with pytest.raises(RuntimeError):
        process(service, content)
    assert db.rows == before


def test_failed_replacement_rolls_back_the_delete_and_inserts(ingest):
    service, db, content, _ = ingest
    process(service, content)
    before = db.rows.copy()
    db.fail_commit = True
    with pytest.raises(RuntimeError):
        process(service, content)
    assert db.rows == before


def test_size_cap_precedes_pdf_parsing_and_embedding(ingest, monkeypatch):
    service, db, _, embed = ingest
    parser = MagicMock(side_effect=AssertionError('must not parse oversized PDF'))
    monkeypatch.setattr(document_processor.fitz, 'open', parser)
    with pytest.raises(ValueError, match='PDF_TOO_LARGE'):
        process(service, b'x' * (10 * 1024 * 1024 + 1))
    parser.assert_not_called()
    embed.assert_not_awaited()
    assert not db.statements


def test_rpc_rejects_oversized_pdf_before_creating_database_or_client(monkeypatch):
    db_factory = MagicMock(side_effect=AssertionError('must not open DB'))
    monkeypatch.setattr(document_servicer, 'SessionLocal', db_factory)
    context = SimpleNamespace(set_code=MagicMock(), set_details=MagicMock())
    request = SimpleNamespace(organizationId='org-a', documentationId='doc-a', fileName='large.pdf', fileContent=b'x' * (10 * 1024 * 1024 + 1))
    response = asyncio.run(document_servicer.DocumentProcessorServicer().IngestPdf(request, context))
    assert not response.success
    context.set_code.assert_called_once_with(grpc.StatusCode.RESOURCE_EXHAUSTED)
    context.set_details.assert_called_once_with('PDF_TOO_LARGE')
    db_factory.assert_not_called()
