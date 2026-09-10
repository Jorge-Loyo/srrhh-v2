# Contrato Docker — SRRHH v2

> Fuente de verdad sobre la infraestructura de contenedores del proyecto.
> Última actualización: 2026-09 (Post-Sprint 16 — revisión de reproducibilidad)
> Estado: APROBADO

---

## 1. Servicios del stack

| Servicio | Imagen base | Puerto interno | Puerto host (dev) | Puerto host (prod) |
|---|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | 5433 ¹ | no expuesto |
| `api` | `node:20-alpine` (custom) | 3000 | 3000 | no expuesto |
| `dotaneitor` | `python:3.11-slim` (custom) | 5001 | 5001 | no expuesto |
| `web` | `nginx:1.27-alpine` (custom) | 80 | — ² | no expuesto |
| `caddy` | `caddy:2-alpine` | 80/443 | — | 80 / 443 |

¹ Puerto 5433 en dev porque el 5432 está ocupado por PostgreSQL 18 nativo de Windows (ver `docker-compose.override.yml`).
² El frontend en dev corre nativo en Windows (Vite en puerto 5180), no en Docker.

---

## 2. Archivos de compose

| Archivo | Cuándo se usa | Descripción |
|---|---|---|
| `docker-compose.yml` | Dev (base) | Stack base: postgres + api + dotaneitor. Sin web ni caddy |
| `docker-compose.override.yml` | Dev (local, no commiteado) | Ajustes de esta máquina: postgres en 5433, CORS con puerto 5180 |
| `docker-compose.prod.yml` | Producción | Stack completo: + web (nginx) + caddy (TLS). Secrets via `.env.production` |

### Comando dev (siempre con los dos `-f`)

```bash
# desde WSL
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build
```

### Comando prod

```bash
cp .env.production.example .env.production  # completar valores reales
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

---

## 3. Dockerfiles

### `apps/api/Dockerfile` — desarrollo

- Base: `node:20-alpine`
- Instala `openssl` (requerido por el engine de Prisma)
- `pnpm install --frozen-lockfile` — reproducible
- Corre con `tsx watch src/app.ts` — hot reload al cambiar código fuente
- Build context: raíz del repo (necesita acceso a `packages/`, `prisma/`, `pnpm-workspace.yaml`)

### `apps/api/Dockerfile.prod` — producción (multi-stage)

**Stage 1 — build:**
- `pnpm install --frozen-lockfile` + `pnpm run build` (`tsc`)
- Genera el Prisma Client vía `postinstall`

**Stage 2 — runtime:**
- Copia solo `dist/`, `node_modules/` y `packages/` desde el stage de build
- Corre con `tsx dist/app.js` (no `node` puro — ver nota abajo)
- Imagen final sin toolchain de build

> **Por qué `tsx` y no `node` en prod:** `@srrhh/types` (`packages/types`) no tiene build propio —
> su `package.json` apunta `main`/`exports` directo a `./src/index.ts`. Node puro no puede parsear
> ese `.ts` al que apunta el symlink de pnpm. `tsx` lo transpila al vuelo sin activar el modo watch.
> Si en el futuro `packages/types` agrega un build real, se puede volver a `node dist/app.js`.

### `apps/web/Dockerfile.prod` — producción (multi-stage)

**Stage 1 — build:**
- `pnpm install --frozen-lockfile` + `pnpm run build` (Vite)
- `VITE_API_URL` se hornea en el bundle en build-time (comportamiento de Vite)

**Stage 2 — runtime:**
- nginx `1.27-alpine` sirviendo el bundle estático
- Config en `apps/web/nginx.prod.conf` con fallback SPA (`try_files ... /index.html`)

### `services/dotaneitor/Dockerfile` — dev y prod (mismo)

- Base: `python:3.11-slim`
- `pip install -r requirements.txt` con versiones pinneadas
- Corre con `uvicorn main:app`

---

## 4. Versiones pinneadas

### Node / pnpm

| Componente | Versión | Dónde se define |
|---|---|---|
| Node.js | 20-alpine | Todos los Dockerfiles |
| pnpm | 9.15.0 | `corepack prepare pnpm@9.15.0` en Dockerfiles + `packageManager` en `package.json` raíz |
| PostgreSQL | 16-alpine | `docker-compose.yml` y `docker-compose.prod.yml` |

> **Regla:** la versión de pnpm en los Dockerfiles debe coincidir siempre con el campo
> `packageManager` del `package.json` raíz. Si se actualiza uno, se actualiza el otro.

### Python / dotaneitor

Las dependencias de `services/dotaneitor/requirements.txt` están pinneadas con versiones exactas
obtenidas del contenedor en producción (`pip freeze`). Las principales:

| Paquete | Versión |
|---|---|
| fastapi | 0.141.1 |
| uvicorn | 0.52.4 |
| sqlalchemy | 2.0.52 |
| pandas | 3.0.5 |
| numpy | 2.4.6 |
| psycopg2-binary | 2.9.12 |
| pydantic | 2.13.5 |

> **Regla:** al actualizar una dependencia Python, correr `pip freeze` dentro del contenedor
> y actualizar `requirements.txt` con las versiones reales resultantes.

---

## 5. Variables de entorno

### Dev (`docker-compose.yml`)

Hardcodeadas en el YAML — valores de desarrollo, no secretos reales:

| Variable | Valor dev |
|---|---|
| `DATABASE_URL` | `postgresql://srrhh_user:srrhh_pass@postgres:5432/srrhh_db` |
| `JWT_SECRET` | `dev-secret-minimo-32-caracteres-cambiar` |
| `PYTHON_SERVICE_URL` | `http://dotaneitor:5001` |
| `NODE_ENV` | `development` |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:5180` |

### Prod (`.env.production` — gitignoreado)

Plantilla en `.env.production.example`. Variables obligatorias:

| Variable | Descripción |
|---|---|
| `DOMAIN` | Dominio o IP pública del servidor |
| `ACME_EMAIL` | Email para avisos de Let's Encrypt |
| `DB_PASSWORD` | Contraseña de Postgres — generar nueva, no reusar la de dev |
| `JWT_SECRET` | Mínimo 32 caracteres — generar nuevo, no reusar el de dev |
| `VITE_API_URL` | Vacío si Caddy sirve todo bajo el mismo dominio; URL completa si la API vive en otro dominio |

---

## 6. Red y seguridad

- En **dev**: todos los servicios exponen puertos al host para facilitar el debugging directo
- En **prod**: solo Caddy expone puertos (80/443). Postgres, API y Dotaneitor son alcanzables únicamente dentro de la red Docker interna
- Caddy gestiona TLS automáticamente vía Let's Encrypt si `DOMAIN` es un dominio público con 80/443 abiertos. Si es una IP interna, sirve HTTP plano sin configuración adicional

---

## 7. Healthchecks y dependencias

```
postgres (healthcheck: pg_isready)
    ↑ depends_on: service_healthy
api ──────────────────────────────── depends_on: postgres
dotaneitor ──────────────────────── depends_on: postgres
web ─────────────────────────────── depends_on: api  (prod)
caddy ───────────────────────────── depends_on: api + web  (prod)
```

El `healthcheck` de postgres garantiza que la API y Dotaneitor no arrancan hasta que la base de datos esté lista para aceptar conexiones.

---

## 8. Volúmenes persistentes

| Volumen | Servicio | Contenido |
|---|---|---|
| `postgres_data` | postgres | Datos de la base de datos |
| `dotaneitor_exports` | dotaneitor | Archivos Excel exportados por Dotaneitor |
| `caddy_data` | caddy | Certificados TLS (prod) |
| `caddy_config` | caddy | Configuración de Caddy (prod) |

> **Importante:** `postgres_data` es el volumen crítico. En producción, hacer backup periódico
> de este volumen antes de cualquier actualización del stack.

---

## 9. Primer deploy en servidor nuevo

```bash
# 1. Clonar el repo
git clone <repo-url>
cd SRRHH-Legacy

# 2. Configurar variables de entorno
cp .env.production.example .env.production
# editar .env.production con DOMAIN, ACME_EMAIL, DB_PASSWORD, JWT_SECRET

# 3. Levantar el stack
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 4. Aplicar migraciones (solo la primera vez o tras nuevas migraciones)
docker compose -f docker-compose.prod.yml exec api \
  node_modules/.bin/prisma migrate deploy --schema=/repo/prisma/schema.prisma

# 5. Correr el seed (solo la primera vez — crea hospitales, escalafones y usuario admin)
docker compose -f docker-compose.prod.yml exec api \
  node_modules/.bin/tsx /repo/prisma/seed.ts
```

**Usuario admin creado por el seed:**

| Usuario | Contraseña |
|---|---|
| `admin` | `Admin1234!` |

> Cambiar la contraseña del admin inmediatamente después del primer login en producción.

---

## 10. Actualizar el stack en producción

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# Si hay migraciones nuevas:
docker compose -f docker-compose.prod.yml exec api \
  node_modules/.bin/prisma migrate deploy --schema=/repo/prisma/schema.prisma
```

---

## 11. Comandos útiles de operación

```bash
# Ver estado de los contenedores
docker compose -f docker-compose.prod.yml ps

# Ver logs en tiempo real
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f dotaneitor

# Entrar a un contenedor
docker compose -f docker-compose.prod.yml exec api sh
docker compose -f docker-compose.prod.yml exec postgres psql -U srrhh_user -d srrhh_db

# Backup de la base de datos
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U srrhh_user srrhh_db > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U srrhh_user srrhh_db < backup_20260901.sql
```

---

## 12. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| API no arranca, error `Error loading shared libraries: libssl` | Falta `openssl` en la imagen Alpine | Ya resuelto en los Dockerfiles (`apk add openssl`). Si reaparece, verificar que no se haya tocado el Dockerfile |
| `pnpm install` falla con `ERR_PNPM_OUTDATED_LOCKFILE` | Versión de pnpm en el Dockerfile no coincide con el lockfile | Verificar que `corepack prepare pnpm@X.Y.Z` en el Dockerfile coincida con `packageManager` en `package.json` raíz |
| Dotaneitor falla al importar `sqlalchemy` o `pandas` | `requirements.txt` desactualizado o versión incompatible | Verificar versiones en `requirements.txt`; reconstruir imagen con `--build` |
| `prisma migrate deploy` falla con `P1001` (no puede conectar a la DB) | La DB no está lista aún | Esperar a que el healthcheck de postgres pase (`docker compose ps` muestra `healthy`) |
| Frontend muestra pantalla en blanco en rutas que no son `/` | nginx sin fallback SPA | Ya resuelto en `apps/web/nginx.prod.conf`. Si reaparece, verificar que el `try_files` esté presente |
| Caddy no obtiene certificado TLS | Puerto 80/443 no accesible desde internet, o `DOMAIN` es una IP | Verificar firewall del servidor. Si es IP interna, Caddy sirve HTTP plano — es el comportamiento esperado |
