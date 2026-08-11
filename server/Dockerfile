# Multi-stage build: the toolchain stays in the builder, so the runtime image ships
# only compiled JS, production deps and the generated Prisma client.

FROM node:22-alpine AS builder
WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npx tsc -p tsconfig.json

# ---------------------------------------------------------------------------

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# `prisma migrate deploy` runs at container start, so the CLI must be present.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts && npx prisma generate && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Run unprivileged; the node image already ships a `node` user.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
