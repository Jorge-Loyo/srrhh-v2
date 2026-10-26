# Consultas de verificación e invariantes del padrón (SQL reutilizable)

> **Tipo:** referencia operativa (herramientas de verificación), no un plan ni un contrato.
> **Estado:** VIGENTE como caja de herramientas. Las *reglas* que estas consultas verifican
> viven en los contratos; acá solo quedan las consultas para correrlas tras cada carga.
> **Origen:** consolidado de los diagnósticos de `Doc/Referencias/` (curaduría 2026-10). Se
> conservan únicamente las consultas reutilizables; los diagnósticos puntuales (auditorías de
> sprint, evaluaciones del Dotaneitor viejo, planes de limpieza ya ejecutados) se descartaron
> porque su información durable ya está mapeada en los contratos y sprints.

## Dónde viven las reglas (fuente de verdad)

- Reglas de negocio del padrón/Dotaneitor (carreras, especialidad, un activo por persona,
  desdoblado 24/07, triple confirmación, defensas del pipeline): `Doc/Contratos/Contrato_Dotaneitor.md`.
- Flujo técnico de importación (pipeline, diff, endpoints): `Doc/Contratos/Contrato_Padron.md`.
- Modelo de datos (tablas `cargos`, `ocupaciones`, `padron_*`): `Doc/Contratos/Contrato_Datos.md`.
- Saneamiento de especialidades, grupos y fixes de pipeline (fantasma de jefatura, equivalencias,
  reclasificación por código de registro, SG, grupos): `Doc/Planificacion/Sprints/POST_SPRINT_25_saneamiento_especialidades_grupos.md`.
- Normalización de especialidad (regla del paréntesis + excepción Bioquímica Clínica):
  `Doc/Contratos/Contrato_Dotaneitor.md` (Regla 2).

## Cómo correrlas

Contra la base local (Docker/WSL):

```
docker compose exec -T postgres psql -U srrhh_user -d srrhh_db -c "<QUERY>"
```

Los nombres de columnas son los físicos de Postgres (ver `@map` en `prisma/schema.prisma`).
`fecha_asignada` del snapshot está en formato `YYYY-MM-DD`.

---

## 1. Conteo de diffs por tipo, por snapshot/padrón

Útil para ver el tamaño y la composición de cada carga (altas/bajas/modificaciones y los
marcadores internos de reapertura).

```sql
SELECT ps.fecha_asignada,
       d.tipo,
       count(*) AS filas,
       count(*) FILTER (WHERE d.campo IS NULL)                   AS campo_null,
       count(*) FILTER (WHERE d.campo = 'baja_previa')           AS baja_previa,
       count(*) FILTER (WHERE d.campo LIKE 'completado:%')       AS completados,
       count(*) FILTER (WHERE d.campo = '__reabrir_ocupacion__') AS reaperturas,
       count(DISTINCT d.id_sial_rol)                             AS roles_distintos
FROM padron_diff d
JOIN padron_snapshots ps ON ps.id = d.snapshot_id
GROUP BY ps.fecha_asignada, d.tipo
ORDER BY ps.fecha_asignada, d.tipo;
```

> Para un solo padrón: agregar `WHERE ps.fecha_asignada = '2026-10-18'` antes del `GROUP BY`.

---

## 2. Invariante — un solo rol activo por persona

Una persona debe tener, por regla general, una sola ocupación vigente (`hasta IS NULL`). Esta
consulta desglosa por código de registro las personas que incumplen (más de un activo).

```sql
WITH activas AS (
  SELECT o.id, o.cuil, o.persona_id, c.codigo_registro_id, cr.codigo AS cod_reg
  FROM ocupaciones o
  JOIN cargos c                 ON c.id = o.cargo_id
  LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  WHERE o.hasta IS NULL
),
multi AS (
  SELECT persona_id
  FROM activas
  GROUP BY persona_id
  HAVING count(*) > 1
)
SELECT a.cod_reg,
       count(DISTINCT a.persona_id) AS personas_con_mas_de_un_activo,
       count(*)                     AS ocupaciones_activas_en_esas_personas
FROM activas a
JOIN multi m ON m.persona_id = a.persona_id
GROUP BY a.cod_reg
ORDER BY personas_con_mas_de_un_activo DESC NULLS LAST;
```

> Total de personas con más de un activo (sin desglose), con el mismo CTE: `SELECT count(*) FROM multi;`.

---

## 3. Invariante C.1 — 0 cargos compartidos de roles 24/07 (Residencias/Docentes)

Los roles de Residencias (24) y Docentes Históricos (07) se modelan 1:1 (un cargo por
persona-rol) y se matchean por `id_sial_rol`. Esta invariante debe dar **cero**: si da más,
hay un desdoblado roto que corregir antes de dar por bueno el padrón
(ver `Contrato_Dotaneitor.md`, Regla 4).

```sql
SELECT c.id_sial, c.codigo, count(DISTINCT o.persona_id) AS personas_distintas
FROM cargos c
JOIN ocupaciones o            ON o.cargo_id = c.id AND o.hasta IS NULL
LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
WHERE cr.codigo IN ('24', '07')
GROUP BY c.id_sial, c.codigo
HAVING count(DISTINCT o.persona_id) > 1
ORDER BY personas_distintas DESC;
```

---

## 4. Ocupaciones abiertas con situación de revista NO activa (roles colgados)

Detecta ocupaciones `hasta IS NULL` cuya situación de revista indica retención/comisión/baja —
señal de un rol que quizá quedó colgado sin consumir su baja. Case-insensitive y sin asumir tildes.

```sql
SELECT cr.codigo AS cod_reg,
       o.situacion_revista,
       count(*) AS roles_colgados
FROM ocupaciones o
JOIN cargos c                 ON c.id = o.cargo_id
LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
WHERE o.hasta IS NULL
  AND o.situacion_revista IS NOT NULL
  AND (
       lower(o.situacion_revista) LIKE '%retenc%'
    OR lower(o.situacion_revista) LIKE '%comis%'
    OR lower(o.situacion_revista) LIKE '%baja%'
  )
GROUP BY cr.codigo, o.situacion_revista
ORDER BY roles_colgados DESC;
```

---

## 5. Valores reales de `situacion_revista` (verificar normalización)

`situacion_revista` se guarda en minúscula/sin tilde, en un catálogo cerrado de 3 estados
(`activo`, `comision`, `retencion de cargo`). Esta consulta lista los valores realmente
presentes para confirmar que la normalización se está aplicando (ver nota de normalización en
`Contrato_Dotaneitor.md`).

```sql
SELECT situacion_revista, estado_persona, count(*) AS filas
FROM ocupaciones
WHERE hasta IS NULL
GROUP BY situacion_revista, estado_persona
ORDER BY filas DESC
LIMIT 50;
```

---

## 6. Trazar todos los roles de una persona (por CUIL)

Para investigar un caso puntual: muestra, por cada rol de la persona, si existe el cargo, su
estado y si su ocupación quedó abierta. Reemplazar el CUIL de ejemplo.

```sql
SELECT o.id_sial_rol,
       c.id_sial,
       c.codigo,
       c.estado          AS estado_cargo,
       o.situacion_revista,
       o.estado_persona,
       o.desde,
       o.hasta,
       p.activo          AS persona_activa
FROM ocupaciones o
JOIN cargos c   ON c.id = o.cargo_id
JOIN personas p ON p.id = o.persona_id
WHERE o.cuil = '<CUIL>'
   OR o.id_sial_rol LIKE '%<CUIL>%'
ORDER BY o.id_sial_rol, o.hasta NULLS FIRST;
```

---

## 7. Diagnóstico de especialidades con paréntesis (soporte a la regla del paréntesis)

Al comparar/normalizar especialidades importa lo de **fuera** del paréntesis; la aclaración
entre paréntesis es redundante, **excepto** `Bioquimica Clinica` (tiene subespecialidades
reales). Estas consultas ayudan a detectar bases canónicas con varias variantes antes de
cualquier normalización.

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
