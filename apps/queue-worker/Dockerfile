FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable && mkdir -p /app && chown node:node /app

COPY --chown=node:node . .
USER node
RUN pnpm install --no-frozen-lockfile

ENV NODE_ENV=production
EXPOSE 8789
CMD ["pnpm", "--filter", "@jerico/queue-worker", "start"]
