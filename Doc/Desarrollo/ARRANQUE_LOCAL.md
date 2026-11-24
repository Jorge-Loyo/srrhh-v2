# Arranque local — SRRHH v2

> Cómo levantar la aplicación completa en esta máquina. Actualizado 2026-11-24 para reflejar
> el setup vigente: la API usa **Neon producción (`ep-little-river-aexgqwxz`)** vía `docker-compose.override.yml`.

---

## ⚡ Comandos rápidos (uso diario)

### 1) Backend — terminal WSL nº 1

```bash
wsl
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy

# Arranque normal (hot-reload activo: cambios en apps/api/src recargan solos)
docker compose up -d

# Con --build SOLO si cambiaron dependencias (package.json / pnpm-lock.yaml)
# o prisma/schema.prisma (el cliente Prisma se genera al construir la imagen):
docker compose up -d --build
```

Verificar que quedó sano:

```bash
curl -s http://localhost:3000/health     # API  -> {"status":"ok",...}
curl -s http://localhost:5001/health     # Dotaneitor
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
# Debe mostrar: srrhh_api, srrhh_dotaneitor, srrhh_postgres
```

### 2) Frontend (Vite) — terminal WSL nº 2

```bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
pnpm --filter @srrhh/web exec vite --port 5180
```

Tiene que mostrar `Local: http://localhost:5180/`.

### 3) Abrir la app

```
http://localhost:5180
```

Usuario/contraseña: `admin` / `Admin1234!`

### Utilidades del día a día

```bash
docker logs -f srrhh_api            # logs de la API en tiempo real
docker logs -f srrhh_dotaneitor     # logs del servicio Python

# Parar todo:
docker compose -f docker-compose.yml -f docker-compose.localdb.yml -f docker-compose.override.yml down
# ⚠️ NO usar `down -v`: borra el volumen postgres18_sync_data con todos los datos.
```

---

## Arquitectura de lo que se levanta

```
Neon producción (ep-little-river-aexgqwxz)  ←→  API Fastify (Docker, hot-reload)  ←→  Web Vite (WSL, nativo)
                                              ←→  Dotaneitor Python (Docker)
```

| Contenedor        | Imagen             | Puerto host | Base de datos                                    |
| ----------------- | ------------------ | ----------- | ------------------------------------------------ |
| `srrhh_postgres`  | postgres:16-alpine | 5432        | `srrhh_db` (levanta pero la API no lo usa)       |
| `srrhh_api`       | srrhh-legacy-api   | 3000        | Neon `ep-little-river-aexgqwxz` (vía override)  |
| `srrhh_dotaneitor`| (Dockerfile local) | 5001        | Neon `ep-little-river-aexgqwxz` (vía override)  |

**Por qué Neon en local:** el sprint de reestructuración de BD consolidó todo en Neon producción.
No hay BD local activa — `srrhh_postgres` (PG16) levanta para satisfacer el `depends_on` del compose
pero la API lo ignora porque `docker-compose.override.yml` sobreescribe `DATABASE_URL` con Neon.

**Compose files:**

| Archivo                        | Qué aporta                                                              |
| ------------------------------ | ----------------------------------------------------------------------- |
| `docker-compose.yml`           | Definición base: postgres16, api, dotaneitor                            |
| `docker-compose.override.yml`  | `DATABASE_URL` → Neon, hot-reload (volúmenes src), CORS 5180, polling  |

---

## Qué tiene cada archivo de configuración

### `.env` (raíz del repo — para API nativa fuera de Docker)

```
DATABASE_URL="postgresql://neondb_owner:npg_Sse7auT1knHB@ep-little-river-aexgqwxz-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

Solo se usa cuando corrés `pnpm --filter api dev` directamente en WSL/Windows (sin Docker).
El contenedor `srrhh_api` **ignora este archivo** — toma sus vars del compose.

### `docker-compose.override.yml` (local, no commitear cambios con secretos)

Contiene `DATABASE_URL` → Neon, hot-reload y CORS:

```yaml
services:
  api:
    environment:
      DATABASE_URL: postgresql://neondb_owner:npg_Sse7auT1knHB@ep-little-river-aexgqwxz-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
      CORS_ORIGINS: http://localhost:5173,http://localhost:5180
      CHOKIDAR_USEPOLLING: 'true'
    volumes:
      - ./apps/api/src:/repo/apps/api/src
      - ./packages/types/src:/repo/packages/types/src
      - ./packages/utils/src:/repo/packages/utils/src
      - ./prisma:/repo/prisma
```

---

## Primera vez / BD vacía — migraciones y seed

Neon ya tiene datos y migraciones aplicadas. Solo necesario si se trabaja contra una BD nueva:

```bash
# Desde WSL, con los contenedores arriba:

# 1. Aplicar migraciones
docker exec srrhh_api sh -c "npx prisma migrate deploy --schema=./prisma/schema.prisma"

# 2. Seed (escalafones, hospitales, RBAC, usuario admin)
docker exec -w /repo srrhh_api pnpm db:seed
```

**Usuario admin del seed:**

| Usuario | Contraseña   |
| ------- | ------------ |
| `admin` | `Admin1234!` |

El seed es idempotente (`upsert`) — se puede repetir sin duplicar nada.

> ⚠️ Correr los scripts **dentro del contenedor** (`docker exec ... srrhh_api`), no desde WSL
> directo. El `node_modules` del repo se instaló desde Windows y WSL ve el mismo disco —
> `tsx` revienta con `You installed esbuild for another platform`. El contenedor tiene su propio
> `node_modules` de Linux.

---

## URLs y accesos

| Servicio              | URL / conexión                                                              |
| --------------------- | --------------------------------------------------------------------------- |
| App (frontend)        | http://localhost:5180                                                       |
| API                   | http://localhost:3000                                                       |
| API health            | http://localhost:3000/health                                                |
| Dotaneitor            | http://localhost:5001                                                       |
| Dotaneitor health     | http://localhost:5001/health                                                |
| Neon (psql/Studio)    | `ep-little-river-aexgqwxz-pooler.c-2.us-east-2.aws.neon.tech` — ver `.env` |

---

## Comandos útiles sueltos

```bash
# Typecheck
pnpm --filter @srrhh/api exec tsc --noEmit
pnpm --filter @srrhh/web exec tsc --noEmit

# Prisma Studio (explorar la BD con UI) — apunta a Neon via .env
pnpm db:studio

# Re-correr seed (idempotente)
docker exec -w /repo srrhh_api pnpm db:seed

# Ver qué DATABASE_URL está usando el contenedor
docker exec srrhh_api printenv | grep DATABASE
```

---

## Troubleshooting

| Síntoma | Causa | Solución |
| ------- | ----- | -------- |
| `docker: command not found` | Estás en Git Bash/PowerShell, no en WSL | Escribí `wsl` primero |
| Login: "Usuario o contraseña incorrectos" + log `table 'public.usuarios' does not exist` | BD vacía, faltan migraciones | Correr migraciones y seed (ver sección anterior) |
| Login: 500 Internal Server Error | `docker-compose.override.yml` tiene URL de Neon vieja | Verificar que `DATABASE_URL` en el override apunta a `ep-little-river-aexgqwxz` |
| La API usa `postgres:5432/srrhh_db` en vez de Neon | `docker-compose.override.yml` no se aplicó | `docker exec srrhh_api printenv \| grep DATABASE` para confirmar; `docker compose up -d` desde la raíz del repo |
| Error de CORS en el browser | El origin del frontend no está en `CORS_ORIGINS` | Verificar `docker-compose.override.yml` tiene el puerto correcto y que se levantó con ese archivo |
| `vite` arranca en `5173` aunque se pidió `5180` | Se usó `pnpm ... dev -- --port 5180` (el `--` extra hace que vite no reciba el flag) | Usar `pnpm --filter @srrhh/web exec vite --port 5180` |
| `"vite" no se reconoce` en Git Bash/PowerShell | `node_modules/` se instaló desde WSL (binarios Linux) | Correr el front desde WSL, o reinstalar desde Windows |
| `tsx` tira `You installed esbuild for another platform` | Script corrido desde WSL contra `node_modules` de Windows | Correr dentro del contenedor: `docker exec -w /repo/apps/api srrhh_api pnpm exec tsx scripts/<script>.ts` |
| `EADDRINUSE 0.0.0.0:3000` | `srrhh_api` (Docker) ya ocupa el 3000 y se intentó levantar la API nativa también | No levantar la API nativa mientras el contenedor esté arriba |
| Endpoint nuevo da 404 pese a que el código está bien | El hot-reload no cubre cambios en `package.json` o schema Prisma | `docker compose ... up -d --build api` |
| `Unsupported engine: wanted node 22.x` (WARN) | WSL tiene Node 20; el repo declara 22 (Render usa 22) | Solo advertencia, no bloquea |

---

## Ver también

- `README.md` — setup genérico para una máquina nueva
- `Doc/Desarrollo/DEPLOY_PRODUCCION.md` — cómo deployar a Render y aplicar migraciones en Neon
