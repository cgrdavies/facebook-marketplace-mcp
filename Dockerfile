FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends build-essential python3 && \
  rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim

ENV NODE_ENV=production \
  MCP_TRANSPORT=http \
  HOST=0.0.0.0 \
  PORT=3000 \
  FB_MARKETPLACE_STORAGE_DIR=/data

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /data && chown -R node:node /app /data

USER node
EXPOSE 3000

CMD ["node", "dist/index.js"]
