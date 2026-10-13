# Módulo Padrón — Documentación técnica

> Fuente de verdad del flujo de importación del padrón semanal (Dotaneitor + diff + aprobación).
> Última actualización: 2026-09-28 (invariante `persona.activo` en la aprobación — commit `85d8267`).
> Estado: VIGENTE.
> ⚠️ El Dotaneitor se reescribe en el **Sprint 22** (flujo lineal): los pasos internos y endpoints
> descritos abajo cambiarán. Ver `Doc/Referencias/DOTANEITOR_DECISIONES.md` y
> `Sprints/SPRINT_22_dotaneitor_catalogo.md`.

## Stack y URLs

| Componente                  | URL / Puerto                              |
| --------------------------- | ----------------------------------------- |
| Frontend (Vite)             | `http://localhost:5180/padron`            |
| API (Fastify)               | `http://localhost:3000`                   |
| Dotaneitor (FastAPI Python) | `http://localhost:5001` (interno Docker)  |
| Base de datos               | Postgres `srrhh_db`, usuario `srrhh_user` |

---

## Flujo completo de una carga

```
Usuario sube Excel
      │
      ▼
POST /api/v1/padron/upload          (Node/Fastify)
  ├─ Valida fecha, detecta duplicado de fecha
  ├─ Crea PadronSnapshot estado=procesando en BD
  └─ Dispara runPipeline() en background (no await) → responde 202

runPipeline() (background)
  ├─ paso "procesar"    → POST /procesar-padron        → { job_id }  (arranque async, SIN reintento)
  │                       polling GET /job/:id cada 3s (tope 15 min) hasta status=done
  │                       GET /procesar-padron/:id/resultado?page&limit (paginado, lotes de 5000)
  │                       DELETE /procesar-padron/:id   (limpieza-tras-descarga, best-effort)
  ├─ paso "diff"        → calcularDiff()    (Node, contra Postgres)
  └─ paso "guardando"   → $transaction: PadronDiff.createMany + snapshot estado=pendiente

(S22/Opción B: el tramo API↔Python es un job async. El pipeline pesado — ~48k
filas, varios minutos — corre en un Thread del Dotaneitor; ninguna request HTTP
individual espera a que termine, por eso ya no se choca contra el timeout de
axios ni el proxy de Render. El flujo navegador→API y el polling de /estado NO
cambian.)

Frontend polling cada 2s
  GET /api/v1/padron/snapshots/:id/estado
  └─ Cuando estado != procesando → para el polling
```

---

## Dotaneitor — Pasos internos de `/procesar`

El servicio Python (`DotacionAutomationBD.procesar()`) transforma el Excel en un DataFrame normalizado:

| Paso | Qué hace                                                                                      |
| ---- | --------------------------------------------------------------------------------------------- |
| 0    | Limpia SIGLA: `UAIEAIT→EAIT`, quita prefijo `DGAH`                                            |
| 1    | Extrae ROL del campo CARGO (número tras el guión)                                             |
| 2    | Limpia CUIL (quita guiones)                                                                   |
| 3    | Construye `CUIL Y ROL` = `CUIL-ROL`                                                           |
| 5    | Cruza SIGLA → `hospitales` (BD) → UNIVERSO TOTALIZADOR, TIPO DE HOSPITAL, MONOVALENCIA        |
| 6    | Cruza `LIT_COD_REG + LIT_PUESTO` → `ref_unificadores_puesto` (BD) → **UNIFICADOR DE PUESTOS** |
| 7    | Cruza `ESCALAFON + LIT_PUESTO` → `ref_agrupadores` (BD) → **AGRUPADOR**                       |
| 7.5  | Regla especial: `COD_SIT=32` + `AGRUPADOR="Enfermero/a"` → `"Enfermero/a ATP"`                |
| 7.6  | Limpia JCAT: valor `"0"` → `null`                                                             |
| 8    | Calcula **JEFE ESCALAFON** (vectorizado, ver tabla abajo)                                     |
| 9    | Calcula **ESTADO** (vectorizado, ver tabla abajo)                                             |
| 9.5  | Renombra columnas SIAL → nombres finales (ej. `CARGO→ID SIAL`, `LIT_ESP_CARGO→ESPECIALIDAD`)  |
| 9.6  | Limpia ESPECIALIDAD en COD_REG que no corresponden (solo 37/23/24 tienen especialidad)        |
| 9.75 | Fuerza MAYÚSCULA SIN TILDE en `COLUMNAS_MAYUSCULA_FORZADA`                                    |
| 9.8  | Elimina duplicados de ID SIAL (conserva la fila más completa)                                 |
| 9.9  | Elimina jefaturas CPH con rol duplicado activo (sin CODIGO JEFATURAS)                         |
| 10   | Reordena columnas según orden de referencia                                                   |

### Reglas JEFE ESCALAFON

| Condición                  | Valor                 |
| -------------------------- | --------------------- |
| Sin JCAT                   | `null`                |
| COD_REG=37, sin ESCRITORIO | `Jefe CPH POF`        |
| COD_REG=37, con ESCRITORIO | `Jefe CPH POU`        |
| COD_REG=85                 | `Jefe Tecnico`        |
| COD_REG=87                 | `Jefe Enfermeria`     |
| COD_REG=83                 | `Jefe Administrativo` |

### Reglas ESTADO

| Condición                    | Valor                |
| ---------------------------- | -------------------- |
| Tiene BLOQ_DESDE             | `Bloqueado`          |
| SIT_REV contiene "retención" | `Retención de Cargo` |
| SIT_REV contiene "comisión"  | `Comisión`           |
| Default                      | `Activo`             |

---

## Dotaneitor — Paso `/cruzar` (especialidades)

Después de `/procesar`, el endpoint `/cruzar` completa la columna ESPECIALIDAD en tres pasadas:

1. **Fuente SIAL** (`LIT_ESP_CARGO`): ya viene en el Excel, solo para COD_REG 37/23/24. Los demás se vacían en el paso 9.6.
2. **Por CUIL** (`ref_especialidades_cuil`): para filas con ESPECIALIDAD vacía, busca por CUIL + COD_REG. Resultado normalizado con `sin_tilde_mayuscula()`.
3. **Por AGRUPADOR** (`ref_especialidad_por_puesto`): para huecos restantes, busca por AGRUPADOR + PUESTO.
4. Al final: `_forzar_mayusculas(df)` — garantiza que todo quede en MAYÚSCULA SIN TILDE.

---

## Normalización de texto

```python
COLUMNAS_MAYUSCULA_FORZADA = [
    'ESPECIALIDAD', 'AGRUPADOR', 'UNIVERSO TOTALIZADOR',
    'TIPO DE HOSPITAL / SIGLA', 'MONOVALENCIA', 'UNIFICADOR DE PUESTOS',
    'JEFE ESCALAFON',
]

COLUMNAS_CON_TILDE = {
    'LITERAL PUESTO', 'SITUACION DE REVISTA', 'ESTADO',
    'AYN', 'DOMICILIO', 'LOCALIDAD', 'PROVINCIA',
}
```

- `COLUMNAS_MAYUSCULA_FORZADA` → `sin_tilde_mayuscula()` (mayúscula + sin tilde)
- `COLUMNAS_CON_TILDE` → sin cambio (conservan tildes y capitalización)
- Resto → `sin_tilde()` (conserva capitalización, quita tildes)

---

## Diff — Campos comparados

El diff se calcula en Node (`calcularDiff()`) comparando el DataFrame de Dotaneitor contra `cargos` vigentes en Postgres.

| Campo Python            | Tabla BD  | Campo Prisma            |
| ----------------------- | --------- | ----------------------- |
| `literal_puesto`        | cargo     | `literalPuesto`         |
| `especialidad`          | cargo     | `especialidadLegacy`    |
| `agrupador`             | cargo     | `agrupador`             |
| `unificador_de_puestos` | cargo     | `unificadorPuesto`      |
| `codigo_repa`           | cargo     | `codigoRepa`            |
| `descripcion_repa`      | cargo     | `descripcionRepa`       |
| `codigo_de_registro`    | cargo     | `codigoRegistro.codigo` |
| `agrupamiento`          | cargo     | `agrupamiento`          |
| `situacion_de_revista`  | ocupacion | `situacionRevista`      |
| `estado`                | ocupacion | `estadoPersona`         |
| `codigo_jefaturas`      | ocupacion | `codigoJefaturas`       |
| `jefe_escalafon`        | ocupacion | `jefeEscalafon`         |
| `comision`              | ocupacion | `comision`              |
| `repa_comision`         | ocupacion | `repaComision`          |
| `cod_situacion`         | ocupacion | `codSituacion`          |
| `cargo_desde`           | ocupacion | `cargoDesdeFecha`       |
| `cargo_hasta`           | ocupacion | `cargoHastaFecha`       |

---

## Tipos de diff y comportamiento al aprobar

| Tipo         | Condición                        | Al aprobar snapshot                                                                                                             |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `nuevo`      | ID SIAL en padrón, no en BD      | Crea Persona + Cargo (con código) + Ocupación + Histórico. Requiere decisión individual previa.                                 |
| `eliminado`  | ID SIAL en BD, no en padrón      | Cierra Ocupación (`hasta = fechaPadron`). Cargo pasa a `validacion_vacante`. Persona sin ocupaciones vigentes → `activo=false`. |
| `modificado` | ID SIAL en ambos, campo distinto | Actualiza Cargo u Ocupación según el campo.                                                                                     |

**Regla de validacion_vacante:** si un cargo en `validacion_vacante` reaparece en el siguiente padrón, vuelve automáticamente a `vigente`.

**Invariante `persona.activo` (paso 10 de la aprobación — commit `85d8267`, 2026-09-28):**
una persona con **al menos una ocupación vigente** (`hasta IS NULL`) **no puede** estar
`activo=false`. El paso de `eliminado` solo inactiva (nunca reactiva) y las altas usan
`skipDuplicates` (no tocan el flag de una persona ya existente), así que un **reingreso**
(persona dada de baja que reaparece con un cargo nuevo en un padrón posterior) quedaba inactiva
con cargo activo. Al final de `aprobarSnapshotService` corre un `UPDATE` idempotente que
reactiva (`activo=true`) a toda persona inactiva con ocupación vigente. Corre **después** de
crear altas y de procesar bajas.

> Detectado con 382 personas afectadas en la BD local (ej. Rodríguez Insfrán: baja de
> Residente + alta CPH posterior → quedaba inactiva). La corrección de datos no se versiona
> (se rehace sola al reprocesar; además la BD de desarrollo se resetea en el Sprint 20).

---

## Generación de código de cargo

Formato: `{PREFIJO}-{SECUENCIAL 6 dígitos}` (ej. `CPH-000042`)

El prefijo se calcula en `prefijoDeCargo()` a partir de escalafón + unificador de puestos + agrupador. El secuencial es `MAX(codigo) + 1` por prefijo, calculado en bloque (un solo `SELECT MAX` por prefijo distinto, no uno por cargo).

---

## Tablas de referencia en BD

Todas se leen desde Postgres al arrancar Dotaneitor. Se pueden actualizar con SQL sin rebuild.

| Tabla                         | Uso                                                     |
| ----------------------------- | ------------------------------------------------------- |
| `hospitales`                  | SIGLA → UNIVERSO TOTALIZADOR, TIPO, MONOVALENCIA        |
| `ref_agrupadores`             | ESCALAFON + LIT_PUESTO → AGRUPADOR                      |
| `ref_unificadores_puesto`     | LIT_COD_REG + LIT_PUESTO → UNIFICADOR DE PUESTOS        |
| `ref_especialidades_cuil`     | CUIL + tipo → ESPECIALIDAD (cruce por CUIL)             |
| `ref_especialidad_por_puesto` | AGRUPADOR + PUESTO → ESPECIALIDAD (cruce por agrupador) |

---

## Endpoints API

| Método   | Ruta                                                  | Descripción                                 |
| -------- | ----------------------------------------------------- | ------------------------------------------- |
| `GET`    | `/api/v1/padron/snapshots`                            | Lista todos los snapshots                   |
| `POST`   | `/api/v1/padron/upload`                               | Sube Excel, dispara pipeline async          |
| `GET`    | `/api/v1/padron/snapshots/:id/estado`                 | Polling de estado del pipeline              |
| `GET`    | `/api/v1/padron/snapshots/:id/diff`                   | Diff paginado con filtros                   |
| `POST`   | `/api/v1/padron/snapshots/:id/aprobar`                | Aprueba el snapshot completo                |
| `POST`   | `/api/v1/padron/snapshots/:id/rechazar`               | Rechaza el snapshot                         |
| `POST`   | `/api/v1/padron/snapshots/:id/diffs/:diffId/aprobar`  | Aprueba un diff nuevo individual            |
| `POST`   | `/api/v1/padron/snapshots/:id/diffs/:diffId/rechazar` | Rechaza un diff nuevo individual            |
| `POST`   | `/api/v1/padron/snapshots/:id/diffs/aprobar-todos`    | Aprueba todos los pendientes en bloque      |
| `GET`    | `/api/v1/padron/snapshots/:id/exportar`               | Descarga Excel del Dotaneitor               |
| `GET`    | `/api/v1/padron/snapshots/:id/conflictos-validacion`  | Cargos en validacion_vacante que reaparecen |
| `DELETE` | `/api/v1/padron/snapshots/:id`                        | Elimina snapshot en estado error/rechazado  |

---

## Endpoints Dotaneitor (interno)

| Método   | Ruta                                                               | Descripción                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/health`                                                          | Health check                                                                                                                                                                           |
| `POST`   | `/session`                                                         | Crea sesión en memoria                                                                                                                                                                 |
| `POST`   | `/upload-cargos`                                                   | Sube el Excel a la sesión                                                                                                                                                              |
| `POST`   | `/procesar-padron`                                                 | **Arranca** el pipeline lineal como job async → `{ job_id }` (UUID). Form: `file`, `snapshot_id` opcional (UUID).                                                                      |
| `GET`    | `/procesar-padron/:job_id/resultado`                               | DataFrame del job paginado (`page`, `limit` default 5000, `le=1_000_000`). Lo consume Node para el diff. 400 si no hay resultado.                                                      |
| `DELETE` | `/procesar-padron/:job_id`                                         | Limpieza-tras-descarga (borra job + parquet + xlsx). Idempotente (200 aunque no exista).                                                                                               |
| `GET`    | `/job/:job_id`                                                     | Polling de estado de un job: `{ status: pending\|done\|error, result, error }`. `result` del padrón = `{ total, cols, reporte, logs }`. 404 si no existe/expiró o `job_id` no es UUID. |
| `GET`    | `/exports/:snapshotId/dotacion.xlsx`                               | Descarga Excel persistente                                                                                                                                                             |
| `POST`   | `/normalizar` · `/procesar` · `/cruzar` · `/preview` · `/session*` | Endpoints v1 (flujo por sesión), en desuso para el padrón; se mantienen hasta su limpieza.                                                                                             |

---

## Permisos requeridos

| Acción                           | Permiso                 |
| -------------------------------- | ----------------------- |
| Subir padrón                     | `padron.subir`          |
| Aprobar/rechazar snapshot        | `padron.aprobar_padron` |
| Aprobar/rechazar diff individual | `padron.aprobar_padron` |
| Eliminar snapshot                | `padron.eliminar_snap`  |

---

## Consideraciones de rendimiento

- **Transacción con timeout extendido:** `TRANSACTION_OPTS = { timeout: 10min, maxWait: 10s }`. La primera aprobación contra una BD vacía puede generar hasta ~48k diffs "nuevo" en una sola transacción.
- **Batching:** `createMany` y `updateMany` se trocean en lotes de 2000 para no superar el límite de parámetros de Postgres (65535).
- **Códigos en bloque:** un solo `SELECT MAX` por prefijo distinto (~15 típicamente), no uno por cargo.
- **Tramo API↔Python async (S22/Opción B):** el procesamiento del padrón (~48k filas, varios minutos) corre como job en el Dotaneitor. Cada request HTTP es corta: axios default 30s para el arranque y el polling; la descarga del parquet usa un override de 60s por-request. El polling es cada 3s con tope total de 15 min (`JOB_POLL_TIMEOUT_MS`); el resultado viaja en parquet paginado en lotes de 5000 (`PAGE_DESCARGA`). Esto reemplaza el timeout fijo de 300s que cortaba la corrida (y que el proxy de Render podía cortar aún antes).
- **Latido y barrido de jobs:** el worker emite un latido cada 5 min (`JOB_HEARTBEAT_SECS`) que refresca el `mtime` del `.json` del job. Un loop dedicado (cada 60s) marca `error` un job `pending` sin latir por >20 min (`JOB_STUCK_SECS`, p.ej. reinicio del contenedor) y purga por `JOB_TTL` (1h desde el último cambio de estado) como red de seguridad; el camino feliz limpia antes vía `DELETE`. El parquet conserva columnas internas del catálogo; el Excel de export (`df_a_excel_bytes`) las omite.
- **Guard total==0:** un job `done` con 0 filas se trata como error de negocio (`"El padrón procesado no tiene filas"`), no corre el diff — evita bajas masivas accidentales.

---

## Modelos Prisma relevantes

- `PadronSnapshot`: estado, fechaAsignada, filename, totalRegistros, pasoActual, errorMsg, archivoResultadoPath
- `PadronDiff`: snapshotId, tipo (nuevo/modificado/eliminado), idSialRol, campo, valorAnterior, valorNuevo, aprobado (null=pendiente, true=aprobado, false=rechazado)
- `PadronHistorico`: registro inmutable por snapshot aprobado, una fila por ocupación tocada
- `Cargo`: idSial, codigo, hospitalId, escalafonId, literalPuesto, especialidadLegacy, agrupador, unificadorPuesto, estado (vigente/no_vigente/validacion_vacante)
- `Ocupacion`: personaId, cargoId, idSialRol, cuilYRol, hasta (null = vigente)
- `Persona`: cuil, apellidoNombre, activo
