# Sprint Dotaneitor — Evaluación del servicio actual (base para rediseño)

**Fecha:** 2026-09-28
**Objetivo del sprint:** evaluar el Dotaneitor de producción (rama `jorge`, commit `0f180cb`)
paso a paso para decidir **qué se queda, qué se va y qué se modifica**, con foco en optimizar la
carga/procesamiento de la documentación y dejar claro qué tablas de la BD **necesita** (referencia)
y cuáles **alimenta** (negocio).

> Este documento describe el estado ACTUAL. No propone todavía el diseño nuevo; es el insumo para
> discutirlo. Al final hay una sección de candidatos a rediseño para priorizar.

---

## 1. Qué es y dónde vive

- Microservicio **Python / FastAPI**, corre en Uvicorn (`services/dotaneitor/`).
- Es un **servicio de solo transformación**: recibe el Excel del padrón (`Cargos_Salud`), lo limpia,
  lo enriquece cruzando contra tablas de referencia, y **devuelve un DataFrame** vía HTTP.
- **No escribe nada en las tablas de negocio.** Quien persiste es el backend Node
  (`apps/api/src/modules/padron/padron.service.ts`), que consume el resultado, calcula el diff
  contra Postgres y, al aprobar el snapshot, alimenta las tablas.
- Archivos del servicio:
  - `main.py` — capa HTTP (endpoints, jobs, estado en memoria, subclases que leen de Postgres).
  - `Dotaneitor.py` — núcleo de negocio (`DotacionAutomation.procesar()`, pasos 0–10).
  - `normalizador_cargos.py` — limpieza previa del Excel.
  - `especialidades.py` — cruce de especialidad por CUIL.
  - `especialidad_por_agrupador.py` — cruce de especialidad por puesto/agrupador.
  - `consolidacion_lit_puesto.py` / `consolidacion_especialidades.py` — diccionarios de corrección.
  - `scripts/seed_referencias.py` — carga inicial de las tablas de referencia desde Excel.

---

## 2. Flujo end-to-end (visión general)

```
Excel Cargos_Salud
   │  POST /session            (crea sesión + carpeta tmp)
   │  POST /upload-cargos       (guarda el xlsx)
   ▼
/normalizar   → limpia el Excel y lo reescribe
/procesar     → transforma (lee: hospitales, ref_agrupadores, ref_unificadores_puesto)
/cruzar       → completa ESPECIALIDAD (lee: ref_especialidades_cuil, ref_especialidad_por_puesto)
   │  genera tmp/<sid>/resultado.parquet  + exports/<snapshot_id>/dotacion.xlsx
   ▼
Node: fetchAllPreview (GET /preview paginado)  → arma el DataFrame completo
Node: calcularDiff     → compara contra Cargo + Ocupacion de Postgres
   │  → crea PadronDiff (nuevo / modificado / eliminado)  → snapshot 'pendiente'
   ▼
Revisión manual de diffs (aprobar/rechazar los "nuevo")
   ▼
Node: aprobarSnapshotService  → alimenta Persona, Cargo, Ocupacion, PadronHistorico,
                                  KpisDotacionSnapshot + catálogos  → snapshot 'aprobado'
```

Los pasos pesados corren como **jobs asíncronos**: cada uno lanza un `Thread` y el estado se guarda
como JSON en `tmp/jobs/<id>.json`. El backend hace **polling** de `GET /job/<id>` hasta `done`/`error`.

---

## 3. Endpoints (main.py)

| Endpoint | Método | Qué hace |
| --- | --- | --- |
| `/health` | GET | Estado del servicio (`{status:'ok'}`). Usado por el health check de Render. |
| `/session` | POST | Crea sesión (uuid) + carpeta `tmp/<sid>`. |
| `/upload-cargos` | POST | Guarda el Excel subido en `tmp/<sid>`. Cuenta filas. |
| `/normalizar` | POST | Job: limpia el Excel (mojibake, fechas, teléfonos, formato título) y lo **reescribe**. |
| `/procesar` | POST | Job: corre `procesar()` (pasos 0–10). Guarda `resultado.parquet`. |
| `/cruzar` | POST | Job: completa ESPECIALIDAD (por CUIL + por puesto). Re-guarda parquet y, si viene `snapshot_id`, escribe `exports/<id>/dotacion.xlsx`. |
| `/preview` | GET | Devuelve el DataFrame paginado (JSON). **Es como Node consume el resultado.** |
| `/job/<id>` | GET | Estado del job asíncrono. |
| `/descargar` | GET | Excel del resultado (en memoria). |
| `/reporte-calidad` | GET | Excel de calidad (4 hojas). |
| `/exports/<id>/dotacion.xlsx` | GET | Descarga del Excel persistido por snapshot. |
| `/session/delete` | POST | Borra sesión (memoria + disco). |

**Estado en memoria (`sessions{}`):** dict global con el DataFrame en RAM por sesión. Volátil (se
pierde al reiniciar). `get_session` lo reconstruye desde `resultado.parquet` si el contenedor
reinició. TTL 2 h, limpieza cada 30 min.

---

## 4. Qué hace el procesamiento, paso a paso

### 4.1 Normalización (`/normalizar`)
Limpieza previa sobre el Excel crudo, columna por columna:
1. **Mojibake + espacios:** repara doble-encoding UTF-8 ("Ã³"→"ó"), quita artefactos `_x000D_`, colapsa espacios.
2. **Fechas:** quita la hora ("0:00:00") de las columnas de fecha.
3. **Teléfono:** deja solo dígitos, quita prefijo país 54 y 0 de área.
4. **LIT_COD_REG:** saca el símbolo "|".
5. **AYN (Apellido, Nombre):** Formato Título respetando conectores (de, del, la…).
6. **LIT_PUESTO:** consolida variantes de tipeo (diccionario por COD_REG y directo).
7. **Vocabulario técnico:** Formato Título preservando abreviaturas (SECC, DEPT, siglas de hospital…).
8. **Emails:** a minúscula.

### 4.2 Procesamiento (`/procesar`) — pasos 0 a 10
- **0. Limpieza previa:** ajustes de SIGLA (`UAIEAIT`→`EAIT`, quita prefijo `DGA` de `DGAH…`); COD_REG 22 → LITERAL CR "Nueva Carrera Prof. Hosp".
- **1. ROL:** extrae el número tras el último guión del campo CARGO.
- **2. CUIL:** quita guiones, a entero.
- **3. CUIL Y ROL:** `CUIL-ROL` (clave identificadora del reporte de calidad).
- **4.** Elimina columna ROL temporal.
- **5. Cruce SIGLAS** (lee tabla `hospitales`): agrega UNIVERSO TOTALIZADOR, TIPO DE HOSPITAL / SIGLA, MONOVALENCIA.
- **6. Cruce UNIFICADOR** (lee `ref_unificadores_puesto`): deriva UNIFICADOR DE PUESTOS por `LIT_COD_REG - LIT_PUESTO`.
- **7. Cruce AGRUPADOR** (lee `ref_agrupadores`): deriva AGRUPADOR por `ESCALAFON - LIT_PUESTO`.
  - **7.5** COD_SIT 32 + Enfermero/a → "Enfermero/a ATP".
  - **7.6** JCAT "0" o vacío → None.
- **8. JEFE ESCALAFON:** por COD_REG (37→Jefe CPH POF/POU según ESCRITORIO; 85→Técnico; 87→Enfermería; 83→Administrativo). Vectorizado.
- **9. ESTADO:** por SIT_REV (retención/comisión) o BLOQ_DESDE (bloqueado); default Activo. Vectorizado.
- **9.5. Renombre de columnas:** de nombres SIAL a nombres de negocio (CARGO→ID SIAL, NUM_DOC→NUMERO DOC, etc.).
- **9.6. Limpiar ESPECIALIDAD indebida:** vacía la especialidad si el COD_REG no es 37/23/24.
- **9.7.** Marca (informa) filas con especialidad pero sin LITERAL PUESTO.
- **9.75. Forzar mayúsculas / sin tilde** en columnas pactadas.
- **9.8. Eliminar duplicados ID SIAL:** conserva la fila más completa por cargo.
- **9.9. Jefaturas duplicadas:** elimina el rol jefe CPH duplicado sin CODIGO JEFATURAS.
- **10. Reordenar columnas** al orden canónico (58 columnas).

### 4.3 Cruce de especialidades (`/cruzar`)
- **(A) Por CUIL** (lee `ref_especialidades_cuil`, filtrada por COD_REG 37/23/24): completa huecos de ESPECIALIDAD.
- **(B) Por puesto/agrupador** (lee `ref_especialidad_por_puesto` + aprende del propio df): para médicos/residentes sin especialidad, la deriva del LITERAL PUESTO (diccionario "moda empírica").

### 4.4 Reporte de calidad
Excel de 4 hojas: Resumen, Detalle, Completitud por columna, Completitud por fila. Detecta: siglas/
unificador/agrupador sin coincidencia, especialidad vaciada, especialidad sin puesto, ID SIAL
duplicado, jefaturas CPH duplicadas, especialidad no derivable.

---

## 5. Mapa de la base de datos

### 5.1 Tablas que el Dotaneitor NECESITA (referencia, solo lectura)
| Tabla | Columnas usadas | Para qué | Cómo se carga |
| --- | --- | --- | --- |
| `hospitales` | sigla, universo_totalizador, tipo, monovalencia | Cruce SIGLAS (paso 5) | seed (hoja SIGLAS) + migración enriquecer |
| `ref_agrupadores` | cruce, escalafon, lit_puesto, agrupador | Cruce AGRUPADOR (paso 7) | `seed_referencias.py` (hoja AGRUPADOR) |
| `ref_unificadores_puesto` | cruce, lit_cod_reg, lit_puesto, unificador | Cruce UNIFICADOR (paso 6) | `seed_referencias.py` (hoja UNIFICADOR DE PUESTOS) |
| `ref_especialidades_cuil` | tipo, cuil, cuil_y_rol, especialidad | Cruce especialidad por CUIL (`/cruzar`) | `seed_referencias.py` (hojas ESPECIALIDADES CPH/SUPLENTES/RESIDENTES, ~49k filas) |
| `ref_especialidad_por_puesto` | agrupador, especialidad | Cruce especialidad por puesto (`/cruzar`) | migración / carga aparte (tiene fallback hardcodeado) |
| `ref_correcciones_lit_puesto` | cod_reg, original, correccion | Normalizar LIT_PUESTO | migración / carga aparte (fallback hardcodeado) |
| `ref_correcciones_especialidad` | original, correccion | Corregir tipeos de especialidad | migración / carga aparte (fallback hardcodeado) |

> ⚠️ Riesgo conocido: si estas tablas quedan vacías, el pipeline no falla — deja las columnas
> derivadas en blanco **en silencio**. Ya pasó al migrar de Excel a Postgres.

### 5.2 Tablas de negocio que se ALIMENTAN (las escribe Node al aprobar, no el Dotaneitor)
| Tabla | Rol | Qué se escribe |
| --- | --- | --- |
| `personas` | negocio | cuil, doc, apellidoNombre, nacimiento, sexo, especialidad, contacto, antigüedad, activo |
| `cargos` | negocio | idSial, codigo interno, hospital, escalafón, codigoRegistro, literalPuesto, agrupador, unificador, repa, estado |
| `ocupaciones` | negocio | vínculo persona↔cargo, idSialRol, situacionRevista, desde/hasta, jefatura/comisión, snapshotId |
| `padron_historico` | negocio | foto inmutable por snapshot |
| `kpis_dotacion_snapshot` | negocio | personas únicas por escalafón/mes |
| `hospitales`, `escalafones`, `codigos_registro` | catálogo | altas incidentales de valores nuevos |
| `bajas`, `organigramas` | negocio | vínculo de bajas y sync de universo |
| `padron_snapshots`, `padron_diff` | control | estado del pipeline y diffs |

### 5.3 Control del flujo
- **PadronSnapshot:** estados `procesando → pendiente → aprobado / error`; `pasoActual` (normalizar/procesar/cruzar/diff/guardando).
- **PadronDiff:** tipo `nuevo` / `modificado` / `eliminado`; `aprobado` (null=pendiente, true, false). Los "nuevo" RES/DOC/AS-* se auto-aprueban.

---

## 6. Candidatos a rediseño (para priorizar en el sprint)

### 6.1 Rendimiento / memoria (lo que causó los problemas en Render)
- **Múltiples `.copy()` del DataFrame completo** (~48k × 58 cols) por request: en `procesar`, `normalizar`, `_cruzar_especialidades`, `_forzar_mayusculas`, `_save_df`. Evaluar trabajar in-place.
- **`.apply()` con funciones Python puras** sobre todo el padrón (normalización, forzado de mayúsculas, completitud): retienen el GIL, son lentas. Evaluar vectorización o Cython/polars.
- **`.iterrows()` anidado** en `_detectar_jefaturas_duplicadas`. (El dedup ID SIAL ya se vectorizó en la rama de testing — evaluar traerlo.)
- **openpyxl en memoria** para leer/escribir Excel: lento y pesado. Evaluar lectura por streaming o formato intermedio.
- **Estado `sessions{}` con DataFrames en RAM** + 1 worker: no escala y compite con el health check. Evaluar mover el trabajo pesado fuera del proceso web (worker/cola) o compartir estado en disco.
- **Relee el Excel varias veces** (upload cuenta filas, normalizar, procesar). Evaluar leer una sola vez.

### 6.2 Reglas de negocio "mágicas" a revisar
- Códigos de registro hardcodeados (37/23/24/85/87/83, 22, COD_SIT 32).
- Manipulación de SIGLA hardcodeada (`UAIEAIT`→`EAIT`, prefijo `DGAH`).
- `MAPEO_ESPECIALIDAD_POR_PUESTO`: diccionario calculado **a mano una sola vez**, no se recalcula → riesgo de desincronización.
- Cruces por concatenación de strings normalizados: frágiles ante cambios de formato.
- Typos deliberados en nombres de columnas de salida ("DOCUEMNTACION POU"), "ANTIGÜEDAD" con diéresis.
- `fecha_asignada` reutilizado como `snapshot_id` en `/cruzar`: acoplamiento confuso.

### 6.3 Robustez de datos
- Tablas de referencia vacías → columnas en blanco en silencio (agregar validación/alerta).
- Cruce de especialidad **solo por CUIL** (limitación aceptada) — evaluar si el rediseño lo amplía.

### 6.4 Arquitectura (preguntas para el sprint)
- ¿Sigue siendo un microservicio Python separado, o se integra al backend? (implica reescribir la lógica pandas).
- ¿Se mantiene el modelo de jobs con Thread + parquet, o se pasa a una cola real?
- ¿Qué se queda del reporte de calidad tal cual y qué se rediseña?

---

## 7. Método de trabajo propuesto para el sprint
1. Recorrer este documento y marcar por cada bloque: **se queda / se va / se modifica**.
2. Definir el alcance del "Dotaneitor nuevo" (¿reescritura, refactor, o solo optimización?).
3. Congelar el contrato de datos: entrada (columnas del Excel), salida (58 columnas), tablas de
   referencia y tablas de negocio — para que el rediseño no rompa el consumo de Node.
4. Priorizar las optimizaciones de la sección 6.1 (son las que ya dieron problemas en producción).
```
