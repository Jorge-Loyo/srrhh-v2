# Plan — Corrección de datos + Estado `validacion_vacante` + Validación de Bajas

> Fecha: 2026-08-10 | Actualizado: 2026-08-19 | Autor: Jorge
> Estado: 🚧 En implementación (Sprint 8-A)

---

## 1. Diagnóstico — estado actual de la BD

### 1.1 Inconsistencias encontradas y resueltas (2026-08-10)

| Problema | Causa raíz | Fix aplicado |
|----------|-----------|--------------|
| 4 cargos `no_vigente` con ocupación activa (`hasta IS NULL`) | Bajas de prueba eliminadas directamente de BD sin revertir el `estado` del cargo ni cerrar la ocupación | `UPDATE ocupaciones SET hasta = '2026-08-18'` para los 4 casos. Estado `no_vigente` es correcto (personas ausentes del último padrón 2026-08-18) |
| 13 cargos `vigente` sin ocupación (todos `MANUAL-*`) | Cargos de prueba creados manualmente, nunca tuvieron persona | `DELETE FROM cargos` — eran datos de prueba |

### 1.2 Estado post-fix

| Métrica | Valor |
|---------|-------|
| Cargos `vigente` | 47.835 |
| Cargos `no_vigente` | 3.717 |
| `no_vigente` con ocupación activa | **0** ✅ |
| `vigente` sin ocupación activa | **0** ✅ |

### 1.3 Problema de diseño pendiente

El enum `EstadoCargo` en BD solo tiene `{vigente, no_vigente}`. El modal de Reglas de Negocio documenta un tercer estado `validacion_vacante` que **no existe todavía**. El padrón actualmente marca cargos como `no_vigente` directamente para los "eliminados" — lo cual contradice la regla de negocio ("el padrón NUNCA marca no_vigente").

---

## 2. Reglas de negocio definitivas (acordadas con Jorge, 2026-08-10)

### 2.1 Estados del cargo

```
vigente          → cargo activo en la estructura
no_vigente       → estado terminal, solo por acto administrativo manual
validacion_vacante → estado intermedio, solo generado por el padrón semanal
```

### 2.2 Cuándo pasa a cada estado

| Evento | Estado resultante | Quién lo hace |
|--------|------------------|---------------|
| Alta de cargo (manual o padrón) | `vigente` | Sistema |
| Padrón detecta "eliminado" (persona desaparece del Excel) | `validacion_vacante` | Padrón automático |
| Operador confirma la baja desde Validación de Bajas | `no_vigente` | Manual |
| Operador rechaza desde Validación de Bajas | `vigente` (vuelve) | Manual |
| Baja manual desde `/cargos/baja` o `/cargos/alta-por-baja` sin concurso | `no_vigente` | Manual |
| Reemplazo de persona desde `/cargos/baja/nueva` | `vigente` (se mantiene) | Manual |

### 2.3 Qué pasa con la ocupación en cada transición

| Evento | Ocupación |
|--------|-----------|
| Padrón detecta "eliminado" → `validacion_vacante` | **Se cierra** (`hasta = fecha del padrón`). La persona ya no figura en el Excel = ya no ocupa el cargo. |
| Operador confirma baja → `no_vigente` | Ya estaba cerrada. Se registra el acto administrativo. |
| Operador rechaza → `vigente` | Se reabre la ocupación (`hasta = NULL`) si el rechazo es por error del sistema. |
| Reemplazo de persona → cargo sigue `vigente` | Se cierra ocupación anterior + se crea nueva ocupación. |

### 2.4 Caso especial: padrón siguiente trae de vuelta a la persona

Si un cargo está en `validacion_vacante` y el siguiente padrón semanal incluye de nuevo a esa persona:
- El padrón **no se puede aprobar** hasta resolver estos casos
- Se genera una alerta bloqueante en la pantalla de aprobación del padrón
- El operador valida uno por uno: confirmar (cargo vuelve a `vigente`, se reabre ocupación) o mantener en `validacion_vacante`

### 2.5 `validacion_vacante` y concursos

- Un cargo en `validacion_vacante` **NO puede generar concurso** directamente
- Primero debe confirmarse la baja (→ `no_vigente`) o hacerse un reemplazo (→ `vigente`)
- Desde `/cargos/baja/nueva` se pueden seleccionar cargos `validacion_vacante` Y `vigente` para el flujo de reemplazo

---

## 3. Triangulación de datos históricos

### 3.1 Objetivo

Cruzar padrón histórico + bajas SIAL + ocupaciones para reconstruir el historial de cada cargo y persona con la mayor fidelidad posible.

### 3.2 Fuentes disponibles

| Fuente | Tabla | Qué aporta |
|--------|-------|-----------|
| Padrón semanal SIAL | `padron_historico` | Foto semanal de quién ocupa qué cargo, con `id_sial_rol`, `situacion_revista`, `fecha_asignada` |
| Bajas SIAL | `baja_sial_registros` / `baja_sial_snapshots` | Registro de bajas del sistema SIAL (archivo `Bajas_salud_YYYYMMDD.xlsx`) |
| Ocupaciones | `ocupaciones` | Historial de ocupaciones con `desde`/`hasta` |
| Concursos CPH | `concursos_cph` | Historial concursal por cargo |
| Concursos CEETPS | `concursos_ceetps` | Ídem para CEETPS |

### 3.3 Qué se puede triangular

| Dato | Posible | Fuente |
|------|---------|--------|
| Quién ocupa un cargo hoy | ✅ Siempre | `ocupaciones WHERE hasta IS NULL` |
| Quién ocupó un cargo históricamente | ✅ Parcial | `ocupaciones WHERE hasta IS NOT NULL` + `padron_historico` |
| Cuántos cargos activos tiene una persona | ✅ | `ocupaciones WHERE hasta IS NULL` por `persona_id` |
| Cargos retenidos de una persona | ✅ | `ocupaciones WHERE situacion_revista = 'Retencion de Cargo'` |
| Historial de concursos de un cargo | ✅ | `concursos_cph/ceetps WHERE cargo_id = ?` |
| Fecha exacta de inicio de cada ocupación | ⚠️ Parcial | `cargo_desde` en ocupaciones (backfill desde Excel) |
| Motivo de baja de cada ocupación | ⚠️ Parcial | Solo si tiene baja registrada en `bajas` |

---

## 4. Tareas a implementar

### Sprint 8-A — Migración y lógica `validacion_vacante`

| # | Tarea | Descripción |
|---|-------|-------------|
| S8A-1 | **Migración enum** | Agregar `validacion_vacante` al enum `EstadoCargo` en Prisma + migración BD |
| S8A-2 | **Padrón: cambiar lógica "eliminados"** | En `aprobarSnapshotService`, cuando un `id_sial_rol` desaparece: cerrar ocupación (`hasta = fecha`) + poner cargo en `validacion_vacante` en lugar de `no_vigente` |
| S8A-3 | **Padrón: alerta bloqueante** | Al aprobar un padrón, detectar si algún cargo en `validacion_vacante` tiene un `id_sial_rol` que vuelve a aparecer. Si hay casos, bloquear la aprobación y mostrar lista para resolver uno por uno |
| S8A-4 | **`/cargos/baja/nueva`: incluir `validacion_vacante`** | El selector de cargo en NuevaBajaPage debe mostrar cargos `vigente` Y `validacion_vacante`. Al hacer reemplazo de persona: cerrar ocupación anterior + crear nueva + cargo vuelve a `vigente` |
| S8A-5 | **Fix `CargosPage`**: mostrar `validacion_vacante` | Agregar badge "En Validación" (naranja) en la tabla y filtro de estado |

### Sprint 8-B — Página Validación de Bajas

| # | Tarea | Descripción |
|---|-------|-------------|
| S8B-1 | **Ruta nueva** `/bajas/validacion` | Nueva pestaña en la sección Bajas del menú |
| S8B-2 | **Backend**: `GET /api/v1/bajas/validacion` | Lista cargos en `validacion_vacante` con datos de la persona que los ocupaba (última ocupación cerrada), triangulado con bajas SIAL si existe coincidencia |
| S8B-3 | **Backend**: `POST /api/v1/bajas/validacion/:cargoId/confirmar` | Confirma la baja: cargo → `no_vigente`, registra acto administrativo opcional |
| S8B-4 | **Backend**: `POST /api/v1/bajas/validacion/:cargoId/rechazar` | Rechaza: cargo → `vigente`, reabre ocupación (`hasta = NULL`) |
| S8B-5 | **Frontend**: `ValidacionBajasPage` | Tabla con cargos en validación, columnas: Cargo / Hospital / Escalafón / Persona / Desde (última ocupación) / Detectado en padrón / Coincide en SIAL / Acciones |
| S8B-6 | **Triangulación visual** | En cada fila mostrar si el cargo también aparece en el archivo de bajas SIAL (badge "Confirmado en SIAL" verde vs "Solo padrón" naranja) |

### Sprint 8-C — Triangulación histórica

| # | Tarea | Descripción |
|---|-------|-------------|
| S8C-1 | **`CargoDetailPanel`**: historial completo | Mostrar todas las ocupaciones históricas + concursos asociados al cargo |
| S8C-2 | **`PersonaDetailPanel`**: cargos históricos | Mostrar todos los cargos que ocupó la persona (activos, retenidos, históricos) con fechas |
| S8C-3 | **Endpoint triangulación** | `GET /api/v1/cargos/:id/historial` — devuelve ocupaciones + concursos + apariciones en padrón histórico |

---

## 5. Flujo completo del estado `validacion_vacante`

```
PADRÓN SEMANAL
  ↓ detecta id_sial_rol "eliminado"
  ↓ cierra ocupación (hasta = fecha_padron)
  ↓ cargo.estado = 'validacion_vacante'
  ↓ aparece en /bajas/validacion

OPERADOR en /bajas/validacion
  ├── CONFIRMAR BAJA
  │     ↓ cargo.estado = 'no_vigente'
  │     ↓ registra acto administrativo (opcional)
  │     ↓ puede generar concurso si corresponde
  │
  ├── RECHAZAR (error de sistema)
  │     ↓ cargo.estado = 'vigente'
  │     ↓ reabre ocupación (hasta = NULL)
  │
  └── (sin acción) → cargo queda en validacion_vacante

DESDE /cargos/baja/nueva (reemplazo de persona)
  ↓ selecciona cargo validacion_vacante o vigente
  ↓ cierra ocupación anterior (si existe)
  ↓ crea nueva ocupación
  ↓ cargo.estado = 'vigente'
  ↓ historial del cargo se preserva

SIGUIENTE PADRÓN (si trae de vuelta a la persona)
  ↓ detecta id_sial_rol de cargo en validacion_vacante
  ↓ BLOQUEA aprobación del padrón
  ↓ operador resuelve uno por uno antes de aprobar
```

---

## 6. Decisiones de diseño (respondidas 2026-08-19)

| Pregunta | Decisión |
|----------|----------|
| ¿Acto administrativo obligatorio? | **Opcional** — el número de documento puede quedar vacío |
| ¿Desde Validación se puede iniciar concurso? | **No** — solo confirmar o rechazar la baja. El concurso se inicia desde el flujo habitual después |
| ¿`validacion_vacante` en tabla `/cargos` o sección separada? | **En la tabla principal** con badge "En Validación" (naranja), filtrable como estado |
| ¿Alerta de antigüedad? | **Mostrar días en estado actual** en la tabla y en Validación de Bajas. Configuración de umbrales → futuro (botón en Administración) |

### Detalle: días en estado

- En `/cargos`: columna o tooltip con `N días en [estado]` para cargos `validacion_vacante` y `no_vigente`
- En `/bajas/validacion`: columna "Días en validación" visible siempre
- Cálculo: `CURRENT_DATE - fecha en que el cargo entró al estado actual`
- Fuente del dato: campo `estado_desde` a agregar en tabla `cargos` (se llena en cada transición de estado)
- Sin umbral ni color por ahora — solo el número de días
