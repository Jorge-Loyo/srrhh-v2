# Arranque local — SRRHH v2

> Cómo levantar la aplicación completa en esta máquina para ir probando. Basado en lo verificado
> de punta a punta el 2026-08-25 (Sprint 2 y 3) — no es solo la teoría del `README.md`, son los
> pasos reales con los problemas que aparecieron y cómo se resolvieron.

---

## ⚡ Comandos rápidos (uso diario) — vigente desde 2026-11-07

> **Estado actual de esta máquina:** todo se corre **desde WSL** (backend en Docker + Vite en WSL),
> y la API dockerizada apunta a **Neon** (la misma base que producción), no al Postgres local.
> Detalle y motivos en "Qué cambió respecto a antes" más abajo.

### 1) Backend (Postgres + API + Dotaneitor) — terminal WSL nº 1

```bash
wsl
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy

# Arranque normal (hot-reload: los cambios en apps/api/src NO piden rebuild)
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d

# Con --build SOLO si cambiaron dependencias (package.json / pnpm-lock.yaml, ej. pdfkit)
# o prisma/schema.prisma:
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build
```

Verificar que quedó sano:

```bash
curl -s http://localhost:3000/health     # API  -> {"status":"ok",...}
curl -s http://localhost:5001/health     # Dotaneitor
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'   # srrhh_api, srrhh_dotaneitor, srrhh_postgres
```

### 2) Frontend (Vite) — terminal WSL nº 2

```bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
pnpm --filter @srrhh/web exec vite --port 5180
```

Tiene que mostrar `Local: http://localhost:5180/`. Si muestra `5173`, el flag no se pasó (ver
Troubleshooting).

### 3) Abrir la app

```
http://localhost:5180
```

Usuario/contraseña: ver sección 6 (el admin vive en la base a la que apunte el override, hoy Neon).

### Utilidades del día a día

```bash
docker logs -f srrhh_api            # logs de la API (hot-reload, errores de arranque)
docker logs -f srrhh_dotaneitor     # logs del servicio Python
docker compose -f docker-compose.yml -f docker-compose.override.yml down     # parar todo
# ⚠️ NO usar `down -v`: borra el volumen del Postgres local.
```

### Qué cambió respecto a antes (2026-11-07)

1. **La base ya no es la local.** `docker-compose.override.yml` fija `DATABASE_URL` de `api` y
   `dotaneitor` a **Neon, conexión directa (`:5432`, sin pooler)**. Los contenedores
   `srrhh_postgres` siguen levantando (la API declara `depends_on`) pero **la API no los usa**.
   Para volver a la base local: quitar esas dos líneas `DATABASE_URL` del override y recrear.
   (El override es local y está fuera de git; **no copiar su contraseña a ningún documento**.)
2. **Hot-reload dentro del contenedor.** El override monta `apps/api/src`, `packages/types/src`,
   `packages/utils/src` y `prisma/` y activa polling: editar código del backend recarga la API
   sola. Rebuild (`--build`) solo si cambian dependencias o el schema de Prisma (el cliente
   Prisma se genera al construir la imagen).
3. **El frontend corre en WSL, no en Windows.** `node_modules/` es **uno solo** para WSL y
   Windows (mismo disco). El último `pnpm install` define dónde funcionan `vite`/`tsx`: si se
   instaló desde WSL quedan binarios Linux y en Git Bash/PowerShell `vite` "no se reconoce"; si se
   instaló desde Windows pasa al revés (`esbuild for another platform` en WSL). **Elegir un solo
   entorno.** Hoy: WSL. Para volver a Windows hay que correr `pnpm install` desde Windows.
4. **Comando del front:** `pnpm --filter @srrhh/web exec vite --port 5180`. El
   `pnpm ... dev -- --port 5180` **no pasa el flag** (vite arranca en 5173) y
   `--filter web` solo funciona si se resuelve el nombre; el paquete se llama `@srrhh/web`.
5. **No levantar la API nativa** (`pnpm --filter @srrhh/api dev`) mientras `srrhh_api` esté
   arriba: choca en el puerto 3000 (`EADDRINUSE`) y además lee `apps/api/.env`, cuyo
   `DATABASE_URL` es el **pooler de Neon (`:6432`)**, que puede colgarse. Ver sección 5.

### Seed de Áreas Programáticas / CeSACs (pestaña "Área Programática" del Organigrama)

> Si la pestaña **Área Programática** (dentro de Organigrama) aparece **vacía**, es porque este
> catálogo (Sprint 23) **no entra en `db:seed` ni en `migrate deploy`** — es un paso aparte que hay
> que correr una vez (tras un `migrate reset`, una BD nueva, o traer el merge de Agustín por
> primera vez). Las tablas `areas_programaticas`/`cesacs`/`unidades_fijas_apayc` se crean vacías
> con la migración; el contenido del Anexo III y el vínculo con los cargos se cargan con estos dos
> scripts, **en orden**:

```bash
# 1. Seed del catálogo (13 AP + 52 CeSACs + 7 unidades fijas). Idempotente (upsert).
docker exec -w /repo/apps/api srrhh_api pnpm exec tsx scripts/seed_areas_programaticas.ts

# 2. Backfill: vincula los cargos del padrón ya cargado a su CeSAC/unidad fija.
#    Correr primero con --dry-run para ver qué va a tocar, después sin el flag.
docker exec -w /repo/apps/api srrhh_api pnpm exec tsx scripts/backfill_areas_programaticas.ts --dry-run
docker exec -w /repo/apps/api srrhh_api pnpm exec tsx scripts/backfill_areas_programaticas.ts
```

> ⚠️ **Correr los scripts DENTRO del contenedor (`docker exec ... srrhh_api`), NO desde WSL con
> `pnpm exec tsx` directo.** Si los corrés desde WSL, `tsx` revienta con
> `You installed esbuild for another platform...` (`@esbuild/win32-x64` presente, Linux necesita
> `@esbuild/linux-x64`): los `node_modules` del repo se instalaron desde Windows y WSL ve el mismo
> disco. El contenedor `srrhh_api` tiene su propio `node_modules` de Linux correcto y el
> `DATABASE_URL` ya apunta a `postgres:5432` (no hay que pasarlo).
>
> **El backfill necesita el padrón ya cargado.** Vincula cargos reales → sin padrón procesado, el
> seed carga igual la estructura (la pestaña ya muestra las 13 AP/52 CeSACs), pero los conteos de
> "cargos vigentes" y los jefes salen en 0 hasta que proceses un padrón.
>
> **Verificar que quedó cargado:**
>
> ```bash
> docker exec srrhh_postgres psql -U srrhh_user -d srrhh_db -t -c "SELECT 'areas_programaticas' AS t, count(*) FROM areas_programaticas UNION ALL SELECT 'cesacs', count(*) FROM cesacs UNION ALL SELECT 'unidades_fijas', count(*) FROM unidades_fijas_apayc UNION ALL SELECT 'cargos_con_cesac', count(*) FROM cargos WHERE cesac_id IS NOT NULL UNION ALL SELECT 'cargos_con_unidad_fija', count(*) FROM cargos WHERE unidad_fija_id IS NOT NULL;"
> ```
>
> Esperado: 13 AP / 52 CeSACs / 7 unidades fijas / N cargos vinculados (N depende del padrón
> cargado — ~1.500 cargos→CeSAC con el padrón de 52.839 cargos del 2026-10). Los pocos cargos
> "sin vincular" que reporta el backfill (roles `SECC Coordinación CESACs A/B`, códigos satélite)
> son casos de borde esperados, no un error.

---

## 🆕 Arranque con BD nueva desde cero (post-consolidación S21, 2026-09-22)

> Este es el camino a seguir para levantar el proyecto con una **base nueva** (borrando la que se
> tenga) sobre el historial de migraciones **consolidado** (`0_init` + `0_seed`, ver
> `Doc/Planificacion/Sprints/SPRINT_21...` → "Consolidación del historial"). Es el procedimiento que
> se le pasa a otro dev que toma este código: su BD vieja se descarta.

```bash
# 1. Traer el código (rama con S21/S22)
git pull

# 2. Instalar dependencias (enlaza los workspaces: @srrhh/normalizacion, @srrhh/types)
pnpm install

# 3. Levantar Postgres local en Docker (desde WSL) — :5433
wsl
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build

# 4. Reset de la BD: BORRA todo y aplica el historial limpio (0_init + 0_seed).
#    0_init = estructura; 0_seed = datos duros (ref_*, hospitales, RBAC).
pnpm exec prisma migrate reset --force --skip-generate

# 5. Seed de datos (escalafones, codigos_registro, catálogo puesto/especialidad
#    normalizado, usuario admin). El migrate reset intenta correr el seed solo pero
#    falla ("tsx" no está global) — es esperado; se corre a mano con el script del repo:
pnpm run db:seed

# 6. Regenerar el cliente Prisma (por si el reset lo salteó con --skip-generate)
pnpm exec prisma generate

# 7. Cargar un padrón (módulo Dotaneitor por la UI, o el flujo habitual) para tener cargos reales.

# 8. Seed + backfill de Áreas Programáticas (Sprint 23) — NO lo cubre db:seed.
#    Requiere la API dockerizada arriba (usa el node_modules de Linux del contenedor).
#    Ver la sección "Seed de Áreas Programáticas / CeSACs" arriba para el detalle.
docker exec -w /repo/apps/api srrhh_api pnpm exec tsx scripts/seed_areas_programaticas.ts
docker exec -w /repo/apps/api srrhh_api pnpm exec tsx scripts/backfill_areas_programaticas.ts
```

**Resultado esperado del seed** (verificado 2026-09-22):

```
✅ Hospitales: 35
✅ Escalafones: 16
✅ Códigos de registro: 7
✅ Usuario admin creado (admin / Admin1234!)
✅ Catálogo puesto/especialidad: 514 puestos, 2043 especialidades
```

> ⚠️ **El seed automático del `migrate reset` falla con `"tsx" no se reconoce`** — el binario no
> está en el PATH global. **No es un error real**: correr `pnpm run db:seed` a mano después (usa el
> `tsx` del workspace). El seed es idempotente (`upsert`), se puede repetir sin duplicar.
>
> ⚠️ **NO usar `migrate deploy` + crear migraciones nuevas sobre el historial viejo.** El historial
> se consolidó de ~84 migraciones a 2 (`0_init` + `0_seed`). Si tenías una BD/rama con el historial
> viejo, el único camino es `migrate reset` sobre el nuevo (borra y recrea).

---

## 1. Arquitectura de lo que se levanta

```
PostgreSQL (Docker)  ←→  API Fastify (Docker)  ←→  Web Vite (nativo, Windows)
                     ←→  Dotaneitor Python (Docker)
```

- **Postgres, API y Dotaneitor** corren en contenedores Docker (WSL2).
- **El frontend (Vite) corre nativo (fuera de Docker)** — `docker-compose.yml` no tiene servicio
  `web`. Hoy se corre **desde WSL** (ver "Qué cambió respecto a antes", punto 3); antes se corría
  desde Windows.
- **Base de datos:** desde 2026-11 el override apunta `api` y `dotaneitor` a **Neon (directa,
  `:5432`)**, la misma base que producción. El Postgres local de Docker queda levantado pero sin
  uso. Consecuencia: **lo que se ve en `localhost:5180` es el dato real**; cuidado con probar
  cosas destructivas.

---

## 2. Requisitos

| Herramienta                   | Dónde vive                    | Notas                                                                                                |
| ----------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| Docker Desktop (backend WSL2) | Windows, gestionado desde WSL | El CLI `docker` **no está en el PATH de Git Bash/PowerShell** — solo funciona desde una terminal WSL |
| Node 20+, pnpm 9+             | Windows                       | Para correr Vite y los comandos `pnpm` sueltos (typecheck, prisma, etc.)                             |
| WSL (Ubuntu)                  | Windows                       | Para todo lo que sea `docker compose ...`                                                            |

### Entrar a WSL

Desde Git Bash, PowerShell o CMD:

```
wsl
```

Te deja en una terminal Ubuntu parada donde sea que la hayas dejado. El proyecto se ve en
`/mnt/c/Desarrollo/SRH/SRRHH-Legacy` (la misma carpeta que `C:\Desarrollo\SRH\SRRHH-Legacy` en
Windows, dos vistas del mismo disco).

---

## 3. Levantar el backend (Postgres + API + Dotaneitor)

**En WSL — siempre con el override para CORS y puerto correcto:**

```bash
wsl
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build
```

> **Importante:** desde WSL hay que pasar los dos `-f` explícitamente. Sin el override, `CORS_ORIGINS` solo tiene el puerto 5173 y el frontend en 5180 recibe error de CORS.

- `--build` es importante la **primera vez** y **cada vez que cambia código** de `apps/api`.

### Verificar que están sanos

```bash
curl -s http://localhost:3000/health   # API
curl -s http://localhost:5001/health   # Dotaneitor
docker compose ps                      # los 3 containers "Up"/"healthy"
```

### Primera vez con una base vacía — migraciones y seed

> Aplica a la **base local de Docker** (`localhost:5433`). Mientras el override apunte a Neon
> (estado actual), la API **no usa** esa base y esto no hace falta. Las migraciones contra Neon
> se aplican a mano y hay que marcarlas como resueltas antes de pushear: ver
> `Doc/Desarrollo/DEPLOY_PRODUCCION.md`, sección 7.

Si `docker compose ps` muestra los containers arriba pero la app no tiene datos (tablas vacías):

```bash
cd /c/Desarrollo/SRH/SRRHH-Legacy
DATABASE_URL="postgresql://srrhh_user:srrhh_pass@localhost:5433/srrhh_db" \
  pnpm exec prisma migrate deploy --schema=./prisma/schema.prisma

pnpm db:seed
```

> `prisma migrate dev` (el que crea migraciones nuevas) necesita una terminal interactiva y **no
> corre así, en un pipe o script no-interactivo** — tira `Error: Prisma Migrate has detected that
the environment is non-interactive`. Para aplicar migraciones ya existentes alcanza con
> `migrate deploy`. Para crear una migración nueva a mano (sin `migrate dev`), ver el historial de
> `Doc/Planificacion/PLAN_SCRUM_2026.md` (sección de hallazgos de Sprint 2) — se hizo con
> `prisma migrate diff` + `prisma migrate resolve --applied`.

El seed es idempotente (usa `upsert`), se puede correr de nuevo sin miedo a duplicar nada.

**Usuario admin del seed:**

| Usuario | Contraseña   |
| ------- | ------------ |
| `admin` | `Admin1234!` |

---

## 4. Levantar el frontend (Vite, nativo)

**Desde WSL (vigente hoy):**

```bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
pnpm --filter @srrhh/web exec vite --port 5180
```

**Desde Windows (Git Bash, PowerShell o CMD)** — solo si el último `pnpm install` se corrió desde
Windows (ver "Qué cambió", punto 3):

```bash
cd C:\Desarrollo\SRH\SRRHH-Legacy
pnpm --filter @srrhh/web exec vite --port 5180
```

### ⚠️ Por qué `--port 5180` y no el 5173 por defecto

En esta máquina el puerto 5173 (default de Vite) ya lo ocupa **otra aplicación ajena a este
proyecto** ("TorneoApp"). Si corrés `pnpm dev` o `vite` sin `--port`, Vite puede fallar con
`Port 5173 is already in use` (con `--strictPort`) o, peor, un `curl`/health-check contra ese
puerto puede dar un falso positivo pegándole a la otra app en vez de a esta. Usar siempre
`--port 5180` para este proyecto en esta máquina.

`docker-compose.override.yml` (local, no se sube a git) ya tiene `CORS_ORIGINS` con el 5180
habilitado en la API dockerizada, así que no hace falta tocar nada más para que el frontend en
5180 pueda hablar con la API en 3000.

### Abrir la app

```
http://localhost:5180
```

---

## 5. Alternativa: API nativa en vez de Docker (no verificada a fondo)

> ⚠️ **No usar mientras `srrhh_api` esté arriba** (2026-11-07): ambos quieren el puerto 3000
> (`EADDRINUSE`). Además la API nativa lee `apps/api/.env`, cuyo `DATABASE_URL` apunta al
> **pooler de Neon (`:6432`)**; ese pooler se colgó (`psql` sin respuesta) mientras la conexión
> directa `:5432` respondía bien. La API dockerizada usa la directa por el override, por eso
> no se vio afectada. Para desarrollar el backend usar el hot-reload del contenedor (sección
> "Comandos rápidos").

`pnpm dev` en la raíz (`turbo run dev`) levanta API + Web en paralelo, ambos nativos en Node,
usando `apps/api/.env`. Es más rápido para iterar en el backend sin rebuildear la imagen Docker
cada vez, pero:

- **Corrección 2026-09-08**: esta sección decía que `apps/api/.env` "ya apunta a `localhost:5433`"
  — es falso, verificado contra el archivo real: apunta a `localhost:5432`. Si vas a usar este
  camino (API nativa), el `DATABASE_URL` para `migrate deploy`/`db:seed` es el de **5432**, no el
  5433 de la sección 3 (que es para cuando la API también corre en Docker). Si en tu máquina no hay
  nada escuchando en 5432, hay que decidir si `apps/api/.env` se actualiza a 5433 o si se levanta
  un Postgres nativo ahí — no asumas uno u otro sin confirmarlo.

- Sigue necesitando Postgres levantado en Docker (`docker compose up -d postgres` desde WSL).
- `apps/api/.env` solo tiene `CORS_ORIGINS="http://localhost:5173"` — si el frontend corre en
  5180 (ver sección 4), hay que agregar `,http://localhost:5180` a mano ahí también (a diferencia
  de la versión dockerizada, esto no lo cubre `docker-compose.override.yml`).
- No se probó de punta a punta en la sesión del 2026-08-25 (se usó Docker para la API todo el
  tiempo) — si algo no anda con este camino, no asumir que es un bug real sin antes comparar
  contra el camino dockerizado de la sección 3.

---

## 6. URLs y accesos

| Servicio              | URL                                                                       |
| --------------------- | ------------------------------------------------------------------------- |
| App (frontend)        | http://localhost:5180                                                     |
| API                   | http://localhost:3000                                                     |
| API health            | http://localhost:3000/health                                              |
| Dotaneitor            | http://localhost:5001                                                     |
| Dotaneitor health     | http://localhost:5001/health                                              |
| Postgres (desde host) | `localhost:5433` (usuario `srrhh_user`, pass `srrhh_pass`, db `srrhh_db`) |

| Usuario | Contraseña   |
| ------- | ------------ |
| `admin` | `Admin1234!` |

---

## 7. Comandos útiles sueltos (Windows, sin Docker)

```bash
cd /c/Desarrollo/SRH/SRRHH-Legacy

pnpm --filter @srrhh/api exec tsc --noEmit    # typecheck backend
pnpm --filter @srrhh/web exec tsc --noEmit    # typecheck frontend
pnpm --filter @srrhh/types exec tsc --noEmit  # typecheck tipos compartidos

pnpm db:seed                                   # re-correr el seed (idempotente)
pnpm db:studio                                 # Prisma Studio (explorar la BD con UI)
```

---

## 8. Troubleshooting — problemas reales que ya aparecieron

| Síntoma                                                                                                           | Causa                                                                                             | Solución                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker: command not found`                                                                                       | Estás en Git Bash/PowerShell, no en WSL                                                           | Escribí `wsl` primero                                                                                                                                                                      |
| Vite arranca pero la app no carga nada raro, o un `curl` a 5173 da contenido inesperado ("TorneoApp")             | Puerto 5173 ocupado por otra app en esta máquina                                                  | Usar `--port 5180` (ver sección 4)                                                                                                                                                         |
| Error de CORS en la consola del browser (`No 'Access-Control-Allow-Origin'...`)                                   | El origin del frontend no está en `CORS_ORIGINS` de la API                                        | Si usás Docker: agregar el puerto a `docker-compose.override.yml` y `docker compose up -d --build api`. Si es API nativa: agregar a `apps/api/.env`                                        |
| Un endpoint nuevo (agregado a `apps/api/src`) da 404 pese a que el código está bien                               | El container `api` no se reconstruyó tras el cambio                                               | `docker compose up -d --build api` (no alcanza sin `--build`)                                                                                                                              |
| `prisma migrate dev` tira `environment is non-interactive`                                                        | Se corrió en un script/pipe, no en terminal interactiva                                           | Usar `prisma migrate deploy` para aplicar migraciones existentes; para crear una nueva a mano, ver `Doc/Planificacion/PLAN_SCRUM_2026.md` (hallazgos Sprint 2)                             |
| Prisma tira un error no-JSON raro al conectar (dentro de un container)                                            | Falta `libssl` en la imagen `node:20-alpine`                                                      | Ya resuelto en `apps/api/Dockerfile` (`apk add openssl`) — si reaparece, revisar que ese Dockerfile no se haya tocado                                                                      |
| `tsx`/`vite` tira `You installed esbuild for another platform... @esbuild/win32-x64 ... needs @esbuild/linux-x64` | Corriste un script `tsx` desde WSL contra el `node_modules` instalado desde Windows (mismo disco) | Correr el script dentro del contenedor: `docker exec -w /repo/apps/api srrhh_api pnpm exec tsx scripts/<script>.ts` (tiene el esbuild de Linux). Ver sección "Seed de Áreas Programáticas" |
| Pestaña "Área Programática" (Organigrama) vacía                                                                   | Falta correr el seed/backfill del Sprint 23 (no lo cubre `db:seed`)                               | Ver sección "Seed de Áreas Programáticas / CeSACs"                                                                                                                                         |

---

### Problemas nuevos (2026-11-07)

| Síntoma                                                                                         | Causa                                                                                                              | Solución                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"vite" no se reconoce` en Git Bash/PowerShell                                                  | `node_modules/` se instaló desde WSL (binarios Linux)                                                              | Correr el front desde WSL, o reinstalar desde Windows (`pnpm install` en Git Bash/PowerShell)                                                                                                    |
| `ERR_PNPM_EACCES ... rename ... node_modules/.pnpm/...` al hacer `pnpm install` desde WSL      | Procesos con archivos de `node_modules` abiertos (vite, tsx, editor) bloquean el rename en `/mnt/c`               | Cortar vite/tsx del proyecto y reintentar; si pregunta "modules directories will be removed and reinstalled from scratch", responder **n** (el install incremental alcanza si el lockfile no cambió) |
| `vite` arranca en `5173` aunque se pidió `5180`                                                 | Se usó `pnpm ... dev -- --port 5180` (el `--` extra hace que vite no reciba el flag)                               | Usar `pnpm --filter @srrhh/web exec vite --port 5180`. 5180 es el puerto recomendado: 5173 puede estar ocupado por otra app de esta máquina (ver "Por qué `--port 5180`" en la sección 4)                              |
| `EADDRINUSE 0.0.0.0:3000` al levantar la API con `pnpm dev`                                     | `srrhh_api` (Docker) ya ocupa el 3000                                                                              | No levantar la API nativa; usar la dockerizada (hot-reload). Ver sección 5                                                                                                                      |
| `Can't reach database server at ...-pooler...:6432` en la API nativa                            | El pooler de Neon (`:6432`) puede no responder aunque la conexión directa `:5432` funcione                        | La API dockerizada usa la directa (override). Para scripts/psql usar `NEON_DIRECT` (ver `DEPLOY_PRODUCCION.md`, "Reconstruir `NEON_DIRECT`")                                                    |
| Un endpoint/dependencia nueva (ej. `pdfkit`) no existe en el contenedor                         | La imagen se construyó antes de que cambiara `package.json`/`pnpm-lock.yaml` (el hot-reload solo cubre `src/`)     | `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build`                                                                                                              |
| `Unsupported engine: wanted node 22.x` (WARN)                                                   | WSL tiene Node 20; el repo declara 22 (Render usa 22)                                                              | Solo advertencia, no bloquea. Si algo se comporta distinto entre local y Render, sospechar de esta diferencia de versión                                                                        |

---

## 9. Ver también

- `README.md` (raíz del repo) — setup "desde cero" genérico, para una máquina nueva
- `Doc/Contrato_Tecnologias.md` — stack y decisiones técnicas
- `Doc/Planificacion/PLAN_SCRUM_2026.md` — estado real de cada sprint, con hallazgos y bugs
  encontrados verificando contra datos reales (no solo "debería andar")
