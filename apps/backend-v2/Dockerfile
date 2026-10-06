FROM node:22-alpine AS deps
WORKDIR /app
# Install OpenSSL for Prisma
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma Client
RUN npx prisma generate
# Build NestJS app
RUN npm run build

# Production dependencies only (the Prisma CLI is one: the deploy step runs from this image).
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node package.json prisma.config.ts ./

# Document uploads still go to local disk (IMP-011): give the runtime user that directory only.
RUN mkdir -p uploads && chown node:node uploads

# Runs as the image's unprivileged 'node' user.
USER node

# Migrations are a separate deploy step: `npm run db:deploy:prod` (docs/reference/ops/BACKEND_DEPLOYMENT.md at the repo root).
# Railway manages port exposure automatically based on $PORT
CMD ["npm", "run", "start:prod"]
