#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma

echo "Starting WranKey server..."
exec node packages/backend/dist/server.js
