# Arranque local — SRRHH v2

> Cómo levantar la aplicación completa en esta máquina. Actualizado 2026-11-xx para reflejar
> el setup vigente: la API usa **`srrhh_sync` (Postgres 18 local)**, no Neon ni el postgres 16 viejo.

---

## ⚡ Comandos rápidos (uso diario)

### 1) Backend — terminal WSL nº 1

```bash
wsl
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy

# Arranque normal (hot-reload activo: cambios en apps/api/src recargan solos)
docker compose -f docker-compose.yml -f docker-compose.localdb.yml -f docker-compose.override.yml up -d

# Con --build SOLO si cambiaron dependencias (package.json / pnpm-lock.yaml)
# o prisma/schema.prisma (el cliente Prisma se genera al construir la imagen):
docker compose -f docker-compose.yml -f docker-compose.localdb.yml -f docker-compose.override.yml up -d --build
```

Verificar que quedó sano:

```bash
curl -s http://localhost:3000/health     # API  -> {"status":"ok",...}
curl -s http://localhost:5001/health     # Dotaneitor
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
# Debe mostrar: srrhh_api, srrhh_dotaneitor, srrhh_postgres18
# srrhh_postgres (PG16) NO debe aparecer — está deshabilitado con scale:0
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
Postgres 18 (srrhh_sync, Docker)  ←→  API Fastify (Docker, hot-reload)  ←→  Web Vite (WSL, nativo)
                                   ←→  Dotaneitor Python (Docker)
```

| Contenedor        | Imagen             | Puerto host | Base de datos                  |
| ----------------- | ------------------ | ----------- | ------------------------------ |
| `srrhh_postgres18`| postgres:18-alpine | 5434        | `srrhh_sync`                   |
| `srrhh_api`       | srrhh-legacy-api   | 3000        | `postgres_sync:5432/srrhh_sync`|
| `srrhh_dotaneitor`| (Dockerfile local) | 5001        | `postgres_sync:5432/srrhh_sync`|

**Por qué PG18 y no el PG16 viejo:** Neon (producción) corre PG18. Un dump de `pg_dump 18` no se
restaura de forma segura en PG16. `srrhh_postgres` (PG16) está definido en `docker-compose.yml`
para satisfacer el `depends_on` del base, pero `docker-compose.localdb.yml` lo deshabilita con
`scale: 0` — nunca levanta.

**Por qué tres compose files:**

| Archivo                        | Qué aporta                                                              |
| ------------------------------ | ----------------------------------------------------------------------- |
| `docker-compose.yml`           | Definición base: postgres16, api, dotaneitor                            |
| `docker-compose.localdb.yml`   | Deshabilita postgres16, levanta postgres18 (`srrhh_sync`), fija `DATABASE_URL` |
| `docker-compose.override.yml`  | Hot-reload (volúmenes src), CORS con puerto 5180, polling de FS         |

---

## Qué tiene cada archivo de configuración

### `.env` (raíz del repo — para API nativa fuera de Docker)

```
DATABASE_URL="postgresql://srrhh_user:srrhh_pass@localhost:5434/srrhh_sync"
```

Solo se usa cuando corrés `pnpm --filter api dev` directamente en WSL/Windows (sin Docker).
El contenedor `srrhh_api` **ignora este archivo** — toma sus vars del compose.

### `docker-compose.override.yml` (local, no commitear cambios con secretos)

Solo contiene hot-reload y CORS — **no toca `DATABASE_URL`**, eso lo maneja `localdb.yml`:

```yaml
services:
  api:
    environment:
      CORS_ORIGINS: http://localhost:5173,http://localhost:5180
      CHOKIDAR_USEPOLLING: 'true'
    volumes:
      - ./apps/api/src:/repo/apps/api/src
      - ./packages/types/src:/repo/packages/types/src
      - ./packages/utils/src:/repo/packages/utils/src
      - ./prisma:/repo/prisma
  dotaneitor:
    command: uvicorn main:app --host 0.0.0.0 --port 5001 --reload
    volumes:
      - ./services/dotaneitor:/app
```

---

## Primera vez / BD vacía — migraciones y seed

Si `srrhh_postgres18` acaba de crearse (volumen nuevo) o la BD está vacía:

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
| Postgres sync (psql)  | `localhost:5434` — usuario `srrhh_user`, pass `srrhh_pass`, db `srrhh_sync` |

---

## Comandos útiles sueltos

```bash
# Typecheck
pnpm --filter @srrhh/api exec tsc --noEmit
pnpm --filter @srrhh/web exec tsc --noEmit

# Prisma Studio (explorar la BD con UI) — apunta a srrhh_sync via .env
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
| `srrhh_postgres` aparece en `docker ps` | Se levantó sin `docker-compose.localdb.yml` | Bajar todo y levantar con los tres `-f` |
| La API usa `postgres:5432/srrhh_db` en vez de `postgres_sync:5432/srrhh_sync` | Idem anterior | `docker exec srrhh_api printenv \| grep DATABASE` para confirmar; levantar con los tres compose files |
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
