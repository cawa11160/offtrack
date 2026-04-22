#!/bin/sh
set -eu

is_enabled() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

if is_enabled "${OFFTRACK_AUTO_MIGRATE:-true}"; then
  python docker_bootstrap.py
  alembic -c alembic.ini upgrade head
fi

if is_enabled "${OFFTRACK_AUTO_SEED:-true}"; then
  export OFFTRACK_SEED_SKIP_IF_READY="${OFFTRACK_SEED_SKIP_IF_READY:-true}"
  python seed_db.py
fi

exec "$@"
