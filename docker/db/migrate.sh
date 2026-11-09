#!/bin/sh
# Applies the Chambapp migrations that are not yet recorded, in folder order
# (shim, supabase, local). Each migration runs in ONE transaction together with its
# ledger row, under an advisory lock: an interruption leaves nothing half applied.
#
# Every file must be wrapped exactly once in "begin;" (first statement) and
# "commit;" (last statement), like the Supabase migrations. Only those two lines
# are removed; the runner supplies the real transaction.
#
# Environment: PGHOST, PGUSER, PGPASSWORD, PGDATABASE (libpq) and
# CHAMBAPP_AUTHENTICATOR_PASSWORD. CHAMBAPP_MIGRATION_DIRS overrides the folder list.
set -eu

ROOT=${CHAMBAPP_MIGRATIONS_ROOT:-/chambapp/migrations}
DIRS=${CHAMBAPP_MIGRATION_DIRS:-"shim supabase local"}
LOCK=7203120900
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

psqlq() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "chambapp-migrate: esperando a la base de datos..."
tries=0
until pg_isready -q; do
  tries=$((tries + 1))
  if [ "$tries" -gt 60 ]; then echo "chambapp-migrate: la base de datos no responde" >&2; exit 1; fi
  sleep 1
done

psqlq <<SQL
begin;
select pg_advisory_xact_lock($LOCK) as bloqueo \gset
create schema if not exists chambapp_local;
create table if not exists chambapp_local.migraciones (
  nombre text primary key,
  sha256 text not null,
  aplicada_en timestamptz not null default clock_timestamp()
);
revoke all on chambapp_local.migraciones from public;
commit;
SQL

applied=0
for dir in $DIRS; do
  [ -d "$ROOT/$dir" ] || continue
  for file in $(ls "$ROOT/$dir" | grep -E '^[A-Za-z0-9_.-]+\.sql$' | sort); do
    name="$dir/$file"
    path="$ROOT/$dir/$file"
    # Hash without CR, so Windows and Linux checkouts produce the same value.
    sum=$(tr -d '\r' < "$path" | sha256sum | cut -d' ' -f1)
    stored=$(psqlq -tA -v nombre="$name" <<'SQL'
select sha256 from chambapp_local.migraciones where nombre = :'nombre';
SQL
)
    if [ -n "$stored" ]; then
      if [ "$stored" != "$sum" ]; then
        echo "chambapp-migrate: $name ya se aplicó con otro contenido (sha256 $stored, ahora $sum)." >&2
        echo "chambapp-migrate: no se modifican migraciones aplicadas; crea una nueva." >&2
        exit 1
      fi
      continue
    fi

    # Strip exactly one leading "begin;" and one trailing "commit;" (statement lines).
    body="$WORK/body.sql"
    if ! tr -d '\r' < "$path" | awk '
      function stmt(line) { s = tolower(line); gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
      { lines[NR] = $0 }
      END {
        first = 0; last = 0; begins = 0; commits = 0
        for (i = 1; i <= NR; i++) {
          s = stmt(lines[i])
          if (s == "begin;") begins++
          if (s == "commit;") commits++
          if (!first && s != "" && substr(s, 1, 2) != "--") first = i
          if (s != "" && substr(s, 1, 2) != "--") last = i
        }
        if (begins != 1 || commits != 1 || stmt(lines[first]) != "begin;" || stmt(lines[last]) != "commit;") exit 3
        for (i = 1; i <= NR; i++) if (i != first && i != last) print lines[i]
      }' > "$body"; then
      echo "chambapp-migrate: $name debe empezar por \"begin;\" y terminar en \"commit;\" (una sola vez)." >&2
      exit 1
    fi

    cat > "$WORK/run.sql" <<SQL
begin;
select pg_advisory_xact_lock($LOCK) as bloqueo \gset
select exists(select 1 from chambapp_local.migraciones where nombre = :'nombre') as ya \gset
\if :ya
rollback;
\else
\i $body
insert into chambapp_local.migraciones(nombre, sha256) values (:'nombre', :'sha');
commit;
\endif
SQL
    echo "chambapp-migrate: aplicando $name"
    psqlq -v nombre="$name" -v sha="$sum" -f "$WORK/run.sql"
    applied=$((applied + 1))
  done
done

# PostgREST logs in as "authenticator" and switches to "authenticated".
if [ -n "${CHAMBAPP_AUTHENTICATOR_PASSWORD:-}" ]; then
  psqlq -v pw="$CHAMBAPP_AUTHENTICATOR_PASSWORD" <<'SQL'
select not exists(select 1 from pg_roles where rolname = 'authenticator') as crear \gset
\if :crear
create role authenticator login noinherit;
\endif
alter role authenticator with login noinherit password :'pw';
grant authenticated to authenticator;
grant anon to authenticator;
notify pgrst, 'reload schema';
SQL
fi

echo "chambapp-migrate: listo ($applied migraciones nuevas)."
