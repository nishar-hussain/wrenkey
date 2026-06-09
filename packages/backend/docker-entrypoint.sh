#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma

echo "Starting ArKey server..."
exec node packages/backend/dist/server.js
