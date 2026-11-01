FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
# Prepared on CI: the VDS cannot reach binaries.prisma.sh.
COPY .deploy/prisma/ /opt/prisma-engines/
ENV PRISMA_QUERY_ENGINE_LIBRARY=/opt/prisma-engines/libquery_engine-debian-openssl-3.0.x.so.node \
    PRISMA_SCHEMA_ENGINE_BINARY=/opt/prisma-engines/schema-engine-debian-openssl-3.0.x
RUN npm ci --ignore-scripts && node node_modules/prisma/build/index.js generate
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build /opt/prisma-engines/ /opt/prisma-engines/
ENV PRISMA_QUERY_ENGINE_LIBRARY=/opt/prisma-engines/libquery_engine-debian-openssl-3.0.x.so.node
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
