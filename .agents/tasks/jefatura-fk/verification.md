# Verificación — S22-12 Opción B: jefatura como FK (no texto)

Worktree: `c:\Desarrollo\SRH\SRRHH-Legacy\.worktrees\jefatura-fk` · Branch: `feat/jefatura-fk`
Fecha: 2026-10-13

## Entorno

- `pnpm install` corrido en el worktree (no traía `node_modules`). `postinstall`
  ejecutó `prisma generate` OK. pnpm 9.15.9, node v24.20.0, TypeScript 5.9.3,
  Prisma/@prisma/client 5.22.0.
- Python 3 con `pandas 3.0.5`, `numpy 2.5.1`, `openpyxl 3.1.5`. **`pytest` NO
  está instalado** → los tests se escribieron con `unittest` (stdlib) y se
  corren con `python -m unittest`.
- Postgres de desarrollo accesible en `localhost:5433` (DB `srrhh_db`), tomado de
  `apps/api/.env` del repo principal (el worktree no tiene `.env` propio; se pasó
  `DATABASE_URL` por entorno solo para los comandos de Prisma).

## 1. Schema Prisma

- `prisma format` → OK (formateó el schema).
- `prisma validate` → OK (sin errores de schema; el único error observado fue
  `Environment variable not found: DATABASE_URL` cuando no se pasaba la env, que
  es de entorno, no de schema; con `DATABASE_URL` seteada valida limpio).
- Cambios: `Ocupacion.cargoJefaturaPuestoId String? @db.Uuid` +
  relación `cargoJefaturaPuesto PuestoCargo? @relation("OcupacionCargoJefatura", … onDelete: SetNull)`
  + `@@index([cargoJefaturaPuestoId])`; back-relation
  `PuestoCargo.ocupacionesComoJefatura Ocupacion[] @relation("OcupacionCargoJefatura")`.
  Ningún campo existente modificado.

## 2. Migración `s22_12_jefatura_fk`

- `prisma migrate dev` se intentó primero (camino preferido) y **colgó**
  (shadow DB, riesgo conocido del repo). Se usó el **fallback**: SQL manual +
  `prisma migrate deploy` + `prisma generate`.
- Archivo: `prisma/migrations/20261013000000_s22_12_jefatura_fk/migration.sql`
  (DDL aditiva, idempotente con `IF NOT EXISTS`; FK `ON DELETE SET NULL ON UPDATE
  CASCADE`, igual que la FK opcional hermana `ocupaciones_snapshot_id_fkey` en
  `0_init/migration.sql`). NO incluye seed de puestos (diferido).
- `prisma migrate deploy` → **"All migrations have been successfully applied"**
  (aplicó `20261013000000_s22_12_jefatura_fk`).
- `prisma generate` → OK (cliente regenerado; el tipo `cargoJefaturaPuestoId`
  quedó disponible para `tsc`).
- Verificación en BD (vía `prisma db execute`): se ejecutó
  `SELECT "cargo_jefatura_puesto_id" FROM "ocupaciones" WHERE false;` (columna
  existe/seleccionable) y dos `SELECT 1/count(*) …` sobre `pg_constraint`
  (`ocupaciones_cargo_jefatura_puesto_id_fkey`) y `pg_indexes`
  (`ocupaciones_cargo_jefatura_puesto_id_idx`): ambos ejecutaron sin error (si el
  constraint o el índice faltaran, `1/0` lanzaría división por cero). → columna +
  FK + índice confirmados en la base.

## 3. Pipeline Python (Dotaneitor)

- `python -m py_compile catalogo.py pipeline.py main.py` → OK (sin errores de
  sintaxis en los archivos tocados).
- `catalogo.py`: nuevo `resolver_cargo_jefatura_id`, helper `_sin_nivel` (espejo
  de `derivarCargosConduccion.sinNivel`), índice de puestos de **conducción**
  (`tipo_puesto='conduccion'`), mapa `jcat_a_familia`, `_escalafon_id_22`.
  `resolver_cargo_jefatura` (texto, Opción A) intacto.
- `pipeline.py`: emite `cargo_jefatura_puesto_id` por fila, cuenta `jcat_sin_fk`,
  lo agrega al `reporte` y a un log `warning`; agrega la columna a `_ORDEN_SALIDA`,
  `_COLUMNAS_INTERNAS_EXPORT` (viaja a Node, no al Excel) y
  `_COLUMNAS_NO_MINUSCULA`. `cargo_jefatura` (texto) intacto.

## 4. Tests Python

- `python -m unittest tests.test_cargo_jefatura_fk` → **16 tests OK**.
- Cubren: P/G con puesto existente → id; puesto catalogado con sufijo `(NN)`
  resuelve igual (Finding 1); Sub-Director `ejecucion` → None (Finding 6);
  familia Z → None; Z sin escalafón de fila → None; jcat sin mapeo → None; jcat
  sin familia → None; None/NaN → None; escalafón 22 ausente → None; case-insensitive;
  `_sin_nivel` quita sufijo; y contrato de pipeline: columna en los tres sets,
  `df_a_excel_bytes` excluye la FK pero conserva `cargo_jefatura` (texto), y el
  conteo `jcat_sin_fk`.

## 5. Persistencia Node + type-check

- `pnpm exec tsc --noEmit` en `apps/api`: **0 errores en código fuente de
  producción**, 0 en `padron.service.ts`. Los 40 errores reportados están TODOS
  en archivos de test preexistentes (`src/__tests__/concursos-bajas.http.test.ts`,
  `concursosCph.calc.test.ts`, `concursos-cph-etapa3.http.test.ts`) — confirmado
  `git diff --stat jorge` vacío para esos archivos: no los tocó esta tarea, son
  deuda previa (typing `unknown` en helpers HTTP y un input de cálculo de
  concursos), ajena a S22-12.
- `padron.service.ts`: 4 sitios editados — (1) allowlist de `generarDiffsService`
  (`cargo_jefatura_puesto_id: strVal(r['cargo_jefatura_puesto_id'])`), (2) tipo
  inline + push en `aprobarSnapshotService`, (3) single-create en
  `aprobarTodosService`, (4) single-create en ruta transfer/reject. Consumidores
  de texto (organigrama, cadena de mando, `derivarCargosConduccion`,
  `cargosOcultos`) **no tocados** (leen `codigo_jefaturas`, requisito 4).

## 6. E2E `POST /procesar-padron` (recomendado, NO criterio de aceptación)

- No se ejecutó el E2E completo. Levantar el servicio Python del Dotaneitor + la
  API Node + procesar/aprobar un padrón de muestra excede el alcance de esta
  etapa (requirements Supuestos: no se requiere correr el pipeline contra
  Postgres como criterio de aceptación). Además, en este entorno las consultas
  del Prisma Client vía Node colgaron (el engine de query vía cliente no
  respondía), aunque el CLI de Prisma (`migrate deploy`, `db execute`) sí operó
  contra la misma BD.
- Correctitud justificada por lectura + tipos + unit tests + verificación de BD:
  la columna/FK/índice existen en la base; el pipeline emite la columna
  snake_case y la rutea a Node (no al Excel); el allowlist la transporta a
  `datos`; los 4 sitios de escritura la persisten como `cargoJefaturaPuestoId`;
  `tsc` acepta el tipo generado por Prisma. El camino null (familia Z /
  Sub-Director sin curar) está cubierto por los unit tests y por `|| null`.

## Resumen

Criterios de aceptación verificables de esta etapa cumplidos: schema válido,
migración aplicada (col+FK+índice confirmados en BD), `tsc` limpio en fuente de
producción, `py_compile` OK en los 3 `.py`, 16 unit tests OK, texto
`cargo_jefatura` y consumidores intactos. E2E contra DB documentado como no
ejecutado (fuera de criterio de aceptación + límite del entorno).
