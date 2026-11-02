# ---- build the PWA with Expo (React Native Web) ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty = same origin; nginx proxies /api and /socket.io to the server container.
ARG EXPO_PUBLIC_API_URL=
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_NO_TELEMETRY=1
RUN npx expo export --platform web --output-dir dist

# ---- serve with nginx ----
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
