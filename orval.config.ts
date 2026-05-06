import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: 'http://localhost:3000/api-json', // Your NestJS Swagger JSON
    output: {
      mode: 'tags-split',
      target: 'src/lib/api/generated',
      schemas: 'src/lib/api/model',
      client: 'react-query',
      mock: false,
      override: {
        mutator: {
          path: 'src/lib/api/axios-client.ts',
          name: 'customFetch', // Must match the exported function name
        },
      },
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write',
    },
  },
});