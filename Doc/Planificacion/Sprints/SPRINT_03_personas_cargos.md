# SPRINT 3 — Personas y Cargos

**Estado:** ✅ Completo — verificado con browser real 2026-08-25
**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulos de personas y cargos completamente funcionales.

## Tareas

| #     | Tarea                                                           | Dev     | Est. | Prioridad  |     |
| ----- | --------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S3-1  | `GET /api/v1/personas` paginado con full-text search PostgreSQL | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S3-2  | `GET /api/v1/personas/:id` con ocupaciones activas              | Jorge   | 3h   | 🔴 Crítico | ✅  |
| S3-3  | Filtros personas: hospital, escalafón, activo, búsqueda libre   | Jorge   | 4h   | 🟡 Medio   | ✅  |
| S3-4  | `GET /api/v1/cargos` paginado con filtros                       | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S3-5  | `GET /api/v1/cargos/:id` con ocupación actual                   | Jorge   | 3h   | 🔴 Crítico | ✅  |
| S3-6  | PersonasPage: tabla con búsqueda debounce 300ms                 | Agustin | 8h   | 🔴 Crítico | ✅  |
| S3-7  | PersonaDetailPanel: panel lateral con datos + ocupaciones       | Agustin | 8h   | 🔴 Crítico | ✅  |
| S3-8  | CargosPage: tabla con filtros por hospital y escalafón          | Agustin | 8h   | 🔴 Crítico | ✅  |
| S3-9  | CargoDetailPanel: panel lateral con cargo + persona actual      | Agustin | 6h   | 🟡 Medio   | ✅  |
| S3-10 | Exportar a Excel desde PersonasPage y CargosPage                | Agustin | 4h   | 🟢 Bajo    | ✅  |
| S3-11 | Índice GIN tsvector en `personas.apellido_nombre` (migración)   | Jorge   | 3h   | 🟡 Medio   | ✅  |

## Criterio de éxito

- Búsqueda de personas por nombre/CUIL/DNI funciona con full-text search ✅
- Filtros por hospital y escalafón funcionan ✅
- Panel de detalle muestra ocupaciones activas ✅
- Exportación a Excel disponible ✅

## Notas de implementación

- S3-6 a S3-10 implementados en paralelo por Jorge y Agustin sin coordinación — choque de trabajo, se mantuvo la versión de Jorge (verificada con browser real). Ver decisión de DoD en el plan principal.
- `unaccent` instalado como extensión Postgres + config `spanish_unaccent` para búsqueda sin acentos ("medico" → "Médico").
- `SearchableSelect` combobox genérico para dropdown de 276 puestos.
- Filtro de puesto en cascada por escalafón: `GET /api/v1/puestos?escalafonId=`.
- Export a `.xlsx` real con SheetJS (no CSV) — exporta todo el resultado filtrado paginando en bloques de 1000.

---

# POST-SPRINT 3 — Mejoras UX padrón/personas

**Estado:** ✅ Completado — commit `f178819`, 2026-08-27
**Autor:** Jorge + Claude

## Cambios aplicados

### Ocupaciones: `cargo_desde` / `cargo_hasta`
- Campos `cargoDesdeFecha`/`cargoHastaFecha` en `Ocupacion` (migración + backfill de 48.166 ocupaciones)
- `PersonaDetailPanel` muestra "Cargo desde" y "Cargo hasta"

### Export Excel de padrón: fix `ReferenceError` en runtime
- `exportarSnapshotService` extraído al service (donde `python` y `getSnapshotOrThrow` sí están disponibles)

### Deduplicación de ocupaciones fantasma (regla SIAL)
- `filtrarDuplicados()` en `PersonaDetailPanel`: oculta ocupaciones sin `codigoJefaturas` cuando hay duplicado con jefatura para el mismo `codigo_repa + literal_puesto`

### Filtros persistentes en `/personas`
- `useState` → `useSearchParams` — todos los filtros viven en la URL
- "Volver a Personas" reconstruye la URL con los filtros originales desde `location.state.from`

### Chips de filtros activos
- Burbujas con label legible + botón `×` para quitar individualmente. "Limpiar todo" con 2+ filtros activos.

### Dotaneitor: reconexión automática a Postgres
- `pool_pre_ping=True` en el engine de SQLAlchemy

---

# POST-SPRINT 3B — Cargos: códigos, estados, UX

**Estado:** ✅ Completado — 2026-09
**Autor:** Jorge + Claude

## Cambios aplicados

### Generación de códigos de cargo (`Cargo.codigo`)
- `apps/api/src/shared/codigoCargo.ts` — `prefijoDeCargo()` + `siguienteCodigoCargo()` (secuencial atómico)
- 24 prefijos implementados: `CPH-POF`, `CPH-POU`, `ENF`, `TEC-POF`, `EG`, `AS-MIN`, `RES`, `DOC`, etc.
- Backfill de ~48k cargos existentes via `scripts/backfill-codigos-cargo.sql`

### Estados de cargo: `no_vigente` desde datos históricos
- 3.713 cargos con ocupaciones todas cerradas marcados `no_vigente`
- Al aprobar snapshot, cargos "eliminados" se marcan `no_vigente`

### Búsqueda por prefijo en `/personas`
- `plainto_tsquery` → `to_tsquery` con `:*` por token para búsquedas parciales

### Filtros persistentes en `/cargos`
- Mismo patrón que `/personas`: `useSearchParams`, chips, "Volver a Cargos"
- Nuevo filtro "Ocupación" (Ocupados/Vacantes/Todos)

### Columna Ocupación en tabla de cargos
- Badge verde (Ocupado) o naranja (Vacante)

### Mejoras al detalle de cargo (`CargoDetailPanel`)
- Encabezado: ID SIAL en gris, código cargo grande, puesto, especialidad, badges Vigente/Ocupado
- Historial de personas: tabla con todas las ocupaciones cerradas

---

# POST-SPRINT 3C — Mejoras UX personas/cargos

**Estado:** ✅ Completado — 2026-08-28
**Autor:** Jorge + Claude

## Cambios aplicados

### Retención de cargo: "Cubre en" en `CargoDetailPanel`
- Cuando `ocupacionActual.situacionRevista === 'Retencion de Cargo'`, busca el cargo activo de esa persona
- Sección "Cubre en" con fondo ámbar: código cargo, puesto, hospital, link "Ver cargo activo"

### Filtro por puesto en `/cargos`
- `GET /api/v1/cargos/puestos` con params opcionales `escalafonId`/`hospitalId`
- `SearchableSelect` para puesto en `CargosPage` con cascada al cambiar hospital/escalafón

### Mejoras al `PersonaDetailPanel`
- ID SIAL de persona extraído del primer segmento de `idSialRol`
- Código Cargo en cada ocupación
- Orden de cargos: Vigente → Retención → Histórica
- Sangría de color por estado: verde (activo), ámbar (retención), rojo claro (histórico)
- Campos reorganizados por columna

---

# POST-SPRINT 3D — Maquetas Alta/Baja/Alta por Baja

**Estado:** ✅ Completado — 2026-09
**Autor:** Jorge + Claude

## Cambios aplicados

Maquetas funcionales de las tres páginas del módulo de gestión de cargos. Sin lógica de backend — datos mock, formularios interactivos. Base para implementación real en Sprint 5.

- **`/cargos/alta`** — `AltaCargosPage.tsx`: 3 botones (POF/POU/Estructura), formulario inline por tipo, historial de sesión
- **`/cargos/baja`** — `BajaCargosPage.tsx`: tabla historial con 9 registros mock, estados Pendiente/Confirmada/Anulada
- **`/cargos/alta-por-baja`** — `AltaPorBajaPage.tsx`: tabla con tipo Baja/Concurso, botones Nueva Baja y Nuevo Concurso

### Análisis de datos reales — `base_concursos_limpio.csv`

7.471 concursos CPH reales analizados. Decisiones de diseño derivadas:
- `tipo_de_baja` es opcional (97% vacío en datos reales)
- `cargo_baja` también es opcional (22% sin baja de persona — ampliación de dotación)
- El flujo real no siempre es "baja → concurso": hay concursos por ampliación sin baja previa
