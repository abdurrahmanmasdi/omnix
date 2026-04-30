export const KNOWLEDGE_ENGINE_PORT = Symbol('KNOWLEDGE_ENGINE_PORT');

export interface KnowledgeEnginePort {
  uploadDocument(
    file: Express.Multer.File,
    organizationId: string,
  ): Promise<any>;
}
