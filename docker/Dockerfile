FROM node:22-alpine AS dependencies

WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN pnpm build

FROM dependencies AS migration
COPY . .
USER node
FROM node:22-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=builder /workspace/dist ./dist
COPY package.json ./
USER node
CMD ["pnpm", "start:gateway"]
