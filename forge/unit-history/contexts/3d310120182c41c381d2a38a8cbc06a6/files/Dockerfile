# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PATH=/app/node_modules/.bin:$PATH

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --include=optional --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node instructions ./instructions

USER node

EXPOSE 3000

ENTRYPOINT ["tini", "-s", "--"]
CMD ["node", "src/server/start.mjs"]
