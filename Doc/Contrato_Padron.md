# Módulo Padrón — Documentación técnica

## Stack y URLs

| Componente | URL / Puerto |
|---|---|
| Frontend (Vite) | `http://localhost:5180/padron` |
| API (Fastify) | `http://localhost:3000` |
| Dotaneitor (FastAPI Python) | `http://localhost:5001` (interno Docker) |
| Base de datos | Postgres `srrhh_db`, usuario `srrhh_user` |

---

## Flujo completo de una carga

```
Usuario sube Excel
      │
      ▼
POST /api/v1/padron/upload          (Node/Fastify)
  ├─ Valida fecha, detecta duplicado de fecha
  ├─ POST /session                  → Dotaneitor crea sesión en memoria
  ├─ POST /upload-cargos            → Dotaneitor guarda el .xlsx en tmp/
  ├─ Crea PadronSnapshot estado=procesando en BD
  └─ Dispara runPipeline() en background (no await) → responde 202

runPipeline() (background)
  ├─ paso "normalizar"  → POST /normalizar  → pollJob()
  ├─ paso "procesar"    → POST /procesar    → pollJob()
  ├─ paso "cruzar"      → POST /cruzar      → pollJob()
  ├─ paso "diff"        → calcularDiff()    (Node, contra Postgres)
  ├─ paso "guardando"   → $transaction: PadronDiff.createMany + snapshot estado=pendiente
  └─ finally: POST /session/delete

Frontend polling cada 2s
  GET /api/v1/padron/snapshots/:id/estado
  └─ Cuando estado != procesando → para el polling
```

---

## Dotaneitor — Pasos internos de `/procesar`

El servicio Python (`DotacionAutomationBD.procesar()`) transforma el Excel en un DataFrame normalizado:

| Paso | Qué hace |
|---|---|
| 0 | Limpia SIGLA: `UAIEAIT→EAIT`, quita prefijo `DGAH` |
| 1 | Extrae ROL del campo CARGO (número tras el guión) |
| 2 | Limpia CUIL (quita guiones) |
| 3 | Construye `CUIL Y ROL` = `CUIL-ROL` |
| 5 | Cruza SIGLA → `hospitales` (BD) → UNIVERSO TOTALIZADOR, TIPO DE HOSPITAL, MONOVALENCIA |
| 6 | Cruza `LIT_COD_REG + LIT_PUESTO` → `ref_unificadores_puesto` (BD) → **UNIFICADOR DE PUESTOS** |
| 7 | Cruza `ESCALAFON + LIT_PUESTO` → `ref_agrupadores` (BD) → **AGRUPADOR** |
| 7.5 | Regla especial: `COD_SIT=32` + `AGRUPADOR="Enfermero/a"` → `"Enfermero/a ATP"` |
| 7.6 | Limpia JCAT: valor `"0"` → `null` |
| 8 | Calcula **JEFE ESCALAFON** (vectorizado, ver tabla abajo) |
| 9 | Calcula **ESTADO** (vectorizado, ver tabla abajo) |
| 9.5 | Renombra columnas SIAL → nombres finales (ej. `CARGO→ID SIAL`, `LIT_ESP_CARGO→ESPECIALIDAD`) |
| 9.6 | Limpia ESPECIALIDAD en COD_REG que no corresponden (solo 37/23/24 tienen especialidad) |
| 9.75 | Fuerza MAYÚSCULA SIN TILDE en `COLUMNAS_MAYUSCULA_FORZADA` |
| 9.8 | Elimina duplicados de ID SIAL (conserva la fila más completa) |
| 9.9 | Elimina jefaturas CPH con rol duplicado activo (sin CODIGO JEFATURAS) |
| 10 | Reordena columnas según orden de referencia |

### Reglas JEFE ESCALAFON

| Condición | Valor |
|---|---|
| Sin JCAT | `null` |
| COD_REG=37, sin ESCRITORIO | `Jefe CPH POF` |
| COD_REG=37, con ESCRITORIO | `Jefe CPH POU` |
| COD_REG=85 | `Jefe Tecnico` |
| COD_REG=87 | `Jefe Enfermeria` |
| COD_REG=83 | `Jefe Administrativo` |

### Reglas ESTADO

| Condición | Valor |
|---|---|
| Tiene BLOQ_DESDE | `Bloqueado` |
| SIT_REV contiene "retención" | `Retención de Cargo` |
| SIT_REV contiene "comisión" | `Comisión` |
| Default | `Activo` |

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

| Campo Python | Tabla BD | Campo Prisma |
|---|---|---|
| `literal_puesto` | cargo | `literalPuesto` |
| `especialidad` | cargo | `especialidadLegacy` |
| `agrupador` | cargo | `agrupador` |
| `unificador_de_puestos` | cargo | `unificadorPuesto` |
| `codigo_repa` | cargo | `codigoRepa` |
| `descripcion_repa` | cargo | `descripcionRepa` |
| `codigo_de_registro` | cargo | `codigoRegistro.codigo` |
| `agrupamiento` | cargo | `agrupamiento` |
| `situacion_de_revista` | ocupacion | `situacionRevista` |
| `estado` | ocupacion | `estadoPersona` |
| `codigo_jefaturas` | ocupacion | `codigoJefaturas` |
| `jefe_escalafon` | ocupacion | `jefeEscalafon` |
| `comision` | ocupacion | `comision` |
| `repa_comision` | ocupacion | `repaComision` |
| `cod_situacion` | ocupacion | `codSituacion` |
| `cargo_desde` | ocupacion | `cargoDesdeFecha` |
| `cargo_hasta` | ocupacion | `cargoHastaFecha` |

---

## Tipos de diff y comportamiento al aprobar

| Tipo | Condición | Al aprobar snapshot |
|---|---|---|
| `nuevo` | ID SIAL en padrón, no en BD | Crea Persona + Cargo (con código) + Ocupación + Histórico. Requiere decisión individual previa. |
| `eliminado` | ID SIAL en BD, no en padrón | Cierra Ocupación (`hasta = fechaPadron`). Cargo pasa a `validacion_vacante`. Persona sin ocupaciones vigentes → `activo=false`. |
| `modificado` | ID SIAL en ambos, campo distinto | Actualiza Cargo u Ocupación según el campo. |

**Regla de validacion_vacante:** si un cargo en `validacion_vacante` reaparece en el siguiente padrón, vuelve automáticamente a `vigente`.

---

## Generación de código de cargo

Formato: `{PREFIJO}-{SECUENCIAL 6 dígitos}` (ej. `CPH-000042`)

El prefijo se calcula en `prefijoDeCargo()` a partir de escalafón + unificador de puestos + agrupador. El secuencial es `MAX(codigo) + 1` por prefijo, calculado en bloque (un solo `SELECT MAX` por prefijo distinto, no uno por cargo).

---

## Tablas de referencia en BD

Todas se leen desde Postgres al arrancar Dotaneitor. Se pueden actualizar con SQL sin rebuild.

| Tabla | Uso |
|---|---|
| `hospitales` | SIGLA → UNIVERSO TOTALIZADOR, TIPO, MONOVALENCIA |
| `ref_agrupadores` | ESCALAFON + LIT_PUESTO → AGRUPADOR |
| `ref_unificadores_puesto` | LIT_COD_REG + LIT_PUESTO → UNIFICADOR DE PUESTOS |
| `ref_especialidades_cuil` | CUIL + tipo → ESPECIALIDAD (cruce por CUIL) |
| `ref_especialidad_por_puesto` | AGRUPADOR + PUESTO → ESPECIALIDAD (cruce por agrupador) |

---

## Endpoints API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/v1/padron/snapshots` | Lista todos los snapshots |
| `POST` | `/api/v1/padron/upload` | Sube Excel, dispara pipeline async |
| `GET` | `/api/v1/padron/snapshots/:id/estado` | Polling de estado del pipeline |
| `GET` | `/api/v1/padron/snapshots/:id/diff` | Diff paginado con filtros |
| `POST` | `/api/v1/padron/snapshots/:id/aprobar` | Aprueba el snapshot completo |
| `POST` | `/api/v1/padron/snapshots/:id/rechazar` | Rechaza el snapshot |
| `POST` | `/api/v1/padron/snapshots/:id/diffs/:diffId/aprobar` | Aprueba un diff nuevo individual |
| `POST` | `/api/v1/padron/snapshots/:id/diffs/:diffId/rechazar` | Rechaza un diff nuevo individual |
| `POST` | `/api/v1/padron/snapshots/:id/diffs/aprobar-todos` | Aprueba todos los pendientes en bloque |
| `GET` | `/api/v1/padron/snapshots/:id/exportar` | Descarga Excel del Dotaneitor |
| `GET` | `/api/v1/padron/snapshots/:id/conflictos-validacion` | Cargos en validacion_vacante que reaparecen |
| `DELETE` | `/api/v1/padron/snapshots/:id` | Elimina snapshot en estado error/rechazado |

---

## Endpoints Dotaneitor (interno)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/session` | Crea sesión en memoria |
| `POST` | `/upload-cargos` | Sube el Excel a la sesión |
| `POST` | `/normalizar` | Normaliza columnas (async job) |
| `POST` | `/procesar` | Procesa el DataFrame (async job) |
| `POST` | `/cruzar` | Cruza especialidades (async job) |
| `GET` | `/job/:job_id` | Polling de estado de un job |
| `GET` | `/preview` | DataFrame paginado (usado por calcularDiff) |
| `GET` | `/exports/:snapshotId/dotacion.xlsx` | Descarga Excel persistente |
| `POST` | `/session/delete` | Elimina sesión y archivos tmp |

---

## Permisos requeridos

| Acción | Permiso |
|---|---|
| Subir padrón | `padron.subir` |
| Aprobar/rechazar snapshot | `padron.aprobar_padron` |
| Aprobar/rechazar diff individual | `padron.aprobar_padron` |
| Eliminar snapshot | `padron.eliminar_snap` |

---

## Consideraciones de rendimiento

- **Transacción con timeout extendido:** `TRANSACTION_OPTS = { timeout: 10min, maxWait: 10s }`. La primera aprobación contra una BD vacía puede generar hasta ~48k diffs "nuevo" en una sola transacción.
- **Batching:** `createMany` y `updateMany` se trocean en lotes de 2000 para no superar el límite de parámetros de Postgres (65535).
- **Códigos en bloque:** un solo `SELECT MAX` por prefijo distinto (~15 típicamente), no uno por cargo.
- **Sesiones en memoria:** TTL de 2 horas. Si el contenedor se reinicia durante el pipeline, el snapshot queda en `error` (cleanup al arrancar). El parquet en disco permite recuperar el DataFrame sin reprocesar.
- **ECONNRESET:** si Dotaneitor cierra la sesión mientras Node intenta leer `/preview`, el snapshot queda en error. Solución: borrar con SQL y volver a subir.

---

## Modelos Prisma relevantes

- `PadronSnapshot`: estado, fechaAsignada, filename, totalRegistros, pasoActual, errorMsg, archivoResultadoPath
- `PadronDiff`: snapshotId, tipo (nuevo/modificado/eliminado), idSialRol, campo, valorAnterior, valorNuevo, aprobado (null=pendiente, true=aprobado, false=rechazado)
- `PadronHistorico`: registro inmutable por snapshot aprobado, una fila por ocupación tocada
- `Cargo`: idSial, codigo, hospitalId, escalafonId, literalPuesto, especialidadLegacy, agrupador, unificadorPuesto, estado (vigente/no_vigente/validacion_vacante)
- `Ocupacion`: personaId, cargoId, idSialRol, cuilYRol, hasta (null = vigente)
- `Persona`: cuil, apellidoNombre, activo
