# Dotaneitor — Microservicio Python (SRRHH v2)

> Microservicio de procesamiento del padrón semanal Excel (`Cargos_Salud.xlsx`).
> Lee catálogos de referencia desde PostgreSQL y devuelve el dataset de dotación
> normalizado y resuelto contra el catálogo.

---

## Stack

- **FastAPI** + **Uvicorn**
- **Puerto**: `5001`
- **Python**: 3.11+
- **BD**: PostgreSQL 16 (via SQLAlchemy + psycopg2)

---

## Flujo de procesamiento (v2 — pipeline lineal)

Desde el Sprint 22 el procesamiento es un **único flujo síncrono** (`pipeline.py`):

```
recibe Excel  →  normaliza  →  procesa (limpieza + cruces de negocio)
              →  resuelve contra catálogo (escalafón / puesto / especialidad / JCAT)
              →  [dataset de dotación]  →  FIN
```

Una sola llamada hace todo. No hay sesiones, ni jobs asíncronos, ni pasos
intermedios (`/normalizar`, `/procesar`, `/cruzar`, `/preview`). Node sube el
archivo, recibe el dataset completo paginado y arma el diff.

**Regla:** el frontend nunca habla directamente con este servicio. Todo pasa por
la API Node (`apps/api` → `modules/padron`).

> **Nota sobre el flujo viejo.** Los endpoints de sesión (`/session`,
> `/upload-cargos`, `/normalizar`, `/procesar`, `/cruzar`, `/preview`,
> `/descargar`, `/reporte-calidad`, `/session/delete`) siguen presentes en
> `main.py` en **paralelo**, por si hace falta un rollback. Node ya **no** los
> consume: usa exclusivamente `POST /procesar-padron`. Se eliminarán en un
> sprint posterior una vez validado el pipeline lineal en producción.

---

## Endpoints

| Método | Ruta                                   | Descripción                                                                                   |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/health`                              | Health check                                                                                  |
| POST   | `/procesar-padron`                     | **Pipeline lineal.** Procesa el Excel de punta a punta y devuelve el dataset + reporte + logs |
| GET    | `/exports/{snapshot_id}/dotacion.xlsx` | Descarga el Excel de dotación persistido para un snapshot                                     |

### `POST /procesar-padron`

Síncrono. `multipart/form-data`:

| Campo         | Tipo            | Descripción                                                                             |
| ------------- | --------------- | --------------------------------------------------------------------------------------- |
| `file`        | archivo         | `Cargos_Salud.xlsx` (hoja `Sheet1`)                                                     |
| `snapshot_id` | form (opcional) | Si viene, además persiste `exports/<snapshot_id>/dotacion.xlsx` para descarga posterior |

Query params de paginación de la respuesta:

| Param   | Default  | Descripción                                                                                                                                          |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`  | `1`      | Página (1-based)                                                                                                                                     |
| `limit` | `100000` | Filas por página. Node consume el dataset **completo** en una sola respuesta (un padrón real son ~48k filas), así que el default es alto a propósito |

Respuesta JSON:

```json
{
  "cols": ["id_sial", "cuil", "..."],
  "rows": [{ "id_sial": "...", "cuil": "...", "...": "..." }],
  "total": 48328,
  "page": 1,
  "limit": 100000,
  "reporte": {
    "sin_sigla": [],
    "especialidad_limpiada": 0,
    "duplicados_id_sial_grupos": 0,
    "duplicados_id_sial_filas_eliminadas": 0,
    "jefaturas_duplicadas": 0,
    "nombres_sin_coma": 0,
    "puestos_auto_alta": 0,
    "especialidades_auto_alta": 0,
    "jcat_sin_mapeo": 0
  },
  "logs": [{ "text": "✓ Normalización completada", "type": "success" }]
}
```

El `run` usa un directorio temporal efímero que se borra al terminar (no deja
sesión en memoria ni en disco).

---

## Columnas de salida (v2)

El dataset sale en **snake_case sin tilde/espacios** (ej. `TIPO DE HOSPITAL /
SIGLA` → `tipo_de_hospital_sigla`, `ANTIGÜEDAD` → `antiguedad`). Todo el texto se
normaliza a **minúscula + sin tilde**, salvo `siglas` (código de efector) y los
UUIDs resueltos del catálogo.

Diferencias con el flujo viejo:

- **Se quitaron** las columnas `unificador_de_puestos`, `agrupador` y `estado`
  (las arma/filtra Node, no el Dotaneitor).
- **Se agregaron** las columnas resueltas contra el catálogo y las
  descompuestas:
  - `escalafon_id`, `puesto_cargo_id`, `especialidad_puesto_id` — UUIDs del
    catálogo (ver "Resolución contra catálogo").
  - `literal_puesto_origen`, `especialidad_origen` — texto crudo de origen,
    conservado antes de normalizar.
  - `cargo_jefatura` — cargo de conducción derivado del JCAT (`codigo_jefaturas`).
  - `apellido`, `nombre` — partidos de `ayn` (`"apellido, nombre"`).
  - `id_sial_legajo`, `nro_rol` — descompuestos de `id_sial` (`"legajo-rol"`);
    `id_sial_rol` conserva el valor crudo.

El orden canónico de salida está definido en `_ORDEN_SALIDA` (`pipeline.py`).

---

## Resolución contra catálogo

Cada registro resuelve su carrera/puesto/especialidad a los ids del catálogo
PostgreSQL (`catalogo.py`, clase `Catalogo`):

| Resuelve                          | Contra                             | Columna de salida        |
| --------------------------------- | ---------------------------------- | ------------------------ |
| `codigo_de_registro` → escalafón  | `codigos_registro` / `escalafones` | `escalafon_id`           |
| `literal_puesto` → puesto         | `puestos_cargo`                    | `puesto_cargo_id`        |
| `especialidad` → especialidad     | `especialidades_puesto`            | `especialidad_puesto_id` |
| `codigo_jefaturas` (JCAT) → cargo | `jcat_cargo_jefatura`              | `cargo_jefatura`         |

**Auto-alta `pendiente_curar`:** si un puesto o especialidad del padrón no tiene
match en el catálogo, se da de alta automáticamente con el flag
`pendiente_curar = true` para que RRHH lo revise después. El contador de altas
va en el `reporte` (`puestos_auto_alta`, `especialidades_auto_alta`).

Un JCAT con valor pero sin mapeo en `jcat_cargo_jefatura` **no** frena el
proceso: deja `cargo_jefatura = null` y lo cuenta en `jcat_sin_mapeo`.

---

## Variables de entorno

```env
DATABASE_URL=postgresql://srrhh_user:srrhh_pass@localhost:5432/srrhh_db
CORS_ORIGINS=   # lista separada por comas (vacío = sin CORS)
```

---

## Datos de referencia y seeds (requisito previo)

El pipeline **no funciona sin los catálogos poblados**. Antes de procesar un
padrón hay que correr, en orden:

1. **Migraciones Prisma** (desde `apps/api`), que crean/pueblan:
   - columna `pendiente_curar` en `especialidades_puesto` y `puestos_cargo`.
   - tabla `jcat_cargo_jefatura` + seed de los JCAT base (P/G/Z).

   ```bash
   # dentro del contenedor srrhh_api
   npx prisma migrate deploy && npx prisma generate
   ```

2. **Seed de tablas `ref_*` + `hospitales`** (`scripts/seed_referencias.py`),
   que `DotacionAutomationBD.cargar_archivos()` y la resolución de especialidades
   leen. Se poblan desde `ARCHIVOS PARA DOTACION.xlsx` (hojas `AGRUPADOR`,
   `UNIFICADOR DE PUESTOS`, `SIGLAS`, `ESPECIALIDADES CPH/SUPLENTES/RESIDENTES`):
   ```bash
   cd services/dotaneitor
   python scripts/seed_referencias.py --archivo "/ruta/a/ARCHIVOS PARA DOTACION.xlsx"
   ```
   Es re-ejecutable (trunca y recarga las `ref_*`, actualiza `hospitales` por
   `sigla` sin crear nuevos). Correrlo de nuevo si el Excel de referencia cambia.

> **Al desplegar en otro entorno** hay que replicar ambos pasos (migraciones +
> seed). Ver el hallazgo completo y la verificación con datos reales en
> `Doc/Dotaneitor_Analisis.md`, sección 9.

---

## Desarrollo local

```bash
cd services/dotaneitor
pip install -r requirements.txt
uvicorn main:app --reload --port 5001
```

O con Docker:

```bash
docker compose up dotaneitor -d
```

> El `docker-compose.override.yml` local (gitignored) monta
> `./services/dotaneitor:/app` y arranca `uvicorn --reload` para hot-reload.
> No se commitea; replicarlo a mano en cada entorno de desarrollo si se quiere.

---

## Diferencias con la versión legacy (dotacion-rrhh)

| Aspecto              | Legacy                                    | SRRHH v2                                                                       |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| Base de datos        | MySQL                                     | PostgreSQL                                                                     |
| Flujo                | sesión + varios pasos                     | pipeline lineal (`/procesar-padron`)                                           |
| Tablas de referencia | `dot_agrupador`, `dot_unificador_puestos` | `ref_agrupadores`, `ref_unificadores_puesto`                                   |
| Catálogo resuelto    | —                                         | `escalafones`, `puestos_cargo`, `especialidades_puesto`, `jcat_cargo_jefatura` |
| Aprobación           | `/guardar-bd` en Python                   | Endpoint Node `POST /api/v1/padron/snapshots/:id/aprobar`                      |
| Historial            | `dot_resultado_historico`                 | `padron_historico` (particionado)                                              |
