#!/bin/bash
# backup-db.sh - Automated Supabase database backup script
# Takes a full logical dump of the Supabase PostgreSQL database.

set -e

# Default to local Supabase DB if DB_URL is not set
DB_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:54322/postgres"}

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="supabase/backups"
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

echo "Starting database backup to $BACKUP_FILE..."

# If pg_dump is not installed, we can fall back to a docker execution if running locally
if command -v pg_dump &> /dev/null; then
    pg_dump --clean --if-exists --quote-all-identifiers \
        --exclude-schema=auth --exclude-schema=storage --exclude-schema=pgbouncer \
        --schema=public "$DB_URL" > "$BACKUP_FILE"
else
    echo "Warning: pg_dump not found locally. Attempting via supabase CLI (requires running local project)."
    # npx supabase db dump can be used as an alternative
    npx supabase db dump --data-only -f "$BACKUP_FILE"
fi

echo "Backup completed successfully: $BACKUP_FILE"
