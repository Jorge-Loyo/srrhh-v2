# SPRINT 21 — Consumidores secundarios de puesto/especialidad + documentos exportables

**Estado:** 📋 Planificado
**Autores:** Jorge (full — backend + frontend + Python). Agustín trabaja en otra línea, no toma tareas de este sprint.
**Depende de:** Sprint 20 — Consolidación catálogo Puesto/Escalafón/Especialidad ✅ (`puestoCargoId`/`especialidadPuestoId` en `Cargo`, endpoints core migrados)

> **Ejecución (un solo dev, Jorge):** no hay reparto entre personas, así que el orden importa para
> no trabarse a uno mismo. Secuencia recomendada:
>
> 1. **Correctivas del catálogo** (A21-12..A21-16) — ✅ ya hechas (seed). Base lista.
> 2. **Lote de schema + migraciones juntas** (A21-3, A21-4, A21-4b, A21-5, A21-6 parte schema, S21-1)
>    en una sola tanda → un `migrate` → regenerar cliente Prisma. Evita ir y volver al schema.
> 3. **Backend** (services que leen/escriben lo nuevo): S21-2/3/5/6/7/8, A21-4b (histórico roles),
>    A21-8..A21-11 (paquete normalización + bajas-SIAL/POU/organigrama), A21-6 back.
> 4. **Frontend**: S21-4 (combobox), S21-9 (exportables), A21-6 front (UI postulantes→inscriptos).
> 5. **Verificación e2e** (S21-10, S21-11) al final.

---

## Objetivo

Migrar a `puestos_cargo`/`especialidades_puesto` los consumidores de puesto/especialidad que Sprint 20 dejó fuera de alcance por ser secundarios, **excepto** los que un análisis dedicado (ver "Validación previa" abajo) confirmó que son snapshots históricos legítimos y deben quedar como están. El pipeline Dotaneitor y las tablas `Ref*` quedan para Sprint 22 — es un bloque de trabajo propio, no entra acá.

## Validación previa (2026-09-21) — qué es dato vivo y qué es snapshot legítimo

Antes de escribir este sprint se auditó código real (no supuestos) de cada consumidor. Resultado:

**Queda como está — snapshot histórico legítimo, NO se toca en este sprint:**

- `MiembroJuradoSorteado.puesto`/`.especialidad`/`.cumpleEspecialidad` — snapshot explícito del acta de sorteo, documentado como tal en el propio schema ("el padrón cambia semanalmente; el acta debe reflejar el estado del día del sorteo"). Matiz encontrado: `SorteoJurado.confirmado` es reversible (`revertirConfirmacionService`, `sorteoJurado.service.ts:543-557`), no es inmutable a nivel de BD — se deja anotado como nota, no como tarea de este sprint.
- `Pou.especialidad` — foto mensual explícita, reemplaza la tabla entera en cada carga de Excel, fuente totalmente independiente del resto del sistema.
- `PadronHistorico.especialidad`/`.literalPuesto` — mismo criterio, snapshot histórico por diseño.

**Se migra en este sprint — texto libre sin FK que se trata como dato vivo:**

- `OrdenMerito.especialidad`/`.puesto`, `OrdenMeritoIntegrante.especialidad` — se cargan a mano al crear el registro, sin vínculo a ningún cargo/catálogo. El índice `@@index([especialidad, estado])` alimenta la alerta de negocio real "hay una OM vigente de la misma especialidad" (`ordenes-merito.service.ts:35-41,162-165`) vía `contains`/`insensitive` — dos OM de la misma especialidad tipeada distinto ("Clínica Médica" vs "Clinica Medica") hoy **no se detectan como coincidentes**, que es un bug de negocio real, no solo estético.
- `Postulante.especialidad` — mismo patrón, texto libre cargado al inscribir, sin FK.
- `Persona.especialidadPrincipal` — **hallazgo del análisis, no solo una migración cosmética**: el campo se escribe una sola vez al alta de la persona (`padron.service.ts:1677`) y **nunca se vuelve a actualizar** en padrones posteriores (confirmado por grep, a diferencia de `especialidadCph` que sí se resincroniza cada semana). Sin embargo Sprint 18 — Designación CPH asume lo contrario: su nota final dice explícitamente que se prefiere `especialidadCph` sobre `especialidadPrincipal` "porque `especialidadPrincipal` es la del cargo actual del padrón y puede ser diferente" — es decir, el sprint 18 la trata como si reflejara el cargo actual en tiempo real, cuando el código no la mantiene así. Esto es una desincronización silenciosa ya en producción de diseño, no algo que este sprint introduzca — hay que corregirla.
- Los 4 puntos de generación de documentos legales en `apps/web/src/shared/lib/exportConcursoDocs.ts` que leen `cargo?.especialidadLegacy` (líneas 94-95, 253-255, 624-627, 718: Autorización/Validación de concurso CPH, Acta de Sorteo de Jurado, Acta de Orden de Mérito). **Motivo de incluirlos explícitamente**: `especialidadLegacy` es justo la columna que Sprint 20 marca como "deja de ser fuente de lectura de cualquier lógica de negocio" — si estos 4 exports no se migran en el mismo sprint que se deja de mantener esa columna al día, se repite el incidente ya documentado de la migración `especialidades_fk` (creada y dropeada 15 días después "por no usada en ninguna query activa", cuando en realidad esta pantalla de exportación sí la necesitaba y nadie la había revisado).

## Tareas

| #      | Tarea                                                                                                                                                                                                                                                                                                                                                                                                        | Dev   | Est. | Prioridad | Estado |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---- | --------- | ------ |
| S21-1  | Schema: `OrdenMerito.especialidadPuestoId` (FK obligatoria → `EspecialidadPuesto`) + `puestoCargoId` opcional; `OrdenMeritoIntegrante.especialidadPuestoId`; `Postulante.especialidadPuestoId`. Reemplazan los campos de texto (se puede dropear directo, no hay datos de producción)                                                                                                                        | Jorge | 2h   | 🔴        | 📋     |
| S21-2  | Backend: `ordenes-merito.service.ts` — filtro/alerta de "OM vigente de la misma especialidad" pasa de `contains`/`insensitive` a comparación por `especialidadPuestoId` (elimina el bug de variantes de tipeo)                                                                                                                                                                                               | Jorge | 2h   | 🔴        | 📋     |
| S21-3  | Backend: `postulantes.service.ts` — alta/listado/filtro de postulante usa `especialidadPuestoId`                                                                                                                                                                                                                                                                                                             | Jorge | 1.5h | 🟡        | 📋     |
| S21-4  | Frontend: formularios de alta de Orden de Mérito e Inscripto — combobox de **especialidad** contra el catálogo (en vez de input libre). **La persona NO se exige que exista:** se carga por CUIL + apellido/nombre como dato externo/informativo (la OM/inscripción puede tener CUILs que aún no están en `personas`). Vínculo a persona diferido y automático (ver A21-18, DECISIONES §9.12).               | Jorge | 3h   | 🔴        | 📋     |
| S21-5  | Decisión + implementación: `Persona.especialidadPrincipal` deja de ser una columna que se escribe una vez y queda vieja — se resuelve **en runtime** desde el `Cargo` vigente de la persona (join ya existente vía `Ocupacion`, mismo patrón `LEFT JOIN LATERAL` de `personas.service.ts`) usando `puestoCargoId`/`especialidadPuestoId`. Se elimina la columna una vez migrados los lectores (S21-6, S21-7) | Jorge | 4h   | 🔴        | 📋     |
| S21-6  | Backend: `sorteoJurado.service.ts:181` — el fallback `p.especialidadCph ?? p.especialidadPrincipal` pasa a usar la especialidad derivada en runtime de S21-5 en vez de la columna vieja                                                                                                                                                                                                                      | Jorge | 1h   | 🔴        | 📋     |
| S21-7  | Backend: revisar todo otro lector de `especialidadPrincipal` detectado en el análisis (listados/filtros de `personas.service.ts`) y migrarlo al valor derivado                                                                                                                                                                                                                                               | Jorge | 2h   | 🟡        | 📋     |
| S21-8  | Backend: exponer en las respuestas de API que alimentan `exportConcursoDocs.ts` (autorización CPH, sorteo de jurado, orden de mérito) el nombre de especialidad resuelto desde `especialidadPuestoId` en vez de `especialidadLegacy`, preservando el mismo shape de campo que ya consume el frontend                                                                                                         | Jorge | 2h   | 🔴        | 📋     |
| S21-9  | Frontend: `exportConcursoDocs.ts` — actualizar las 4 lecturas (`getCasoCph` x2, `exportJuradoPdf`, `exportOrdenMeritoPdf`) para leer el campo nuevo de S21-8 en vez de `cargo?.especialidadLegacy`, con test manual de que los 4 documentos generados (PDF/Word) siguen mostrando la especialidad correctamente                                                                                              | Jorge | 2h   | 🔴        | 📋     |
| S21-10 | Corregir la nota de Sprint 18 — Designación CPH que asume que `especialidadPrincipal` refleja el cargo actual en tiempo real (no lo hacía antes de S21-5); confirmar que el badge de validación de ese sprint sigue funcionando igual ahora que el dato es derivado en runtime en vez de una columna vieja                                                                                                   | Jorge | 1h   | 🟡        | 📋     |
| S21-11 | Verificación e2e: crear Orden de Mérito con especialidad repetida en distinto casing (confirmar que ahora sí alerta), inscribir Postulante, generar los 4 documentos exportables y confirmar que muestran la especialidad correcta, sorteo de jurado con badge de especialidad                                                                                                                               | Jorge | 2h   | 🔴        | 📋     |

**Total estimado:** ~22.5h

## Dependencias entre tareas

```
S21-1 ──┬─► S21-2 ──► S21-4
         └─► S21-3 ──► S21-4

S21-5 ──┬─► S21-6
         ├─► S21-7
         └─► S21-10

S21-8 ──► S21-9

(S21-1..S21-4) + (S21-5..S21-7) + (S21-8..S21-9) ──► S21-11
```

## Criterio de éxito

- [ ] Dos Órdenes de Mérito con la misma especialidad tipeada distinto se detectan como coincidentes (bug de negocio real resuelto, no solo cosmético).
- [ ] `Persona.especialidadPrincipal` como columna fija-al-alta deja de existir; el valor "especialidad del cargo actual" se resuelve siempre en runtime contra el `Cargo` vigente.
- [ ] Los 4 documentos legales exportables (Autorización/Validación CPH, Acta de Sorteo de Jurado, Acta de Orden de Mérito) siguen mostrando la especialidad correctamente, ahora leída del catálogo en vez de `especialidadLegacy`.
- [ ] `MiembroJuradoSorteado`, `Pou`, `PadronHistorico` quedan sin tocar — confirmado que ningún cambio de este sprint los afecta.

## Notas

- **Dotaneitor y las 6 tablas `Ref*` (`RefAgrupador`, `RefUnificadorPuesto`, `RefEspecialidadCuil`, `RefCorreccionLitPuesto`, `RefCorreccionEspecialidad`, `RefEspecialidadPorPuesto`) quedan explícitamente fuera de este sprint.** Análisis dedicado (2026-09-21) confirmó que es técnicamente viable evolucionar el microservicio Python para resolver `puestoCargoId`/`especialidadPuestoId` directo (ya tiene conexión a Postgres propia y el patrón de "cargar tabla de referencia en runtime + matching normalizado" establecido), pero requiere decidir primero: (a) qué pasa con las 6 tablas `Ref*` (¿se reemplazan por un mapeo directo a IDs, o se mantienen como capa de corrección previa a una resolución final contra el catálogo?), (b) la política de "sin match" en Python (mismo problema que Sprint 20 S20-6 resuelve del lado Node), y (c) curar `EspecialidadPuesto` para cubrir la granularidad real que hoy vive en el diccionario estático `MAPEO_ESPECIALIDAD_POR_PUESTO` (una misma especialidad puede repetirse bajo distintos puestos — no es 1:1). Esto amerita un **Sprint 22** propio.
- Se detectó (no corresponde a este sprint, dejar registrado): `README.md` de `services/dotaneitor/` documenta endpoints `/diff` y `/guardar-bd` que **ya no existen** en el código — el diff hoy lo calcula Node directo contra Postgres. Actualizar esa documentación cuando se toque el servicio en Sprint 22.
- Precedente que este sprint existe para no repetir: la migración `20260910000001_especialidades_fk` se dropeó 15 días después por "no usada en ninguna query activa" — en ese momento nadie había revisado que `exportConcursoDocs.ts` sí la necesitaba. S21-8/S21-9 existen puntualmente para no repetir ese error.

---

## Adiciones del taller Dotaneitor (2026-09-28)

> Consolidación de las decisiones del taller de rediseño del Dotaneitor
> (`Doc/Referencias/DOTANEITOR_DECISIONES.md`) que impactan a este sprint. No es un plan
> paralelo: son ajustes/adiciones a las tareas de arriba.

### A21-1 · Regla transversal: minúscula + sin tilde en toda la BD

Decisión del taller: **todos los valores de texto que entran a la BD van en minúscula y sin
tilde** (nombres, especialidades, puestos, etc.), y los **nombres de columna** en snake_case sin
tilde/espacios. Impacto en este sprint:

- Los campos que se migran a FK (`especialidadPuestoId`, etc.) ya no sufren el problema de casing,
  pero el **catálogo** (`especialidades_puesto`, `puestos_cargo`) debe quedar sembrado en minúscula
  y sin tilde (coordinar con el seed curado de S20-4).
- Ventaja: como el Sprint 20 hace `prisma migrate reset` (BD de desarrollo, sin datos de
  producción), **no hay limpieza retroactiva** — todo entra limpio desde cero. La normalización
  solo aplica a lo que entra, no a datos viejos.

### A21-2 · Flag `revisado` en catálogos (literal puesto / especialidad)

Al migrar los consumidores a FK, tener en cuenta que el catálogo va a incorporar un flag
**`revisado`** (`true` = validado por humano · `false` = alta automática del padrón pendiente de
revisar) — ver detalle en S22. Los dropdowns/combobox de este sprint (Orden de Mérito,
Postulante) deben ofrecer **solo** las opciones con `revisado=true`.

### Referencia

- Documento de decisiones del taller: `Doc/Referencias/DOTANEITOR_DECISIONES.md` (decisiones §1, §4.ter).
- Fix relacionado ya aplicado: `persona.activo` (paso 10 en `aprobarSnapshotService`) — ver ese doc §6.

---

## Adiciones de estructura de datos (2026-09-22)

> Origen: auditoría de la BD local (`Doc/Referencias/MAPEO_NORMALIZACION_BD.md`) y decisiones
> consolidadas en `DOTANEITOR_DECISIONES.md §9`. **Sprint 20 ya está terminado en otra rama**, así
> que estos cambios de schema entran acá como **migraciones nuevas sobre el schema que dejó S20**
> (no como parte de su `migrate reset`). Todo aplica a la **toma de información**, sin limpieza
> retroactiva. Ver `DOTANEITOR_DECISIONES.md §9` para el detalle de cada decisión.

### Tareas

| #      | Tarea                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Dev   | Est. | Prioridad | Estado |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- | --------- | ------ |
| A21-3  | **`personas` tabla única + nombre en 3 columnas.** Schema: agregar `apellido` y `nombre` a `personas`, manteniendo `apellido_nombre` (regla de negocio). Confirmar que todas las cargas (padrón, bajas SIAL, alta manual) alimentan **esta** tabla, sin tablas paralelas de persona. Migración + ajuste de los writers. (§9.2)                                                                                                                                                                                                                                                                                                                 | Jorge | 3h   | 🔴        | 📋     |
| A21-4  | **`ocupaciones`: CUIL solo.** Schema: `cuil_y_rol` deja de guardar el concatenado → reducir a `cuil` (solo CUIL). La descomposición de `id_sial_rol` (legajo + nro_rol) va a la tabla nueva `roles_persona` (A21-4b), no a `ocupaciones`. (§9.3)                                                                                                                                                                                                                                                                                                                                                                                               | Jorge | 2h   | 🔴        | 📋     |
| A21-4b | **Tabla dedicada `roles_persona` (histórico de roles).** Schema: nueva tabla con `persona_id` FK, `id_sial` (legajo sin rol), `nro_rol`, `cargo_id` FK, `desde`, `hasta`, `id_sial_rol` crudo. Es el histórico de roles de la persona (opción (a): `ocupaciones` queda como estado vivo, `roles_persona` como histórico). Permite `COUNT` de roles por legajo y mapear cargos. La vista de Personas pasa a leer de acá. Migración + backend + ajuste del writer. (§9.6)                                                                                                                                                                        | Jorge | 4h   | 🔴        | 📋     |
| A21-5  | **Estandarizar convención snake_case.** Renombrar la columna `ocupaciones."diasGuardia"` → `dias_guardia` (única columna camelCase de la BD, hoy vacía) y su `@map` en Prisma. Verificar que ningún `$queryRaw` la referencie con el nombre viejo. (§9.1)                                                                                                                                                                                                                                                                                                                                                                                      | Jorge | 1h   | 🟡        | 📋     |
| A21-6  | **Unificar postulantes → `inscriptos_concurso`.** Eliminar las tablas `postulantes` y `postulantes_concurso` (vacías) y el modelo Prisma. Migrar los consumidores del módulo `postulantes` (back `postulantes.service.ts` + front módulo `postulantes`) a `inscriptos_concurso`. Confirmar que no hay datos que migrar. (§9.4)                                                                                                                                                                                                                                                                                                                 | Jorge | 3h   | 🟡        | 📋     |
| A21-7  | **Limpieza estructural.** (a) Eliminar la tabla de backup `_backup_cph_estados`. (b) Confirmar si `cargos.lit_familia` se llena en algún flujo; si no, eliminar la columna. (c) Verificar tras el schema que `cantidad_cargos` NO exista en `concursos_cph`/`concursos_ceetps` (drift detectado en local). (§9.5)                                                                                                                                                                                                                                                                                                                              | Jorge | 1.5h | 🟢        | 📋     |
| A21-8  | **Paquete de normalización compartido** (`packages/normalizacion`, TS): fuente de verdad única (minúscula + sin tilde + mojibake + canonización CPH + partición de nombre). **Decisión: paquete compartido, NO microservicios separados** (§9.8). Reemplaza los normalizadores ad-hoc sueltos de cada módulo.                                                                                                                                                                                                                                                                                                                                  | Jorge | 4h   | 🔴        | 📋     |
| A21-9  | **Bajas SIAL usa el paquete** (`bajas-sial.service.ts`): reemplazar `str()` (hoy solo `.trim()`) por la normalización compartida en `ayn`/`desc_rep`/`lit_puesto`/`mot_baja`/etc.; eliminar el `NOMBRES_CPH_VIEJOS` duplicado y usar la canonización del paquete. Deja de meter texto crudo en mayúscula/con tilde. (§9.8)                                                                                                                                                                                                                                                                                                                     | Jorge | 2h   | 🔴        | 📋     |
| A21-10 | **POU usa el paquete** (`pou.service.ts`): `normalizeCell` + campos de texto (`sigla`/`perfil`/`especialidad`/`descripcion_sigla`) pasan por la normalización compartida. (§9.8)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Jorge | 1.5h | 🟡        | 📋     |
| A21-11 | **Organigrama usa el paquete** (`organigrama.service.ts`): reemplazar el `normalizarTexto` local por el del paquete y aplicarlo también a lo que **persiste** (no solo al match). (§9.8)                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Jorge | 1.5h | 🟡        | 📋     |
| A21-18 | **Match diferido CUIL→persona (OM + inscriptos)** en `aprobarSnapshotService`: al aprobar un snapshot, para cada CUIL que entra al padrón con `id_sial_rol` válido, vincular automáticamente los `OrdenMeritoIntegrante` e `inscriptos_concurso` con ese CUIL y `personaId` null → completar `personaId`. Parámetros de match para detectar "concurso ya asignado": **CUIL + carrera + especialidad + rol + repartición + sigla (hospital)** — sigla y repartición fijan a qué cargo concreto se asigna. Dejar el CUIL "en observación" para cambios de rol/período (reusa `ConcursoCph.validado*`). Backend, sin confirmación manual. (§9.12) | Jorge | 4h   | 🔴        | 📋     |

**Subtotal adiciones:** ~13.5h (A21-3..A21-7, con `roles_persona`) + ~9h (A21-8..A21-11, normalización unificada) = **~22.5h**.

> Nota de dependencia con S22: la **partición del nombre** (`"Apellido, Nombre"` → `apellido` +
> `nombre`) y la **descomposición de `id_sial_rol`** las hace el pipeline del Dotaneitor al cargar
> (ver S22, **S22-15 y S22-16**). En S21 se crean las columnas y se migran los consumidores; en S22
> se alimenta el dato desde la carga.

---

## Evaluación del Sprint 20 aplicado (2026-09-22) — deuda que hereda S21/S22

> Se aplicó el Sprint 20 en la base local (`migrate reset` + seed, 83 migraciones OK) y se evaluó
> tarea por tarea. Balance: **el núcleo funciona** (FK, resolver, dropdowns por catálogo, typecheck
> back+front OK), pero quedaron **4 pendientes** que S21 debe cerrar antes de habilitar S22, porque
> el pipeline nuevo (S22) depende de ellos.

### Lo que quedó bien en S20

- FK `puestoCargoId` (NOT NULL) + `especialidadPuestoId` (nullable) en `Cargo` y `SolicitudAlta`.
- `resolverPuestoCargo.ts`: resuelve por `escalafonId:lower(trim(literal))`; sin match auto-crea
  con `pendienteCurar=true` sin frenar el import. Bien resuelto.
- `puestos.routes` ya no agrupa por `LOWER(TRIM(literal_puesto))` (lee del catálogo).
- `prefijoDeCargo()` prioriza `modalidad`/`tipoPuesto` del catálogo (con fallback `.includes()`).
- Frontend: `AltaCargosPage`/wizards mandan `puestoCargoId`/`especialidadPuestoId`;
  `puestos-cargo.routes` tiene `POST`/`PUT` (admin de catálogo). `Sub-Director` quedó `conduccion`.

### Pendientes que hereda S21 (tareas correctivas)

| #          | Tarea                                                                                                                                                                                                                                                                                                          | Dev   | Est. | Prioridad | Estado |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- | --------- | ------ |
| A21-12     | **Poblar `codigos_registro`.** ✅ Hecho en `prisma/seed.ts` (const `CODIGOS_REGISTRO`): 37→CPH, 22→CPH, 23→Guardias, 24→Residencias, 83, 85, 87 (+ 07/16T de migraciones = 9 filas). Verificado en BD. Desbloquea S22-5.                                                                                       | Jorge | 2h   | 🔴        | ✅     |
| A21-13     | **Normalizar el catálogo a minúscula/sin tilde.** ✅ Hecho en el seed (`normalizarTexto`, aplicada a nombre de puesto y especialidad). Verificado: puestos 0/382 con mayúsc./tilde, especialidades 0/1197. Mantiene la ñ.                                                                                      | Jorge | 3h   | 🔴        | ✅     |
| A21-14     | **Deduplicar el catálogo por tilde/casing.** ✅ Resuelto automáticamente: al sembrar con nombre normalizado, el upsert colapsa los duplicados (puestos 514→382, especialidades 2043→1197). Los `director (01)` que aparecen 2× son por **modalidad** distinta (pof/ambos), no por tilde — válido según modelo. | Jorge | 2h   | 🔴        | ✅     |
| A21-15     | **Arreglar los warnings del seed.** ✅ Hecho en el seed (`REMAP_ESCALAFON_CODIGO`): `Médicos-e47d1ac`/`CPH`→22, `CEETPS-d7fc610`→85, `Escalafón Ge-af6efb0`→83. Sin warnings de "escalafón no existe"; entran los 138 puestos que se omitían.                                                                  | Jorge | 2h   | 🟡        | ✅     |
| A21-16     | **Unificar el naming del flag "sin revisar".** ✅ Decisión: se adopta **`PuestoCargo.pendienteCurar`** (ya existe en schema/código, S20). Los docs que decían `revisado` (A21-2, S22-6, DECISIONES §4.ter) se actualizan a `pendienteCurar`.                                                                   | Jorge | 1h   | 🟡        | ✅     |
| ~~A21-17~~ | **FALSO POSITIVO — descartada.** La evaluación previa creyó que faltaban las FK en `ConcursoCph`/`ConcursoCeetps`. **Sí existen** como `puestoCargoSolicitadoId` + `especialidadPuestoSolicitadaId` (schema líneas 569-570 y 891). S20-3 estaba completo en los 4 modelos.                                     | —     | —    | —         | ❌     |

**Subtotal correctivas:** ~10h — **completadas** (verificadas contra la BD local reseteada).

> Las correctivas se aplicaron en `prisma/seed.ts` y se validaron con `migrate reset` + `db:seed`.
> Con esto la precondición de S22 (`codigos_registro` + catálogo normalizado) queda cumplida.
