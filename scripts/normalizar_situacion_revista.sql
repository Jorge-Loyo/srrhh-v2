-- =====================================================================
-- Normalización de situacion_revista a minúscula sin tilde (idempotente)
-- =====================================================================
-- La columna situacion_revista quedó con variantes legacy de casing y acento
-- ('Activo' / 'activo', 'Comisión' / 'comision', 'Retencion de Cargo' /
-- 'retencion de cargo'). El catálogo es CERRADO a 3 estados; esta normalización
-- los unifica a minúscula sin tilde para que el motor de dotación cuente una
-- sola serie por estado.
--
-- Vive en DOS tablas: ocupaciones y padron_historico (ambas se consultan por el
-- motor unificado). Se normalizan las dos.
--
-- Usa translate() para quitar tildes (á é í ó ú) en vez de depender de la
-- extensión unaccent, así es idempotente aunque unaccent no esté instalada.
--
-- Lo corre el USUARIO en Neon, ANTES de scripts/backfill_kpis_dotacion.sql.
-- El agente NO ejecuta SQL. Idempotente: correrlo dos veces no cambia nada tras
-- la primera pasada (el WHERE solo toca filas que difieren del normalizado).
-- =====================================================================

BEGIN;

-- ── 1. ANTES: variantes crudas por tabla (control visual) ──────────────────
SELECT 'ocupaciones' AS tabla,
       situacion_revista AS crudo,
       lower(translate(trim(situacion_revista), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) AS normalizado,
       count(*) AS filas
FROM ocupaciones
GROUP BY 1, 2, 3
ORDER BY 3, 4 DESC;

SELECT 'padron_historico' AS tabla,
       situacion_revista AS crudo,
       lower(translate(trim(situacion_revista), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) AS normalizado,
       count(*) AS filas
FROM padron_historico
GROUP BY 1, 2, 3
ORDER BY 3, 4 DESC;

-- ── 2. UPDATE idempotente (solo toca filas que cambian) ────────────────────
UPDATE ocupaciones
SET situacion_revista = lower(translate(trim(situacion_revista), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
WHERE situacion_revista IS NOT NULL
  AND situacion_revista <> lower(translate(trim(situacion_revista), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'));

UPDATE padron_historico
SET situacion_revista = lower(translate(trim(situacion_revista), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
WHERE situacion_revista IS NOT NULL
  AND situacion_revista <> lower(translate(trim(situacion_revista), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'));

-- ── 3. DESPUÉS: debe quedar solo {activo, comision, retencion de cargo} ─────
--       (+ eventual valor inesperado, que se conserva tal cual y se reporta).
SELECT 'ocupaciones' AS tabla, situacion_revista, count(*) AS filas
FROM ocupaciones
GROUP BY 1, 2
ORDER BY 3 DESC;

SELECT 'padron_historico' AS tabla, situacion_revista, count(*) AS filas
FROM padron_historico
GROUP BY 1, 2
ORDER BY 3 DESC;

-- Revisar los SELECT de arriba antes de confirmar. Si todo está correcto:
COMMIT;
-- (o ROLLBACK; para descartar.)
