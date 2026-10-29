# Implementation Plan — Tipo/Motivo de Concurso (3 motivos + `-R-` + backfill)

> Fuente de verdad: `Doc/Planificacion/Sprints/SPRINT_tipo_concurso.md`. Este plan la ordena
> en pasos concretos; no re-decide la arquitectura. Monorepo pnpm; backend `apps/api`
> (Fastify+Prisma), frontend `apps/web` (React+Vite), tipos en `packages/types/src/index.ts`.
> Rama `jorge`, sin worktree. NO levantar dev servers (Windows). NO ejecutar nada contra la DB.
>
> **Hallazgos de exploración que fijan decisiones del plan:**
> - `motivoConcurso` vive SOLO en `model Concurso` (schema.prisma línea 751, `@map("motivo_concurso")`).
>   NO existe en `ConcursoCph` ni `ConcursoCeetps`. → El backfill puebla `concursos.motivo_concurso`.
> - El enum Prisma `MotivoConcurso { nuevo_cargo, alta_por_baja }` (schema.prisma ~línea 61) es el que
>   usa `@prisma/client`. Valores raw: `nuevo_cargo`, `alta_por_baja`. (El `MotivoConcurso` de
>   `@srrhh/types` línea 57 es un concepto legacy DISTINTO y sin uso — no tocar, no confundir.)
> - El concurso desde la baja se crea en `createConcursoTx` (`apps/api/src/modules/concursos/concursos.service.ts`),
>   llamada desde DOS sitios en `apps/api/src/modules/bajas/bajas.service.ts`: `createBajaService` (~línea 837)
>   y `updateBajaService` (~línea 188). **Bug actual confirmado:** `tx.concurso.create` NUNCA escribe
>   `motivoConcurso` (lo lee solo para la notificación), y ninguno de los dos call sites lo pasa. Hay que
>   persistirlo y propagarlo.
> - El concurso reutiliza el `cargoId` existente de la baja — NO genera un cargo nuevo con código. Por eso
>   la codificación `-R-` (D2) se implementa derivando el prefijo del código del cargo con
>   `prefijoRemplazante()` y **recodificando el `codigo` del cargo del concurso** (igual criterio que usa
>   `registrarRetencionService` en `retenciones.service.ts`, que ya hace exactamente este patrón).
> - `prefijoRemplazante(prefijoCargo, 'R')` (shared/codigoCargo.ts línea 234) devuelve `CPH-POF` → `CPH-POF-R`.
>   `siguienteCodigoCargo(prefijo, tx)` arma `CPH-POF-R-000NNN`. El prefijo del cargo se obtiene como en
>   `retenciones.service.ts::prefijoDelCargo`: `cargo.codigo.replace(/-\d{6}$/, '')`.
> - El dropdown "Origen" de `NuevaBajaPage.tsx` se alimenta de `OPCIONES_ORIGEN`
>   (`apps/web/src/modules/cargos/lib/bajasHelpers.ts`), hoy `['Alta por Baja', 'Cobertura Dotación']`.
>   Ese valor hoy va a `tipificadorOrigen` (string), no al enum. El body de la baja NO manda `motivoConcurso`.
> - Ambos detalles (CPH y CEETPS) ya serializan la relación `concurso` COMPLETA con `include` (sin `select`
>   que recorte), así que `concurso.motivoConcurso` llega al frontend SIN cambios de backend:
>   `concursos-cph.service.ts` `include` líneas 25-42 (usado por `getConcursoCphByIdService`), y
>   `concursos-ceetps.service.ts` `include` líneas 8-18 (usado por `getConcursoCeetpsByIdService`).
> - El badge por `motivoConcurso` ya existe como patrón en `ConcursosCeetpsPage.tsx` (~línea 141) leyendo
>   `c.concurso?.motivoConcurso`. Reusar ese patrón en los dos detalles.
> - `packages/types/src/index.ts` ya expone `Concurso.motivoConcurso: string | null` (línea 333) — tipo
>   suficiente para los 3 valores; no requiere cambio salvo que se quiera un union estricto (opcional).
> - Comandos: build API `pnpm --filter @srrhh/api build` (tsc), tests API `pnpm --filter @srrhh/api test`
>   (vitest), build web `pnpm --filter @srrhh/web build` (tsc + vite). Migración manual estilo repo:
>   carpeta `prisma/migrations/YYYYMMDDHHMMSS_slug/migration.sql` (última: `20261029000000_cargo_sub_estado`).

---

## Backend

- [ ] 1. Extender el enum `MotivoConcurso` en el schema Prisma con `retencion_de_cargo` y `cobertura_dotacion`.
      Editar el bloque `enum MotivoConcurso { nuevo_cargo alta_por_baja }` (schema.prisma ~línea 61) para
      que quede `{ nuevo_cargo alta_por_baja retencion_de_cargo cobertura_dotacion }`. `nuevo_cargo` se
      conserva (D1). No tocar el `MotivoConcurso` de `@srrhh/types`.
      Files: `prisma/schema.prisma`
      Verify: `pnpm --filter @srrhh/api exec prisma format` no reporta error de sintaxis del schema
      (no conecta a DB). El tipo nuevo se materializa en el cliente en el paso 2.

- [ ] 2. Crear la migración manual idempotente que agrega los dos valores al tipo enum en Postgres, y
      regenerar el cliente Prisma. Crear carpeta `prisma/migrations/20261030000000_motivo_concurso_3_valores/`
      con `migration.sql` conteniendo dos `ALTER TYPE "MotivoConcurso" ADD VALUE IF NOT EXISTS 'retencion_de_cargo';`
      y `... 'cobertura_dotacion';` (idempotente, estilo migración manual del repo). NO ejecutar la migración
      contra la DB; solo escribir el archivo y regenerar tipos del cliente.
      Files: `prisma/migrations/20261030000000_motivo_concurso_3_valores/migration.sql`
      Verify: `pnpm --filter @srrhh/api exec prisma generate` completa y el tipo
      `MotivoConcurso` del `@prisma/client` incluye los 4 valores (lo consume el build del paso 4).

- [ ] 3. Agregar `motivoConcurso` al schema de creación de baja para que el frontend pueda mandarlo.
      En `createBajaSchema` y `updateBajaBase` agregar `motivoConcurso: z.nativeEnum(MotivoConcurso).optional()`
      (importar `MotivoConcurso` de `@prisma/client`, igual que en `concursos.schema.ts`). `CreateBajaBody`
      y `UpdateBajaBody` lo heredan por `z.infer`.
      Files: `apps/api/src/modules/bajas/bajas.schema.ts`
      Verify: `pnpm --filter @srrhh/api build` compila (el tipo nuevo del cliente del paso 2 ya existe).

- [ ] 4. Persistir `motivoConcurso` en el `Concurso` y propagarlo desde la baja; actualizar el label de la
      notificación a los 3 motivos. En `concursos.service.ts::createConcursoTx`:
      (a) agregar `motivoConcurso: body.motivoConcurso ?? null` al `data` de `tx.concurso.create` (hoy NO se
      escribe — es el bug raíz); (b) reemplazar las dos ocurrencias de
      `const motivoLabel = body.motivoConcurso === 'nuevo_cargo' ? 'Nuevo cargo' : 'Alta por baja'`
      por un map que cubra los 4 valores (`nuevo_cargo`→'Nuevo cargo', `alta_por_baja`→'Alta por baja',
      `retencion_de_cargo`→'Retención de cargo', `cobertura_dotacion`→'Cobertura de dotación').
      En `bajas.service.ts`, en las DOS llamadas a `createConcursoTx` (`createBajaService` ~línea 837 y
      `updateBajaService` ~línea 188), pasar `motivoConcurso: body.motivoConcurso` dentro del objeto body.
      Files: `apps/api/src/modules/concursos/concursos.service.ts`, `apps/api/src/modules/bajas/bajas.service.ts`
      Verify: `pnpm --filter @srrhh/api build` compila y `pnpm --filter @srrhh/api test` pasa
      (incluye `bajas.unit.test.ts`, que replica las condiciones de create/update de baja).

- [ ] 5. Codificación `-R-`: al crear un concurso de `retencion_de_cargo`, recodificar el `codigo` del
      cargo del concurso con `prefijoRemplazante()`. En `concursos.service.ts::createConcursoTx`, antes
      de `tx.concurso.create` (o inmediatamente después, dentro de la misma tx), cuando
      `body.motivoConcurso === 'retencion_de_cargo'`: leer el cargo (`tx.cargo.findUnique({ where: { id: body.cargoId } })`),
      derivar el prefijo base con `cargo.codigo.replace(/-\d{6}$/, '')` (mismo criterio que
      `retenciones.service.ts::prefijoDelCargo`), calcular `prefijo = prefijoRemplazante(prefijoBase, 'R')`,
      obtener `codigo = await siguienteCodigoCargo(prefijo, tx)` y `tx.cargo.update` el `codigo` del cargo
      del concurso a ese nuevo código. Guardas: si el código del cargo ya contiene `-R-` (ya recodificado),
      no volver a aplicar; si `cargo.codigo` es null, omitir la recodificación (log/no-op). Importar
      `prefijoRemplazante` y `siguienteCodigoCargo` desde `../../shared/codigoCargo.js`.
      Files: `apps/api/src/modules/concursos/concursos.service.ts`
      Verify: `pnpm --filter @srrhh/api test` pasa. Añadir/ejecutar un test unitario (ver paso 6) que
      confirme `CPH-POF-017530` → `CPH-POF-R-000NNN` al crear con `retencion_de_cargo`.

- [ ] 6. Agregar cobertura de tests para la derivación `-R-`. En `codigoCargo.test.ts` ya hay un `describe`
      para `prefijoRemplazante`; agregar (si falta) un caso `prefijoRemplazante('CPH-POF', 'R') === 'CPH-POF-R'`.
      Para la recodificación en el flujo, añadir un test de servicio que, con un `tx` mock/estilo del repo,
      verifique que `createConcursoTx` con `motivoConcurso: 'retencion_de_cargo'` llama a `cargo.update` con
      un `codigo` que matchea `/-R-\d{6}$/`. Seguir el patrón de mocking de `apps/api/src/__tests__/`.
      Files: `apps/api/src/__tests__/codigoCargo.test.ts`, nuevo
      `apps/api/src/__tests__/concursos.retencion.test.ts` (o extender un test existente de concursos si lo hay)
      Verify: `pnpm --filter @srrhh/api test` — los nuevos tests pasan y no se rompe ninguno existente.

## Frontend

- [ ] 7. Agregar "Retención de Cargo" al dropdown Origen y mapear Origen → `MotivoConcurso`. En
      `bajasHelpers.ts` extender `OPCIONES_ORIGEN` a
      `['Alta por Baja', 'Retención de Cargo', 'Cobertura Dotación']` y agregar un helper
      `origenToMotivoConcurso(origen): 'alta_por_baja' | 'retencion_de_cargo' | 'cobertura_dotacion' | undefined`
      (`'Alta por Baja'→'alta_por_baja'`, `'Retención de Cargo'→'retencion_de_cargo'`,
      `'Cobertura Dotación'→'cobertura_dotacion'`). En `NuevaBajaPage.tsx`, en `buildBody` (y en el body del
      `mutBorrador`), incluir `motivoConcurso: origenToMotivoConcurso(origen)` cuando `conConcurso`/aplique.
      Nota: `handleOrigenChange('Cobertura Dotación')` ya setea `motivo='Cobertura Dotación'`; revisar que
      'Retención de Cargo' no requiera el mismo tratamiento de campos readonly (dejar igual que 'Alta por Baja'
      salvo que el .md indique otra cosa).
      Files: `apps/web/src/modules/cargos/lib/bajasHelpers.ts`, `apps/web/src/modules/cargos/pages/NuevaBajaPage.tsx`
      Verify: `pnpm --filter @srrhh/web build` compila (tsc + vite). Revisión visual del dropdown queda
      para el loop de review.

- [ ] 8. Badge de tipo en el detalle del concurso CPH. En `ConcursoCphWizard.tsx`, en el `useMemo` que
      arma el objeto `concurso` (líneas ~189-211), agregar `motivoConcurso: cphData.concurso?.motivoConcurso ?? null`.
      En la sección "Badges de estado" del header (~línea 2702, junto al badge de sub-estado y el de
      "Suspendido"), renderizar un badge con el label del motivo (map:
      `alta_por_baja`→'Alta por baja', `retencion_de_cargo`→'Retención de cargo',
      `cobertura_dotacion`→'Cobertura de dotación', `nuevo_cargo`→'Nuevo cargo'; null → no renderiza),
      reutilizando las clases de chip existentes del header.
      Files: `apps/web/src/modules/concursos-cph/pages/ConcursoCphWizard.tsx`
      Verify: `pnpm --filter @srrhh/web build` compila.

- [ ] 9. Badge de tipo en el detalle del concurso CEETPS. En `ConcursoCeetpsDetail.tsx`, en la fila de
      badges del header (~línea 256, junto a `ESTADO_BADGE`/`diasBadgeClass`), renderizar un badge leyendo
      `concurso.concurso?.motivoConcurso` con el mismo map/labels del paso 8. Factorizar el map de labels en
      un helper compartido (p. ej. `motivoConcursoLabel` en `bajasHelpers.ts` o en `concursos-*/lib/labels`)
      para no duplicarlo entre CPH, CEETPS y la lista CEETPS; actualizar `ConcursosCeetpsPage.tsx` (~línea 141)
      para usar el helper y cubrir los 3 valores nuevos (hoy solo cubre `nuevo_cargo`/`alta_por_baja`).
      Files: `apps/web/src/modules/concursos-ceetps/pages/ConcursoCeetpsDetail.tsx`,
      `apps/web/src/modules/concursos-ceetps/pages/ConcursosCeetpsPage.tsx`,
      helper compartido (`apps/web/src/modules/cargos/lib/bajasHelpers.ts` o un `labels` común)
      Verify: `pnpm --filter @srrhh/web build` compila.

## Backfill (SQL — NO ejecutar; lo corre Jorge en Neon)

- [ ] 10. Escribir el SQL de backfill en `apps/api/scripts/backfill_tipo_concurso.sql` (sibling de
      `backfill_sub_estado_cargo.sql`), idempotente y en el orden de D3, poblando `concursos.motivo_concurso`:
      (1) `retencion_de_cargo` donde la baja asociada tiene una ocupación con
      `lower(unaccent(situacion_revista)) = 'retencion de cargo'` (los 2 casos Duek/Rissi — mismo criterio
      de casing/unaccent que usa `retenciones.service.ts`); (2) `alta_por_baja` donde el concurso tiene
      `baja_id` no nulo (o `ee_baja` matchea una fila en `bajas`) y aún no fue marcado retención;
      (3) `cobertura_dotacion` para el resto (sin baja); (4) recodificar el `codigo` del cargo de los 2 de
      retención a `-R-` (`CPH-POF-017530`→`CPH-POF-R-017530`, `017548` análogo) con un `UPDATE cargos`
      derivando el nuevo código por `regexp_replace(codigo, '-(\d{6})$', '-R-\1')`, **verificando colisión
      antes** (`WHERE NOT EXISTS (SELECT 1 FROM cargos c2 WHERE c2.codigo = <nuevo>)`). Dejar los pasos
      numerados y comentados; NO ejecutar.
      Files: `apps/api/scripts/backfill_tipo_concurso.sql`
      Verify: el archivo es SQL válido (revisión; no se ejecuta contra DB). El loop de review valida que el
      orden y los filtros coinciden con D3/D4 del .md.

---

## Digest

Comandos verificados durante exploración (no ejecutados contra DB):
- Build API: `pnpm --filter @srrhh/api build` → `tsc --project tsconfig.build.json` (apps/api/package.json línea 8).
- Tests API: `pnpm --filter @srrhh/api test` → `vitest run` (apps/api/package.json línea 11). Hoy en verde (base rama `jorge`).
- Generar cliente Prisma: `pnpm --filter @srrhh/api exec prisma generate`.
- Build web: `pnpm --filter @srrhh/web build` → `tsc && vite build` (apps/web/package.json línea 8).

Bloques a tocar por archivo (firma/líneas leídas):

- `prisma/schema.prisma`
  - enum `MotivoConcurso` (~línea 61): hoy `{ nuevo_cargo alta_por_baja }`. Agregar `retencion_de_cargo`, `cobertura_dotacion`.
  - `model Concurso` (~línea 736): `motivoConcurso MotivoConcurso? @map("motivo_concurso")` (línea 751) — campo YA existe; NO existe en `ConcursoCph`/`ConcursoCeetps` (confirmado). No se agrega columna nueva.
  - Test/cobertura: la migración (paso 2) + `prisma generate` materializan el enum; no hay test de schema per se.

- `prisma/migrations/20261030000000_motivo_concurso_3_valores/migration.sql` (NUEVO)
  - `ALTER TYPE "MotivoConcurso" ADD VALUE IF NOT EXISTS 'retencion_de_cargo';` y `... 'cobertura_dotacion';`
  - Estilo: migración SQL manual (como `0_init` que hace `CREATE TYPE "MotivoConcurso" AS ENUM (...)`, línea 14; y `concursos.motivo_concurso` definido en 0_init línea 330). NO ejecutar.

- `apps/api/src/modules/bajas/bajas.schema.ts`
  - `createBajaSchema` (línea 30) y `updateBajaBase`: agregar `motivoConcurso: z.nativeEnum(MotivoConcurso).optional()` (import `MotivoConcurso` de `@prisma/client`).
  - Cubierto por: `pnpm --filter @srrhh/api build` + `bajas.unit.test.ts` (replica condiciones de create/update).

- `apps/api/src/modules/concursos/concursos.service.ts`
  - `createConcursoTx(tx, body, usuarioId, bajaId?)` (línea 44): en `tx.concurso.create.data` (línea ~50) AGREGAR `motivoConcurso: body.motivoConcurso ?? null` (hoy ausente — bug raíz). Reemplazar las dos líneas `motivoLabel = ... 'nuevo_cargo' ? 'Nuevo cargo' : 'Alta por baja'` (líneas 94 y 127) por un map de 4 valores.
  - Insertar lógica `-R-` para `body.motivoConcurso === 'retencion_de_cargo'`: leer cargo, `prefijoRemplazante(cargo.codigo.replace(/-\d{6}$/, ''), 'R')`, `siguienteCodigoCargo(prefijo, tx)`, `tx.cargo.update` del `codigo`. Imports desde `../../shared/codigoCargo.js`.
  - Cubierto por: `concursos.retencion.test.ts` (NUEVO) + `codigoCargo.test.ts`.

- `apps/api/src/modules/bajas/bajas.service.ts`
  - `createBajaService` (línea 779): llamada a `createConcursoTx` (~línea 837) — agregar `motivoConcurso: body.motivoConcurso` al body.
  - `updateBajaService`: llamada a `createConcursoTx` (~línea 188) — agregar `motivoConcurso: body.motivoConcurso` al body.
  - Cubierto por: `pnpm --filter @srrhh/api test`.

- `apps/api/src/shared/codigoCargo.ts` (NO se modifica; se consume)
  - `prefijoRemplazante(prefijoCargo, 'R'|'TTR')` (línea 234): `CPH-POF` → `CPH-POF-R`.
  - `siguienteCodigoCargo(prefijo, tx)` (línea 172): `CPH-POF-R-000NNN`.

- `apps/api/src/__tests__/codigoCargo.test.ts` + `apps/api/src/__tests__/concursos.retencion.test.ts` (NUEVO)
  - Casos: `prefijoRemplazante('CPH-POF','R')==='CPH-POF-R'`; recodificación `-R-` al crear concurso de retención.

- `apps/web/src/modules/cargos/lib/bajasHelpers.ts`
  - `OPCIONES_ORIGEN` (línea 3): hoy `['Alta por Baja', 'Cobertura Dotación']`. Agregar `'Retención de Cargo'`.
  - NUEVO `origenToMotivoConcurso(origen)` y (opcional) `motivoConcursoLabel(motivo)` compartido.
  - Cubierto por: `pnpm --filter @srrhh/web build`.

- `apps/web/src/modules/cargos/pages/NuevaBajaPage.tsx`
  - `buildBody(conConcurso)` (~línea con `generaConcurso: conConcurso`) y el body del `mutBorrador`: agregar `motivoConcurso: origenToMotivoConcurso(origen)`.
  - `handleOrigenChange` (ya existe para 'Cobertura Dotación'): revisar tratamiento de 'Retención de Cargo'.
  - Cubierto por: `pnpm --filter @srrhh/web build`.

- `apps/web/src/modules/concursos-cph/pages/ConcursoCphWizard.tsx`
  - `useMemo` del objeto `concurso` (líneas 189-211): agregar `motivoConcurso: cphData.concurso?.motivoConcurso ?? null`.
  - Sección "Badges de estado" del header (~línea 2702): renderizar badge con `motivoConcursoLabel`.
  - Backend ya serializa `concurso.motivoConcurso` vía `include` (concursos-cph.service.ts líneas 25-42; `getConcursoCphByIdService` línea 375). Cubierto por: `pnpm --filter @srrhh/web build`.

- `apps/web/src/modules/concursos-ceetps/pages/ConcursoCeetpsDetail.tsx`
  - Fila de badges del header (~línea 256): renderizar badge leyendo `concurso.concurso?.motivoConcurso` con `motivoConcursoLabel`.
  - Backend ya serializa `concurso` vía `include` (concursos-ceetps.service.ts líneas 8-18; `getConcursoCeetpsByIdService` línea 64). Cubierto por: `pnpm --filter @srrhh/web build`.

- `apps/web/src/modules/concursos-ceetps/pages/ConcursosCeetpsPage.tsx`
  - Celda "Motivo" (~líneas 141-146): hoy cubre solo `nuevo_cargo`/`alta_por_baja`. Migrar a `motivoConcursoLabel` para cubrir los 3 valores nuevos.
  - Cubierto por: `pnpm --filter @srrhh/web build`.

- `packages/types/src/index.ts`
  - `interface Concurso.motivoConcurso: string | null` (línea 333) — tipo YA suficiente. OPCIONAL: estrechar a union `'nuevo_cargo'|'alta_por_baja'|'retencion_de_cargo'|'cobertura_dotacion'|null`. NO tocar el `const MotivoConcurso` legacy (línea 57).

- `apps/api/scripts/backfill_tipo_concurso.sql` (NUEVO)
  - 4 pasos en orden D3/D4 poblando `concursos.motivo_concurso` + recodificación `-R-` con chequeo de colisión. NO ejecutar.

Gaps / supuestos (resueltos por supuesto razonable, confirmar en review si hiciera falta):
- El paso 5 recodifica el `codigo` del cargo del concurso in-place (no crea un cargo R aparte), porque el
  concurso desde la baja reutiliza el cargo existente y D2 dice "el código del cargo del concurso conserva
  su número y se le inserta `-R-`". El flujo de retención "real" con cargo remplazante separado
  (`registrarRetencionService`) queda fuera de alcance de este sprint.
- Si en producción algún cargo de retención ya trae `codigo` null, la recodificación se omite (no-op) y el
  `motivoConcurso` igual se persiste; el backfill (paso 10) cubre los 2 casos históricos conocidos.
