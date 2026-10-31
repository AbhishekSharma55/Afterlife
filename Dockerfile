# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
# The optional CA is only for environments using an HTTPS egress proxy.
# It never becomes part of the image, and normal TLS verification stays enabled.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --no-audit --no-fund
COPY apps/server/tsconfig.json apps/server/tsconfig.json
COPY apps/server/src apps/server/src
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/shared/src packages/shared/src
COPY apps/web/index.html apps/web/index.html
COPY apps/web/tsconfig.json apps/web/tsconfig.json
COPY apps/web/vite.config.ts apps/web/vite.config.ts
COPY apps/web/src apps/web/src
COPY apps/web/public apps/web/public
# The frontend's current tsconfig includes test files during its build typecheck.
COPY apps/web/test apps/web/test
# Frontend previews import these explicitly labeled rehearsal snapshots at build time.
COPY docs/afterlife/fixtures docs/afterlife/fixtures
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310 WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
USER node
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4310)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/server.js"]
