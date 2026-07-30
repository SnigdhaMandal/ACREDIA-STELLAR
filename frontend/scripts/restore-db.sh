#!/bin/bash
# restore-db.sh - Automated Supabase database restore script
# Restores a logical dump into the database.

set -e

BACKUP_FILE=$1
DB_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:54322/postgres"}

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: ./restore-db.sh <path_to_backup_file.sql>"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file $BACKUP_FILE not found."
    exit 1
fi

echo "Starting database restore from $BACKUP_FILE to $DB_URL..."

if command -v psql &> /dev/null; then
    psql "$DB_URL" < "$BACKUP_FILE"
else
    echo "Warning: psql not found locally. Attempting via supabase CLI (requires running local project)."
    # Fallback to Supabase CLI
    npx supabase db execute --file "$BACKUP_FILE"
fi

echo "Restore completed successfully."
