# All-in-one image for one-click cloud hosting (Railway, Render): the Flock server plus the web app
# (PWA) on the same address, so opening the URL in a browser is all a person needs.
# For your own server use the install script or docker-compose.yml instead.

# ---- the web app ----
FROM node:24-bookworm-slim AS web
WORKDIR /client
COPY apps/client/package.json apps/client/package-lock.json ./
# postinstall applies these (patch-package).
COPY apps/client/patches ./patches
RUN npm ci --no-audit --no-fund
COPY apps/client/ ./
# Empty API address: the web app talks to the server on its own origin.
ENV EXPO_PUBLIC_API_URL= \
    EXPO_NO_TELEMETRY=1
RUN npx expo export --platform web --output-dir /web

# ---- the server, serving the web app ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    WEB_DIR=/app/web
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
# The in-app changelog; the version comes from server/package.json (kept equal to the release).
COPY RELEASE_NOTES.md RELEASE_NOTES.fa.md ./
COPY --from=web /web ./web
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "src/index.js"]
