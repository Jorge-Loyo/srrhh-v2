# Carga masiva de concursos (CPH + CEETPS) — `cargar-concursos.ts`

Script de ingesta autocontenido que lee el Excel limpio de Etapa 1 y crea
`Concurso` + `ConcursoCph` / `ConcursoCeetps` en Neon, reutilizando el flujo real
del backend (`calcConcursoCph()`, `calcEstadoCeetps()`, `prefijoDeCargo()`,
`siguienteCodigoCargo()`, `resolverPuestoCargoId()`). Implementa el DISEÑO/PLAN
aprobados en `.agents/tasks/carga-concursos/{DISENO,PLAN}.md` (RAMA C ESTRICTA;
regla de oro `escalafonId = CR.escalafon_id`).

> El script **no** hace backup ni borra concursos (eso lo corre Jorge por SQL:
> `.agents/tasks/carga-concursos/sql/01_borrado_concursos.sql`).

## Requisitos (una vez, en el worktree)

Desde la raíz del worktree `c:/Desarrollo/SRH/SRRHH-Legacy/.worktrees/carga-concursos`:

```bash
pnpm install                 # instala dependencias del monorepo (incluye xlsx y tsx)
pnpm db:generate             # genera el PrismaClient desde prisma/schema.prisma (raíz)
```

El Excel **no** vive en el worktree; el default apunta al repo base:
`c:/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Concursos/3CONCURSOS_LIMPIO_2026-10-26_v2.xlsx`.
La conexión sale de `DATABASE_URL` de `apps/api/.env` (por eso `--env-file=.env`).

## Obtener el `--usuario-carga <uuid>`

El flag es **obligatorio**: se usa como `createdById` (Cargo) y `registradoPorId`
(Concurso). Para elegir el usuario (p. ej. el admin de carga), correr contra Neon:

```sql
SELECT id, username, email, activo FROM usuarios WHERE activo = true ORDER BY username;
```

## DRY-RUN (siempre primero — NO escribe nada)

Desde `c:/Desarrollo/SRH/SRRHH-Legacy/.worktrees/carga-concursos`:

```bash
pnpm --filter @srrhh/api exec tsx --env-file=.env \
  scripts/carga-concursos/cargar-concursos.ts --dry-run --usuario-carga <uuid>
```

Resuelve hospital/cargo/persona/puesto/estado de TODAS las filas y emite el
reporte de conteos (vinculan vs crean cargo, designados-ya-activos, sin-hospital,
warnings, discrepancias de sub-estado, "Revisar manual", errores) **sin** tocar la
base: cada fila corre en una transacción con rollback forzado.

## CARGA REAL (escribe en Neon)

Correr **después** del borrado (SQL) y de revisar el DRY-RUN. Una hoja por vez:

```bash
# CPH (1228)
pnpm --filter @srrhh/api exec tsx --env-file=.env \
  scripts/carga-concursos/cargar-concursos.ts --usuario-carga <uuid> --solo cph

# CEETPS (393)
pnpm --filter @srrhh/api exec tsx --env-file=.env \
  scripts/carga-concursos/cargar-concursos.ts --usuario-carga <uuid> --solo ceetps
```

Sin `--solo` procesa ambas hojas en una corrida.

## Flags

| Flag                    | Descripción                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| `--usuario-carga <uuid>`| **Obligatorio.** Usuario activo (createdById / registradoPorId).       |
| `--dry-run`             | Resuelve todo y reporta conteos SIN escribir.                          |
| `--excel <ruta>`        | Ruta absoluta al Excel (default = repo base).                          |
| `--solo cph\|ceetps`    | Procesa una sola hoja.                                                  |
| `--help`                | Imprime el uso y termina.                                              |

## Tests (sin base)

```bash
pnpm --filter @srrhh/api exec vitest run scripts/carga-concursos
```

Type-check del repo (debe quedar en verde):

```bash
pnpm --filter @srrhh/api exec tsc --noEmit
```
