FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY tsconfig.json eslint.config.js ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data /app/logs /app/backups && chown -R node:node /app
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "process.exit(require('fs').existsSync('/app/data')?0:1)"
CMD ["node", "dist/index.js"]
