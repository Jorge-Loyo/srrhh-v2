# SPRINT — Reparación de Base de Datos

**Fecha:** 2026-11-17
**Autor:** Jorge
**Tipo:** Sprint correctivo — no agrega funcionalidad, repara integridad de datos

---

## Diagnóstico

La base fue reconstruida (dump local → restore Neon) pero la aprobación del primer padrón
(30/09, 48.063 diffs "nuevo") solo creó **11.047 ocupaciones** de las ~54.336 esperadas.
El resto de los datos existe en `padron_diff.valor_nuevo` (JSON completo por fila) pero
nunca se materializó en `personas` ni `ocupaciones`.

### Causa raíz

El `aprobarSnapshotService` del primer padrón (30/09) falló silenciosamente en la creación
de personas y ocupaciones — el bug histórico de `datos.cuil` (documentado en Sprint 2,
hallazgo #4 de la verificación e2e). Los diffs quedaron guardados con `aprobado = true`
pero sin materializar las entidades.

Los snapshots posteriores (01/10 en adelante) sí funcionaron correctamente para sus diffs
incrementales, pero como el estado base era incorrecto, cada padrón nuevo solo "veía" los
~11.047 roles ya existentes y generaba diffs "nuevo" para los demás — acumulando 49.514
diffs "nuevo" sin ocupación a lo largo de 42 snapshots.

### Datos disponibles para reparación

Cada `padron_diff` con `tipo = 'nuevo'` tiene en `valor_nuevo` el JSON completo:
`ayn`, `cuil_y_rol`, `numero_doc`, `tipo_doc`, `sexo`, `fecha_nacimiento`, `antiguedad`,
`siglas`, `escalafon`, `literal_puesto`, `especialidad`, `situacion_de_revista`,
`codigo_repa`, `descripcion_repa`, `codigo_de_registro`, `literal_cr`, `cargo_desde`,
`cargo_hasta`, `telefono`, `mail_personal`, `mail_laboral`, `domicilio`, `localidad`,
`provincia`, `documentacion_del_rol`, `cod_situacion`, etc.

### Evolución de métricas durante el sprint

| Check | Inicio | Post R1-R3 | Post R-6 (final) |
|---|---|---|---|
| Personas con apellido | 0 | 49.519 | 49.519 |
| Personas sin apellido | 49.725 | 206 | 206 |
| Total ocupaciones | 11.047 | 55.396 | 55.553 |
| Ocupaciones activas (hasta IS NULL) | 11.047 | 55.376 | 55.533 |
| Cargos vigentes sin ocupación | 46.049 | 7.907 | 7.803 |
| Diffs nuevo sin ocupación | 49.514 | 6.855 | 6.698 |
| Jozami CUIL 27251686977 con ocupación | NO | SI | SI |

### Pendientes (límite técnico alcanzado)

- **206 personas sin apellido**: diffs en formato viejo (sin CUIL embebido en `id_sial_rol`). Requieren matching por otro campo o son personas genuinamente sin dato en el padrón.
- **6.698 diffs sin ocupación**: corresponden a cargos desdoblados con `id_sial = NULL`. El matching por `(hospital, puesto, cod_registro)` es ambiguo — múltiples cargos del mismo tipo en el mismo hospital. Resolución posible: restaurar `id_sial` en los cargos desdoblados desde el padrón original.
- **7.803 cargos vigentes sin ocupación**: incluye genuinamente vacantes + los desdoblados sin match determinístico.

---

## Alcance del sprint

### Dentro del alcance

- Backfill de `personas.apellido`, `personas.nombre` y demás campos desde `padron_diff.valor_nuevo`
- Creación de `ocupaciones` faltantes para los diffs "nuevo" sin ocupación
- Actualización de `cargos.estado` para reflejar si tienen ocupación activa
- Verificación de integridad post-reparación

### Fuera del alcance

- Cambios al código de la aplicación
- Modificación del flujo de aprobación de padrón (sprint separado)
- Reparación de datos históricos de padrones anteriores a la migración

---

## Tareas

### R-1 — Backfill de datos de personas desde padron_diff ✅ Ejecutado (2026-11-17)

**Problema:** 49.725 personas tenían `cuil` pero `apellido = NULL` y `nombre = NULL`.
Los datos estaban en `padron_diff.valor_nuevo->>'ayn'` (formato "Apellido, Nombre").

**Estrategia:** Para cada persona, tomar el diff "nuevo" más reciente que tenga su CUIL
y extraer los campos faltantes. Solo aplica a diffs en formato nuevo (CUIL embebido en
`id_sial_rol`).

**Script:** `scripts/repair_personas_desde_diffs.sql`

**Campos reparados:** `apellido`, `nombre`, `numero_doc`, `tipo_doc`, `sexo`,
`fecha_nacimiento`, `antiguedad_desde`, `telefono`, `mail_personal`, `mail_laboral`,
`domicilio`, `localidad`, `provincia`.

**Resultado:** 49.519 personas reparadas. Quedan 206 sin apellido (diffs en formato viejo
sin CUIL embebido en `id_sial_rol`).

---

### R-2 — Creación de ocupaciones faltantes ✅ Ejecutado (2026-11-17)

**Problema:** 49.514 diffs "nuevo" no tenían ocupación correspondiente.

**Estrategia:** Para cada `id_sial_rol` tipo "nuevo" sin ocupación, tomar el diff más
reciente, extraer el CUIL y buscar el cargo por `id_sial`. Crear la ocupación con los
datos del JSON. Solo aplica a cargos con `id_sial` no nulo.

**Script:** `scripts/repair_ocupaciones_desde_diffs.sql`

**Resultado:** 44.349 ocupaciones creadas. Quedan 5.165 diffs sin reparar:
- 311 sin persona (CUIL no encontrado en `personas`)
- 5.075 sin cargo (4.968 son cargos con `id_sial = NULL` — desdoblados)
- 221 sin ambos

---

### R-3 — Reconciliación de estado de cargos ✅ Ejecutado (2026-11-17)

**Problema:** Posibles cargos `no_vigente` con ocupación activa (inconsistencia inversa).

**Script:** `scripts/repair_estados_cargos.sql`

**Resultado:** 0 actualizaciones necesarias. Estado final: 57.076 vigentes, 810
validacion_vacante, 0 no_vigentes.

---

### R-4 — Caso especial id_sial_rol 001474365-2 ✅ Resuelto (2026-11-17)

**Problema:** Cargo `CPH-P-07256` (Jozami, Andrea Cecilia, CUIL 27251686977, HMOMC,
Médico de Planta Hematología) con diff aprobado del 30/09 pero sin ocupación ni datos
de persona.

**Resultado:** Cubierto por R-1 y R-2. Verificado: apellido OK, 1 ocupación activa.

---

### R-5 — Verificación de integridad post-reparación ✅ Ejecutado (2026-11-17)

**Script:** `scripts/verify_repair.sql`

Ver tabla de evolución de métricas en la sección de diagnóstico.

---

### R-6 — Reparación de cargos desdoblados sin id_sial ✅ Ejecutado parcialmente (2026-11-17)

**Problema:** 4.968 diffs "nuevo" corresponden a cargos con `id_sial = NULL`
(nullificados intencionalmente por `fix_nullificar_idsial_*.sql`). No se pueden matchear
por `id_sial`.

**Estrategia ejecutada:** matching por `(hospital.sigla + LOWER(literal_puesto) + cod_registro)`
contra cargos sin `id_sial` sin ocupación activa. Solo se insertaron los casos con match
ÚNICO (1 solo cargo candidato). Los ambiguos no se tocaron.

**Script:** `scripts/repair_r6_cargos_desdoblados.sql`

**Resultado:**
- 1.418 diffs con al menos 1 candidato
- 161 con match único → 157 ocupaciones insertadas
- 1.257 ambiguos → no tocados
- 3.550 sin ningún candidato (hospital/puesto/cod_registro no matchea ningún cargo vacante)

**Límite técnico:** Los 1.257 casos ambiguos tienen múltiples cargos del mismo tipo en el
mismo hospital (ej. 50 "Médico de Planta" CPH-37 vacantes en HGAJAF). Sin el `id_sial`
original no hay forma determinística de asignar cada persona a su cargo correcto.
Resolución posible: restaurar `id_sial` en los cargos desdoblados desde el padrón original.

---

## Scripts creados

```
scripts/
  repair_personas_desde_diffs.sql      <- R-1 (ejecutado)
  repair_ocupaciones_desde_diffs.sql   <- R-2 (ejecutado)
  repair_estados_cargos.sql            <- R-3 (ejecutado)
  verify_repair.sql                    <- R-5 (ejecutado)
  repair_r6_cargos_desdoblados.sql     <- R-6 (ejecutado parcialmente)
```

---

## Notas técnicas

### Formato de id_sial_rol

```
Formato nuevo (con CUIL): {id_sial}-{cuil}-{nro_rol}
  Ejemplo: 001601480-3-27201993658-3
  id_sial = 001601480-3
  cuil    = 27201993658

Formato viejo (sin CUIL): {id_sial}
  Ejemplo: 001821683-1
  id_sial = 001821683-1
  cuil    = no disponible en el id_sial_rol
```

### Extracción de apellido/nombre desde ayn

```sql
apellido = TRIM(SPLIT_PART(ayn, ', ', 1))
nombre   = TRIM(SPLIT_PART(ayn, ', ', 2))
```

### Parseo de fechas DD/MM/YYYY

```sql
-- TO_DATE('21/10/2023', 'DD/MM/YYYY')
-- Ignorar '01/01/4000' (fecha sentinel de "sin vencimiento")
```

### Cargos desdoblados

Los cargos con `id_sial = NULL` fueron nullificados intencionalmente por los scripts
`fix_nullificar_idsial_desdoblados.sql` y `fix_nullificar_idsial_todos.sql` para resolver
duplicados de id_sial en el proceso de desdoblado de cargos. Tienen código propio
(ej. `CPH-G-06369`) pero no tienen `id_sial` para matchear contra los diffs del padrón.
El matching por `(hospital, puesto, cod_registro)` es insuficiente cuando hay múltiples
cargos del mismo tipo en el mismo hospital — que es el caso habitual en hospitales grandes.

---

### R-7 — Restaurar id_sial en cargos desdoblados ❌ No viable (2026-11-17)

**Objetivo:** Restaurar `id_sial` en los 8.648 cargos con `id_sial = NULL` para que el
matching de R-2 pueda resolver los 6.698 diffs restantes.

**Análisis ejecutado:**

Paso 1 — Inferir `id_sial` via ocupaciones existentes:
- 4.936 cargos sin `id_sial` tienen al menos una ocupación
- 4.908 tienen un único `id_sial` inferido consistente (extraído del `id_sial_rol`)
- 28 tienen `id_sial_rol` inconsistentes entre ocupaciones (ambiguos)

Paso 2 — Verificar colisiones:
- De los 4.908 restaurables, **4.802 colisionan** con otro cargo que ya tiene ese `id_sial`
- Solo 106 no colisionan — y solo resolverían 5 diffs adicionales

**Conclusión:** No viable. Los cargos desdoblados comparten `id_sial` con sus cargos
originales por diseño del proceso de desdoblado. El campo `id_sial` tiene constraint
UNIQUE en la tabla — restaurarlo rompería la integridad referencial.

**Causa raíz del límite:** El proceso de desdoblado (`fix_desdoblado_cargos.sql`) creó
cargos nuevos copiando el cargo original y nullificando `id_sial` en el nuevo para evitar
duplicados. No dejó ningún campo de trazabilidad (`puesto_codigo_sial`, `cargo_base_id`,
`codigo_legacy` — todos NULL). El `id_sial` original quedó en el cargo "base" y el cargo
"desdoblado" quedó sin identificador SIAL.

**Solución estructural (fuera del alcance de este sprint):**
Agregar columna `id_sial_original TEXT` en `cargos` para preservar el `id_sial` pre-desdoblado
sin violar la unicidad. Requiere migración de schema + backfill desde el historial de diffs.
Esto permitiría que el padrón matchee por `id_sial_original` cuando `id_sial` es NULL.

**Scripts de diagnóstico creados (no ejecutar en producción):**
- `diag_r7.sql`, `diag_r7b.sql`, `diag_r7c.sql` — análisis de viabilidad

---

### R-8 — Crear cargos no_vigente desde bajas SIAL sin ocupación activa ✅ Ejecutado (2026-11-17)

**Problema:** Las bajas SIAL (`baja_sial_registros`, 94.268 registros) contienen cargos
dados de baja que no existen en la BD como `no_vigente`. Son necesarios para gestionar
concursos sobre esas vacantes.

**Universo analizado:**
- 15.856 bajas con `cargo LIKE '000%'` (formato pre-desdoblado)
- 83 de esas bajas tienen su CUIL en una ocupación activa → cargo ya existe en BD (re-ocupado)
- 112 sin match en ocupaciones → candidatos a crear
- 195 bajas con `cargo LIKE '001%'` → ya matchean cargos existentes por `id_sial`

**Estrategia:**
- Match de `hospital_id`: tabla de mapeo manual `cod_rep → hospital_id` por prefijo jerárquico
- Match de `puesto_cargo_id`: por `LOWER(literal_puesto) + cod_reg` contra cargos existentes,
  con fallback por normalización de tildes y fallback por nombre solo (para cod_reg incorrecto en baja)
- Estado destino: `no_vigente`, `estado_desde = cargo_hasta`, `origen = 'baja_sial'`
- `id_sial = NULL` (eran `000xxx` pre-desdoblado, sin equivalente `001xxx`)

**Script:** `scripts/repair_r8_crear_cargos_desde_bajas.sql`

**Resultado:**
- 111 cargos `no_vigente` creados (90 en primera pasada + 21 con fallback de tildes/nombre)
- 1 pendiente: `terapista fisico de guardia` cod_reg 23 — puesto inexistente en `puestos_cargo`
- Distribución: cod_reg 07 (11), 23 (14), 24 (2), 37 (47), 83 (6), 85 (4), 87 (27)

El cargo `terapista fisico de guardia` requirió crear primero el puesto en `puestos_cargo`
(id `261f8bac-5f88-420d-a681-7c7983891a4f`, escalafon Salud-Guardias) e insertarlo manualmente.

---

---

### R-9 — Asignar códigos correlativos a cargos sin código ✅ Ejecutado (2026-11-17)

**Problema:** 28 cargos sin `codigo` asignado (NULL). Necesarios para identificación en la UI.

**Estrategia:** `ROW_NUMBER()` por `cod_reg` con prefijos por escalafón.
Prefijos usados: `SG-`, `CPH-P-`, `EG-`, `TEC-`, `ENF-`.

**Script:** `scripts/repair_r9_asignar_codigos_cargos.sql`

**Resultado:** 25 cargos con código asignado (3 ya tenían código al momento de ejecutar).

---

### R-10 — Actualización de bajas 001xxx ✅ Ejecutado (2026-11-17)

**Problema:** 228 cargos con bajas SIAL `001xxx` sin estado actualizado.

**Resultado:**
- 210 → `validacion_vacante` (cod_reg 23/37/83/85/87)
- 18 → `no_vigente` (cod_reg 07/24)

---

### R-11 — Migración completa a Neon nueva (ep-little-river) ✅ Ejecutado (2026-11-18)

**Contexto:** La Neon vieja (`ep-aged-water`) era una base de prueba con UUIDs distintos.
Se migró todo a la nueva base de producción (`ep-little-river`) usando `id_sial` e
`id_sial_rol` como puentes.

**Tablas migradas:**

| Tabla | Filas migradas | Notas |
|---|---|---|
| `ocupaciones` (activas) | 55.553 | Migración inicial |
| `ocupaciones` (cerradas) | 3.926 | Via `ocu_cerradas_tmp` |
| `bajas` | 2.853 | Via `bajas_id_map` para trazabilidad |
| `concursos` (con baja vinculada) | 516 | Vinculados via `bajas_id_map` |
| `cargos` históricos `HIS-` | 4.074 | Cargos de la vieja no existentes en nueva |
| `padron_historico` (gap) | 25.884 | Filas faltantes de snapshots existentes |
| `padron_historico` nov-08 | 48.998 | Desde `dotacion.xlsx` del dotaneitor |
| `kpis_dotacion_snapshot` | 492 | Recalculado desde `padron_historico` |

**Convenciones de códigos históricos:**
- Cargos históricos usan prefijo `HIS-` + prefijo de escalafón + `id_sial`
- Ejemplos: `HIS-CPH-001789296-3`, `HIS-G-001711804-1`, `HIS-DOC-001727312-12`
- Garantiza que no colisionen con códigos operativos futuros

**Tabla de mapeo permanente:** `bajas_id_map` (baja_id_viejo → baja_id_nuevo)

**733 ocupaciones cerradas irrecuperables:** sus cargos no existen en ninguna base.

---

## Cierre del sprint

**Estado:** Cerrado.

**Resumen de impacto final:**

| Métrica | Inicio | Final |
|---|---|---|
| Personas con apellido | 0 | 49.519 |
| Total ocupaciones | 11.047 | 59.479 |
| Cargos vigentes sin ocupación | 46.049 | 7.803 |
| Diffs nuevo sin ocupación | 49.514 | 6.698 |
| Cargos no_vigente (HIS- + bajas SIAL) | 0 | 4.186 |
| Bajas | 0 | 2.920 |
| Concursos | 1.959 | 2.475 |
| padron_historico | 164.933 | 239.815 |
| kpis_dotacion_snapshot | 406 | 492 (recalculado) |

**Deuda técnica registrada:**
- Agregar `id_sial_original TEXT` en `cargos` para soportar el matching del padrón contra
  cargos desdoblados. Candidato a sprint de schema futuro.
- Snapshot `2026-11-08`: `padron_historico` cargado manualmente desde `dotacion.xlsx`.
  El pipeline de Node no completó la carga automática — investigar causa en `padron.service.ts`.

