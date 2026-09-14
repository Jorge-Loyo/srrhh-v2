# POST-SPRINT — Triangulación POU vs Concursos + Mejoras de datos

**Fecha:** 2026-09
**Autor:** Jorge
**Commits:** `13f7b2b`, `7d0aa29`, `887fcb5`, `27bfad0`, `aeb0213`, `77e102c`
**Ramas mergeadas:** `jorge` → `main`, `develop`, `deploy`

---

## Objetivo

Cruzar los datos del POU (dotación planificada) con los concursos abiertos del sistema,
identificar qué cargos en concurso tienen cobertura POU y cuáles no, y exponer esa
información en el frontend. Trabajo paralelo de limpieza y normalización de datos de cargos.

---

## Trabajo realizado

### 1. Fix universo_totalizador en organigramas

- `SECCION_UNIVERSOS` en `organigrama.schema.ts`: `'nivel-central'` → `'Nivel Central'`, `'atencion-primaria'` → `'APS'`
- UPDATE masivo cruzando `organigramas` con `hospitales` por sigla (4357 filas)
- 17 nodos sin match (`DGAH*`, `UAIEAIT`, `UPEFIAA`) actualizados manualmente
- Paso 9 agregado en `aprobarSnapshotService`: sincroniza `organigramas.universo_totalizador` desde `hospitales` en cada aprobación de padrón

### 2. Tabla de mapeo explícito de especialidades

Creada tabla `pou_especialidad_mapeo` para cubrir casos donde los nombres difieren entre
el documento POU y el sistema de cargos:

| POU especialidad | cargo especialidad_legacy |
|---|---|
| `CIRUGIA PEDIATRICA` | `CIRUGIA INFANTIL` |
| `RECUPERACION CARDIOVASCULAR` | `RECUPERADOR CARDIOVASCULAR` |
| `RADIODIAGNOSTICO O DIAGNOSTICO POR IMAGENES` | `RADIOLOGIA (RADIODIAGNOSTICO)` |
| `RADIODIAGNOSTICO O DIAGNOSTICO POR IMAGENES` | `DIAGNOSTICO POR IMAGENES` |
| `HEMOTERAPIA E INMUNOHEMATOLOGIA O TEC. EN HEMOTERAPIA` | `HEMOTERAPIA` |
| `OBSTETRICIA O TOCOGINECOLOGIA` | `OBSTETRICIA` |
| `OBSTETRICIA O TOCOGINECOLOGIA` | `TOCOGINECOLOGIA` |
| `OBSTETRICIA O TOCOGINECOLOGIA` | `TOCOGINECOLOGIA Y ECOGRAFIA` |
| `INFECTOLOGO` | `INFECTOLOGIA` |
| `INFECTOLOGO` | `ENFERMEDADES INFECCIOSAS (INFECTOLOGIA)` |
| `ORTOPEDIA Y TRAUMATOLOGIA` | `TRAUMATOLOGIA` |
| `ORTOPEDIA Y TRAUMATOLOGIA INFANTIL` | `TRAUMATOLOGIA` |

### 3. Vista v_pou_triangulacion

Vista SQL que cruza `concursos` → `cargos` → `hospitales` → `pou` usando:
- Similitud exacta (`similarity = 1`) para matches directos
- ILIKE para casos como `CLINICA MEDICA` vs `CLINICA MEDICA (MEDICINA INTERNA)`
- Tabla `pou_especialidad_mapeo` para nombres divergentes

**Mapeo de perfiles POU → unificador_puesto + agrupador:**

| Perfil POU | unificador_puesto | agrupador |
|---|---|---|
| `ESPECIALISTA EN LA GUARDIA MEDICO` | `CPH DE GUARDIA` | `MEDICO` |
| `PROFESIONAL DE LA GUARDIA MEDICO` | `CPH DE GUARDIA` | `NO MEDICO` |
| `PROFESIONAL DE LA SALUD` | `CPH DE PLANTA` | `NO MEDICO` |
| `TECNICO/A DE LA SALUD` | `TECNICO/A DE LA SALUD` | — |
| `Jefe de SECCIÓN` | `JEFE/A DE SECCION` | `JEFES CPH` |
| `Jefe de UNIDAD` | `JEFE/A DE UNIDAD` | `JEFES CPH` |

**Estados posibles (`estado_pou`):**
- `CON POU` — cargo en concurso con fila POU correspondiente
- `SIN POU` — cargo en concurso sin fila POU (médicos de planta, especialidades no cubiertas)
- `SUPLENTE` — cargo suplente de guardia (universo separado, sin POU propio)
- `SIN CLASIFICAR` — cargo sin `unificador_puesto` (datos incompletos) — resuelto a 0

**Solo incluye los 33 hospitales que tienen datos en la tabla `pou`.**

### 4. Backfill unificador_puesto y agrupador

1361 cargos sin `unificador_puesto` clasificados desde `literal_puesto`:

| literal_puesto | unificador_puesto | agrupador |
|---|---|---|
| `ESPECIALISTA EN LA GUARDIA MEDICO` | `CPH DE GUARDIA` | `MEDICO` |
| `MEDICO DE PLANTA` | `CPH DE PLANTA` | `MEDICO` |
| `PROFESIONAL GUARDIA MEDICO` | `CPH DE GUARDIA` | `NO MEDICO` |
| `JEFE DE UNIDAD (05)` | `JEFE/A DE UNIDAD` | `JEFES CPH` |
| `JEFE DE SECCION (06)` | `JEFE/A DE SECCION` | `JEFES CPH` |
| `PSICOLOGO/ODONTOLOGO/BIOQUIMICO/etc. DE PLANTA` | `CPH DE PLANTA` | `NO MEDICO` |
| `BIOQUIMICO/FARMACEUTICO/etc. DE GUARDIA` | `CPH DE GUARDIA` | `NO MEDICO` |
| `JEFE DE DIVISION (04)` | `JEFE/A DE DIVISION` | `JEFES CPH` |
| `JEFE DE DEPARTAMENTO (02)` | `JEFE/A DE DEPARTAMENTO` | `JEFES CPH` |
| `SUB-DIRECTOR (03)` | `SUB-DIRECTOR` | `JEFES CPH` |

Fixes adicionales de capitalización:
- `CPH de Planta` → `CPH DE PLANTA` (37 cargos)
- `CPH de Guardia` → `CPH DE GUARDIA` (16 cargos)

### 5. Endpoint GET /api/v1/pou/triangulacion

Nuevo endpoint en el módulo POU:
- Sin parámetros: devuelve todos los hospitales con POU
- `?sigla=HBR`: filtra por hospital

**Resultado sobre los 33 hospitales con POU:**
- 279 CON POU
- 930 SIN POU (fuera del alcance del POU por diseño)
- 8 SUPLENTE
- 0 SIN CLASIFICAR

**Análisis de los 930 SIN POU:**
- ~461 médicos de planta → POU no los cubre por diseño
- ~177 profesionales de planta sin match de especialidad → fuera del alcance
- ~93 guardia NO MEDICO sin match → fuera del alcance
- ~125 jefaturas DIVISION/DEPARTAMENTO → no contempladas en POU
- ~74 especialidades sin fila POU en ese hospital → genuinamente sin cobertura

### 6. Historial de cargas POU

- Tabla `pou_cargas` creada en BD (id, archivo, filas, usuario_id, created_at)
- `reemplazarPouService` actualizado para registrar cada carga con nombre de archivo y usuario
- Endpoint `GET /api/v1/pou/cargas` — últimas 20 cargas
- `PouCargaPage` actualizada con sección de historial debajo del formulario

### 7. Frontend

**Nuevas páginas:**
- `PouTriangulacionPage` (`/pou/triangulacion`) — tabla con filtros CON POU / SIN POU, selector de hospital, resumen por estado
- `SuplentesPage` (`/suplentes`) — tabla de suplentes de guardia en concurso con buscador

**Cambios en páginas existentes:**
- `PouHomePage` — botón "Triangulación vs Concursos"
- `PouCargaPage` — sección historial de cargas
- `AppShell` — NavLink "Suplentes de Guardia" debajo de POU en el menú lateral

**Nuevos hooks:**
- `useTriangulacion(sigla?)` — consume `/pou/triangulacion`
- `useSuplentes()` — filtra triangulación por `estadoPou === 'SUPLENTE'`
- `usePouCargas()` — consume `/pou/cargas`

---

## Scripts SQL de referencia

| Script | Descripción |
|--------|-------------|
| `scripts/setup_pou_triangulacion.sql` | Crea `pou_especialidad_mapeo` + vista `v_pou_triangulacion`. Idempotente. |
| `scripts/backfill_unificador_puesto.sql` | Backfill `unificador_puesto`/`agrupador` desde `literal_puesto`. Idempotente. |

---

## Fuera del alcance del POU (por diseño — no son bugs)

| Categoría | Motivo |
|-----------|--------|
| `CPH DE PLANTA + MEDICO` | El POU solo cubre guardias médicas, no planta médica |
| `SUPLENTE DE GUARDIA` | Universo separado con mapeo propio |
| `JEFE/A DE DIVISION`, `JEFE/A DE DEPARTAMENTO`, `SUB-DIRECTOR` | Jefaturas no contempladas en el documento POU |
| Especialidades pediátricas (`TERAPIA INTENSIVA INFANTIL`, etc.) | No existen como `especialidad_legacy` en cargos |
| `SIN ESPECIALIDAD` | Datos incompletos en cargos — irresolubles |

---

## Pendiente a futuro

- Opción A: comparación dotación POU vs cargos reales (CON POU: ¿cuántos cargos hay vs dotacion_total?)
- Opción B: cargos vigentes sin cobertura POU (brechas)
- Opción C: vista combinada con diferencias en ambas direcciones
- Frontend para visualizar las opciones A/B/C
