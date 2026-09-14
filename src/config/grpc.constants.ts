import { join } from 'path';

const PROTO_ROOT = join(__dirname, '../proto');
export const GRPC_CONFIG = {
  // Python Server (NestJS is the Client)
  PYTHON_SERVER_URL: 'localhost:50051',

  // NestJS Server (Python is the Client)
  NEST_SERVER_URL: 'localhost:50052',

  PACKAGES: {
    AGENT: 'agent',
    RAG: 'rag',
    TOOLS: 'tools',
  },

  SERVICES: {
    SALES_AGENT: 'SalesAgent',
    DOCUMENT_PROCESSOR: 'DocumentProcessor',
    CRM_TOOLS: 'CrmTools',
  },

  PROTO_PATHS: {
    AGENT: join(PROTO_ROOT, 'agent.proto'),
    RAG: join(PROTO_ROOT, 'rag.proto'),
    TOOLS: join(PROTO_ROOT, 'tools.proto'),
  },
};
