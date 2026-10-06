import { join } from 'path';

const PROTO_ROOT = join(__dirname, '../proto');
export const GRPC_CONFIG = {
  PACKAGES: {
    AGENT: 'agent',
    RAG: 'rag',
  },

  SERVICES: {
    SALES_AGENT: 'SalesAgent',
    DOCUMENT_PROCESSOR: 'DocumentProcessor',
  },

  PROTO_PATHS: {
    AGENT: join(PROTO_ROOT, 'agent.proto'),
    RAG: join(PROTO_ROOT, 'rag.proto'),
  },
};
