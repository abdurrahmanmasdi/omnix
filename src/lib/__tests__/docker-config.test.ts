// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Docker browser configuration', () => {
  it('exposes the socket URL in the builder before Next inlines public variables', () => {
    const dockerfile = readFileSync(new URL('../../../Dockerfile', import.meta.url), 'utf8');
    const builder = dockerfile.split('FROM base AS builder')[1].split('FROM base AS runner')[0];
    expect(builder).toContain('ARG NEXT_PUBLIC_SOCKET_URL');
    expect(builder).toContain('ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL');
    expect(builder.indexOf('ENV NEXT_PUBLIC_SOCKET_URL=')).toBeLessThan(builder.indexOf('RUN npm run build'));
  });
});
