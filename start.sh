#!/bin/sh
set -e
echo "==> Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma
echo "==> Starting API..."
node apps/api/dist/app.js
