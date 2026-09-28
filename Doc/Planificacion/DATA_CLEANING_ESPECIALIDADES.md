# Data-cleaning de especialidades — análisis y plan

> Estado: **análisis / pendiente de ejecución**. Este documento registra el
> diagnóstico de las especialidades en la base y el plan para normalizarlas.
> No se han modificado datos (salvo la mejora de matching del jurado, que NO
> toca datos — ver sección "Lo ya resuelto").

## Contexto

Las especialidades médicas se guardan como **texto libre** en muchas tablas y
con nomenclaturas inconsistentes entre sí:

- **Mayúsculas / minúsculas:** `CLINICA MEDICA` vs `Clinica Medica`.
- **Acentos sí / no:** `Clínica Médica` (padrón de personas) vs `Clinica Medica`
  (cargos legacy).
- **Paréntesis redundantes:** `Clinica Medica (Medicina Interna)` (cargo) vs
  `Clinica Medica` (canónico y padrón).

Esto rompe cualquier comparación por igualdad exacta entre especialidad de un
cargo/concurso y la de las personas (ej.: sorteo de jurado, órdenes de mérito
compatibles, reutilización).

## Dónde viven las especialidades (columnas de texto)

| Tabla | Columna | Notas |
|---|---|---|
| `cargos` | `especialidad_legacy` | Cargo. Suele traer paréntesis y mayúsculas. |
| `personas` | `especialidad_cph`, `especialidad_principal` | Padrón. Forma base con acentos. |
| `concursos_cph` | `especialidad_solicitada` | Concurso (puede ser null → cae a `cargo.especialidad_legacy`). |
| `inscriptos_concurso` | `especialidad` | Inscriptos a examen. |
| `orden_merito_integrantes` | `especialidad` | Integrantes de OM. |
| `ordenes_merito` | `especialidad` | Clave de compatibilidad de OM. |
| `miembros_jurado_sorteados` | `especialidad` | Snapshot del jurado. |
| `padron_historico` | `especialidad` | Padrón semanal. |
| `postulantes`, `solicitudes_alta`, `pou`, `baja_sial_diffs` | `especialidad` | Otros orígenes. |

## Tablas de referencia existentes

- **`especialidades_puesto`** (336 filas): catálogo canónico de especialidades
  por puesto. Sin acentos. El paréntesis solo aparece donde es una
  subespecialidad real.
- **`ref_correcciones_especialidad`** (4 filas): correcciones puntuales de
  tipeo (`PSIQUATRIA → Psiquiatría`, `CIRUGIA TORAXICA → Cirugía Torácica`,
  `PSIQUIATRA → Psiquiatría`, `TRABAJO SOCIAL Y SERVICIO SOCIAL → Trabajo Social`).
  Estructura: `original` (único) → `correccion` + `activo`.
- `ref_especialidad_por_puesto` (37), `ref_especialidades_cuil` (49231),
  `pou_especialidad_mapeo` (12): otros mapeos auxiliares.

## Hallazgo clave: el paréntesis

De las especialidades canónicas con paréntesis, **la única base con varias
variantes reales es "Bioquimica Clinica"** (6): Bacteriologia, Genetica,
Hematologia, Lactancia, Microbiologia Clinica, Quimica Clinica.

Todas las demás especialidades con paréntesis (Clínica Médica, Pediatría,
Radiología, Anatomía Patológica, Enfermedades Infecciosas, Fisiatría,
Radioterapia, etc.) tienen el paréntesis como **aclaración redundante** de la
misma especialidad base — no hay variantes canónicas que compitan.

Volumen: ~4782 cargos tienen `especialidad_legacy` con paréntesis. Las más
frecuentes: `Pediatria (Clinica Pediatrica)` (1689), `Clinica Medica (Medicina
Interna)` (948 + 546 en mayúsculas), `Bioquimica Clinica (Quimica Clinica)` (533).

## Lo ya resuelto (matching del jurado, sin tocar datos)

Decisión de negocio: **para emparejar especialidades en el jurado importa lo de
FUERA del paréntesis; la distinción del paréntesis no interesa** (incluidas las
Bioquímicas).

Implementado en `apps/api/src/modules/concursos-cph/sorteoJurado.service.ts`,
función `norm()`: al comparar especialidades se descartan acentos, se pasa a
minúsculas, **se quita todo lo que está entre paréntesis** y se colapsan
espacios. No modifica datos, solo la comparación. Con esto:

- `Clinica Medica (Medicina Interna)` ≡ `Clínica Médica` → **match**.
- Todas las `Bioquimica Clinica (...)` se tratan como la misma especialidad
  base a efectos del jurado (comportamiento deseado).

## Plan de normalización de datos (pendiente, cuando se decida encararlo)

Objetivo: llevar las especialidades crudas de todas las tablas a un valor
canónico consistente, sin perder información.

1. **Construir el mapa de normalización** `texto_crudo → canónico`:
   - Base: catálogo `especialidades_puesto`.
   - Regla de matching: comparar por forma normalizada (sin acentos, minúsculas,
     sin paréntesis, espacios colapsados) contra el canónico.
   - Sumar las 4 correcciones de `ref_correcciones_especialidad`.
2. **Generar un reporte** `crudo → canónico sugerido` marcando:
   - Match directo (alta confianza).
   - Ambiguos / sin match (revisión manual).
3. **Decidir política del paréntesis por tabla/uso:**
   - Para jurado ya se ignora en comparación (no requiere tocar datos).
   - Para mostrar/documentos: definir si se conserva el texto original o se
     canoniza.
4. **Aplicar por tabla, con backup** (tabla `_backup_<tabla>_especialidad` o
   dump previo). Empezar por las de mayor impacto: `cargos.especialidad_legacy`,
   `personas.especialidad_*`.
5. **Verificar** recuentos antes/después y casos de negocio (sorteo, OM).

### Riesgos / cuidados

- No colapsar las 6 variantes de `Bioquimica Clinica` si en algún flujo futuro
  la subespecialidad importa (hoy, para jurado, no importa).
- Varias tablas son snapshots históricos (`miembros_jurado_sorteados`,
  `padron_historico`): evaluar si conviene normalizarlas o dejarlas como
  registro de lo que había en su momento.
- Trabajar siempre sobre la base local primero; nunca sobre producción sin
  backup y validación.

## Consultas útiles (diagnóstico)

```sql
-- Cargos con paréntesis en la especialidad (top)
SELECT especialidad_legacy, count(*) FROM cargos
WHERE especialidad_legacy LIKE '%(%'
GROUP BY 1 ORDER BY 2 DESC;

-- Bases canónicas con múltiples variantes de paréntesis (riesgo de sobre-agrupar)
SELECT trim(regexp_replace(nombre, '\([^)]*\)', '', 'g')) AS base,
       count(DISTINCT nombre) AS variantes,
       string_agg(DISTINCT nombre, ' | ')
FROM especialidades_puesto
WHERE nombre LIKE '%(%'
GROUP BY 1 HAVING count(DISTINCT nombre) > 1
ORDER BY 2 DESC;
```
