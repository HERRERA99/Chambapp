# Chambapp local edition — web image: the app built with VITE_EDITION=local, served by
# nginx (unprivileged), which also proxies /rest/v1/ to PostgREST.
# Build context: the repository root.

# Static files do not depend on the target architecture: build once on the host's.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# Public values (the cloud project's URL and publishable key) used only to package the
# browser extension offered for download. Without them the image has no downloads.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_PUBLISHABLE_KEY=""
RUN if [ -n "$VITE_SUPABASE_URL" ] && [ -n "$VITE_SUPABASE_PUBLISHABLE_KEY" ]; then \
      VITE_SUPABASE_URL="$VITE_SUPABASE_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
        npm run ext:pack; \
    else \
      echo "Sin VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY: la imagen no incluye la extensión para descargar."; \
    fi
RUN npm run build:local

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY docker/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV CHAMBAPP_PORT=47800
EXPOSE 8080

LABEL org.opencontainers.image.title="chambapp-local-web" \
      org.opencontainers.image.description="Chambapp local: la aplicación web y el proxy hacia la API"
