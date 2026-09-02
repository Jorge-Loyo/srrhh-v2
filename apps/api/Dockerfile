# Dev-only Dockerfile para @srrhh/api — corre con tsx watch (igual que `pnpm --filter @srrhh/api dev`).
# Build context = raíz del repo (ver docker-compose.yml: context: ., dockerfile: apps/api/Dockerfile).
FROM node:20-alpine

# Prisma (motor de schema/query) necesita libssl — sin esto el engine crashea
# al arrancar y ni siquiera devuelve JSON válido ("Error loading shared libraries").
RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo

# Copiar solo manifiestos primero para cachear la instalación de dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

# Ahora el código fuente
COPY apps/api apps/api
COPY packages packages

WORKDIR /repo/apps/api
EXPOSE 3000

# .env vacío: las variables reales las inyecta docker-compose (environment:).
# Node's --env-file no sobreescribe vars ya presentes en process.env, pero sí
# revienta con ENOENT si el archivo no existe — esto evita eso para cualquier
# script (dev, db:seed) que use --env-file=apps/api/.env o similar.
RUN touch .env

CMD ["pnpm", "exec", "tsx", "watch", "src/app.ts"]
