# Arranque local — SRRHH v2

> Cómo levantar la aplicación completa en esta máquina para ir probando. Basado en lo verificado
> de punta a punta el 2026-08-25 (Sprint 2 y 3) — no es solo la teoría del `README.md`, son los
> pasos reales con los problemas que aparecieron y cómo se resolvieron.

---

## ⚡ Comandos rápidos (uso diario)

### Backend — desde WSL

```bash
wsl
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build
```

### Frontend — desde Windows (Git Bash, PowerShell o CMD)

```bash
cd C:\Desarrollo\SRH\SRRHH-Legacy
pnpm --filter web dev --port 5180
```

### Abrir la app

```
http://localhost:5180
```

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
- **El frontend (Vite) corre nativo en Windows**, no en Docker — `docker-compose.yml` no tiene
  servicio `web`. Es más rápido para iterar (hot reload instantáneo) y así se verificó hoy.

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

## 4. Levantar el frontend (Vite, nativo en Windows)

```bash
pnpm --filter web dev --port 5180
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

## 9. Ver también

- `README.md` (raíz del repo) — setup "desde cero" genérico, para una máquina nueva
- `Doc/Contrato_Tecnologias.md` — stack y decisiones técnicas
- `Doc/Planificacion/PLAN_SCRUM_2026.md` — estado real de cada sprint, con hallazgos y bugs
  encontrados verificando contra datos reales (no solo "debería andar")
