# POST-SPRINT 14 — Migración de funcionalidad legacy: Organigrama

**Fecha:** 2026-09-08 | **Autor:** Agustin + Claude
**Rama:** `deploy` (sin commitear todavía)
**Continúa:** `POST_SPRINT_14_migracion_legacy_tablas_referencia.md` (mismo trabajo de migración, segundo ítem de la lista de gaps de esa sección 1)

---

## Contexto

Segundo ítem migrado de `dotacion-rrhh` a v2: la pantalla de Organigrama completa (Home + Detalle + vista Árbol + vista Diagrama + modales de Persona y Vacantes). Antes de escribir código se investigó a fondo la app vieja — resultó bastante más grande de lo que sugería el conteo de líneas (~1300 líneas en 7 archivos de frontend + un endpoint backend denso).

---

## Decisión tomada antes de empezar

La app vieja tenía selector de **período** (ver el organigrama "como estaba en marzo"). v2 no tiene guardado el equivalente — `Ocupacion` modela estado actual + rango `desde/hasta`, no snapshots mensuales con los campos que hacían falta (`codigoRepa`, `codigoRegistro`, `codigoJefaturas`); `PadronHistorico` se acerca pero no alcanza.

**Decisión de Agustín: sin selector de período.** v2 muestra quién ocupa cada puesto **hoy** (`Ocupacion.hasta = null`). Cubre el uso real diario sin tocar el schema. Si en el futuro hace falta navegación histórica, es una extensión aparte (agregar campos a `PadronHistorico` + backfill).

---

## Hallazgo importante: la data del árbol SÍ está en el repo

La tabla legacy `organigramas` (jerarquía estática de unidades organizativas, ~4.300 nodos) no tiene ningún script de import en `dotacion-rrhh` — se leía de la base tal cual, sin rastro de cómo se cargó originalmente.

Pese a su nombre, **`dotacion-rrhh/Doc/schema_only.sql` tiene el dump completo con datos reales**, no solo el esquema — confirmado extrayendo y parseando las 2 sentencias `INSERT INTO \`organigramas\` VALUES (...)` que contiene: **4.310 filas, 0 códigos de repartición duplicados**. No hace falta pedir el dato a nadie ni reconstruirlo — se escribió un parser (`apps/api/scripts/import-organigrama.ts`) que lo extrae de ahí directo.

---

## Qué se construyó

### Datos
- **`prisma/schema.prisma`** — modelo `Organigrama` nuevo (10 campos, calcados 1:1 de la tabla legacy: `lvl`, `tipo`, `codigoReparticion` único, `universoTotalizador`, `regimenEmpleo`, `descRep`, `sigla`, `padre`, `path`, `pathNombres`). Sin FK dura a `Hospital` — igual que en la app vieja, hay nodos (Ministerio, Direcciones Generales) que no corresponden a ningún hospital real.
- **`prisma/migrations/20260908120000_organigramas/`** — migración escrita a mano (sin DB para correr `prisma migrate dev`, ver estado del entorno abajo). Sigue el formato exacto de las migraciones `CREATE TABLE` existentes en el repo.
- **`apps/api/scripts/import-organigrama.ts`** (+ script `pnpm --filter @srrhh/api import:organigrama` en `apps/api/package.json`) — parser de mysqldump escrito a mano (respeta strings con escape `\\`/`\'` estilo MySQL) que extrae las filas de `schema_only.sql` y las carga con `createMany` en lotes de 500, re-ejecutable (trunca y recarga completo, mismo criterio que `seed_referencias.py`). Soporta `--archivo <ruta>` y `--dry-run` (parsea y muestra una muestra sin tocar la base — así se verificó sin necesitar Postgres arriba, ver sección de Verificación).

### Backend (`apps/api/src/modules/organigrama/`)
Puerto de `organigramaRoutes.js` con dos simplificaciones reales (no solo de estilo):
- **Sin período** (ver decisión arriba).
- **El cruce a `Cargo` se hace solo por `codigoRepa`**, sin re-filtrar además por sigla/hospital como hacía la app vieja (`AND o.sigla = s.sigla`) — innecesario porque `codigoReparticion` ya es único en toda la tabla (confirmado al parsear: 0 duplicados en 4.310 filas), y además más robusto porque muchos nodos no tienen `Hospital` real detrás.

Las reglas de negocio de "qué es un puesto de conducción válido" (códigos 25/60/37/83/85/87 + `unificadorPuesto` + `codigoJefaturas`) son un puerto literal de `CONDICION_CARGOS` de la app vieja — los nombres de campo de v2 (`Cargo.unificadorPuesto`, `Cargo.codigoRegistro.codigo`, `Ocupacion.codigoJefaturas`, `Ocupacion.situacionRevista`) resultaron ser exactamente los mismos datos ya migrados con otro nombre, así que no hubo que reinterpretar ninguna regla, solo traducir el SQL a Prisma. El filtro se aplica en memoria (no en el `where` de Prisma) porque son 4 ramas de condición distintas sobre un resultado ya chico (los cargos de un árbol puntual) — más simple y legible que forzarlo en un único `where` anidado.

Archivos: `organigrama.schema.ts` (Zod: `sigla` XOR `seccion`), `organigrama.service.ts` (armado del árbol, cruce de personas, agrupación SDHOS por régimen, orden jerárquico — todo puerto literal de la lógica vieja), `organigrama.routes.ts` (`GET /api/v1/organigrama`, sin permiso especial — ver más abajo).

**Permisos:** en la app vieja el organigrama es de lectura abierta a todos los roles (admin, editor, viewer, director — verificado en `pagePermissions.js`). En v2 alcanza con `authenticate`, igual que `/hospitales` o `/escalafones` — no se creó ningún permiso nuevo.

### Frontend (`apps/web/src/modules/organigrama/`)
Puerto completo de los 7 archivos viejos, adaptados al shape de nodo de v2 (`id/nombre/tipo/persona/hijos` camelCase en vez de `id/name/title/persona/children`) y a los datos ya disponibles en v2 en vez de re-derivarlos:
- `lib/organigramaHelpers.ts` — `tipoColor`, `stripRedundantPrefix`, `searchOrgTree`, `collectVacantes`.
- `hooks/useOrganigrama.ts` — React Query.
- `components/OrganigramaTreeNode.tsx` — vista Árbol.
- `components/OrganigramaFlowView.tsx` — vista Diagrama (React Flow + export PNG). **Lazy-loaded** (ver Dependencias nuevas).
- `components/PersonaModal.tsx`, `components/VacantesModal.tsx`.
- `pages/OrganigramaHomePage.tsx` — buscador de hospital/sección. **Simplificación real**: la app vieja tenía un archivo estático `hospitals-data.js` con categoría hardcodeada por hospital; v2 ya tiene esa categorización en `Hospital.tipo` (cargada por la migración `20260908000000_hospitales_enriquecer`) — se lee de la API en vez de duplicar una lista estática.
- `pages/OrganigramaDetallePage.tsx` — **unifica** los dos archivos casi idénticos de la app vieja (`OrganigramaDetallePage.jsx` por sigla y `OrganigramaSeccionPage.jsx` por sección, que solo diferían en cómo arman los params) en uno solo que lee `:code` o `:seccion` según la ruta.

Rutas: `/organigrama` (Home), `/organigrama/seccion/:seccion`, `/organigrama/:code` — todas dentro del `ProtectedRoute` general, sin `RequirePermiso`. Link nuevo en el menú (`AppShell.tsx`, ícono 🏢, sin gate de permiso).

### Dependencias nuevas
La vista Diagrama usaba en la app vieja `@xyflow/react` (React Flow) + `html-to-image` (export PNG) + `@heroicons/react` (íconos) — ninguna estaba en `apps/web`. Se agregaron las tres (mismas versiones que la app vieja). `@heroicons/react` en vez de `lucide-react` (que sí está en v2 pero sin usar en ningún lado todavía) porque no había ninguna convención de íconos establecida que respetar, y portar los nombres exactos de heroicons evitó tener que re-mapear cada ícono a su equivalente en otra librería.

**Efecto secundario real, ya resuelto:** las tres dependencias empujaron el bundle principal de `apps/web` a 2.13 MB, por encima del límite default de precache del plugin PWA (2 MiB) — **rompía el build** (`vite build` fallaba). Se resolvió con dos cambios:
1. `OrganigramaFlowView` se carga con `React.lazy()` + `Suspense` (es el único punto de toda la app que usa `@xyflow/react`/`html-to-image`, y la vista por defecto es "Árbol" no "Diagrama" — no tiene sentido que todos paguen ese peso en el chunk principal). Bajó el bundle principal a 1.92 MB.
2. Por las dudas, se subió igual `workbox.maximumFileSizeToCacheInBytes` a 4 MB en `vite.config.ts` — margen para que este mismo problema no vuelva a romper el build con la próxima dependencia grande que se agregue.

---

## Verificación

- `tsc --noEmit` limpio en `apps/api` y `apps/web`.
- **`pnpm exec vite build` corrido y verificado exitoso** (incluye el paso de generación del service worker de la PWA, que fue justamente el que rompía antes del fix de dependencias) — esto es más verificación de la que se pudo hacer en el ítem anterior (tablas de referencia), donde no se llegó a correr un build completo.
- **`import-organigrama.ts --dry-run` corrido contra el dump real** (sin necesitar Postgres arriba, ver estado del entorno): 4.310 filas parseadas, 0 duplicados de `codigo_reparticion`, muestra de datos verificada a mano (acentos, escapes de path con backslash, y campos NULL todos correctos).
**2026-09-08, actualización — Postgres volvió a estar arriba (Docker, Agustín) y se completó la verificación E2E real:**
- Docker tenía el container `api` con la imagen vieja (sin el módulo organigrama) → 404. Se resolvió con `docker compose up -d --build api`.
- El Postgres real de Docker en esta sesión quedó expuesto en **puerto 5432**, no 5433 — el `docker-compose.override.yml` (recreado en el documento anterior) no se estaba aplicando. Sin investigar más a fondo por qué (no bloqueante, con 5432 alcanza), se documenta acá para quien retome: no asumir 5433 sin confirmar con `netstat`/`docker compose ps`.
- La tabla `organigramas` había quedado en 0 filas (el import no se había llegado a correr) — se corrió `pnpm exec tsx scripts/import-organigrama.ts` directo contra `localhost:5432` y cargó las 4.310 filas reales sin errores.
- **Verificado con login real en el navegador**: Home → HGAPP → árbol carga correctamente ("Hospital General de Agudos Parmenio Piñero", 3 hijos). ✅ Punto 1 y 2 originales de la lista de pendientes, resueltos.

**Hallazgo nuevo (no resuelto a propósito, decisión de Agustín): todos los nodos salen "Vacante".**
El árbol carga bien pero ningún puesto muestra persona asignada. Causa raíz encontrada:
`Cargo.unificadorPuesto` está en `''` (string vacío) en el **100% de los 46.889 cargos** de esta
base, para los 6 códigos de registro que usa `esCargoDeConduccion()` (25, 60, 37, 83, 85, 87) —
verificado con un `groupBy` directo contra la base. Sin ese dato no hay forma de que el cruce
"¿es un puesto de conducción?" dé `true` para ningún cargo, así que el 100% de los nodos con
persona quedan como vacante aunque `Cargo.codigoRepa` y las ocupaciones activas sí están bien
pobladas (46.889 y 45.100 respectivamente). Esto **no es un bug del organigrama** — es un gap en
el pipeline que puebla `Cargo.unificadorPuesto` desde Dotaneitor (la misma tabla `RefUnificadorPuesto`
que se migró en el ítem anterior de esta serie), y probablemente afecta a más pantallas que esta.
Agustín decidió explícitamente **no investigarlo ahora** — queda anotado para una sesión aparte.

---

## Módulo "Árbol" (S/N sprint) — carga de estructura desde Excel, sin dev

A pedido de Agustín, además de lo anterior se agregó una pantalla de administración para poder
actualizar la tabla `organigramas` sin depender de que un dev corra `import-organigrama.ts` — igual
en espíritu al módulo de tablas de referencia, pero para esta tabla puntual.

**Importante — alcance deliberadamente separado del hallazgo de arriba**: este módulo reemplaza
la ESTRUCTURA (jerarquía de nodos), no toca `Cargo.unificadorPuesto` ni ningún dato de
personas/ocupaciones. Subir un Excel acá no arregla el problema de "todo vacante" — son dos cosas
distintas, ver el hallazgo de la sección anterior.

- **Backend**: `POST /api/v1/organigrama/upload` (multipart, mismo cuidado con el consumo del
  stream que `padron.routes.ts`) — `reemplazarOrganigramaService` en `organigrama.service.ts` parsea
  el Excel con `xlsx` (mismo patrón `createRequire` que `bajas-sial.service.ts`), normaliza headers
  (trim + lowercase, tolera mayúsculas/espacios), valida columnas obligatorias
  (`lvl`, `tipo`, `codigo_reparticion`, `sigla`, `path`, `path_nombres`) y duplicados de
  `codigo_reparticion`, y reemplaza la tabla entera (`deleteMany` + `createMany` en lotes de 500,
  sin `$transaction` envolvente — mismo motivo que el script de import: timeout default de 5s de
  Prisma para transacciones interactivas, no alcanza para miles de filas).
- **Permiso nuevo**: `configuracion:gestionar_organigrama`, solo admin (`scripts/seed_organigrama_permisos.sql`,
  aplicado a la base local). El `GET /` de lectura del organigrama sigue sin permiso (abierto a todos).
- **Frontend**: `OrganigramaArbolPage.tsx` en `modules/organigrama/pages/` — drag&drop o file picker,
  muestra las columnas esperadas, resultado/errores de la carga. Ruta `/arbol`, link "Árbol" 🌳 en el
  sidebar entre "Bajas Consolidadas" y "Configuración" (tal como lo pidió Agustín), gateado con el
  permiso nuevo tanto en el link como en la ruta.
- **Verificado**: se probó `reemplazarOrganigramaService` directo (sin pasar por HTTP, para no
  depender de un rebuild de Docker) con un Excel sintético armado en memoria (`aoa_to_sheet`,
  headers con mayúsculas/espacios raros a propósito) — cargó las filas correctamente y normalizó
  bien el header. **Se restauraron las 4.310 filas reales inmediatamente después** (la prueba es
  destructiva por diseño, igual que la operación real). `tsc --noEmit` limpio en ambos paquetes.
  **No probado todavía por HTTP/UI real** — el container `api` corriendo no tiene este endpoint
  nuevo hasta el próximo `docker compose up -d --build api`.

---

## Pendiente

| # | Pendiente | Bloqueante |
|---|---|---|
| 1 | Rebuild del container `api` para que `/organigrama/upload` quede disponible, y probar la pantalla "Árbol" desde la UI real | — |
| 2 | Investigar por qué `Cargo.unificadorPuesto` está vacío en el 100% de los cargos (ver hallazgo arriba) | Decisión de Agustín: pausado, no ahora |
| 3 | Averiguar por qué `docker-compose.override.yml` no remapea a 5433 en esta máquina (quedó en 5432) | No bloqueante, solo prolijidad |
| 4 | Commitear y mergear (quedó en `deploy` sin commitear) | — |
| 5 | Repetir el import inicial (y decidir cómo distribuir el Excel de carga) contra producción cuando esto se despliegue | El dump de origen (`dotacion-rrhh/Doc/schema_only.sql`) no viaja a producción |
| 6 | Elegir el próximo ítem de la lista de gaps (recorridas, hospitales, auditoría o tokens) | Decisión de negocio |
