# Chambapp local edition — database image: PostgreSQL 17 + every migration + the runner.
# Build context: the repository root.
FROM postgres:17-alpine

COPY docker/db/shim /chambapp/migrations/shim
COPY supabase/migrations /chambapp/migrations/supabase
COPY docker/db/local /chambapp/migrations/local
COPY docker/db/migrate.sh /usr/local/bin/chambapp-migrate
# Windows checkouts may add CR line endings.
RUN sed -i 's/\r$//' /usr/local/bin/chambapp-migrate && chmod 0755 /usr/local/bin/chambapp-migrate

LABEL org.opencontainers.image.title="chambapp-local-db" \
      org.opencontainers.image.description="Base de datos de Chambapp local (PostgreSQL 17 con las migraciones)"
