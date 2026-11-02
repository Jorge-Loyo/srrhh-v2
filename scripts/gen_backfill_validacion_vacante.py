#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador del backfill de BAJAS para cargos en 'validacion_vacante' (25-oct).

NO toca la base de datos al correr. Emite el andamiaje SQL (idempotente,
dry-run BEGIN/ROLLBACK por defecto) que resuelve el universo real DENTRO de
PostgreSQL contra datos vivos de Neon (cargos / ocupaciones / personas /
baja_sial_registros), igual que scripts/gen_backfill_bajas.py resuelve su
universo en SQL y no en Python. El generador solo arma las estructuras y los
conteos de sanidad; el cruce real lo hace el .sql en Neon.

Salidas (en la carpeta --out, por defecto junto al script):
  - backfill_validacion_vacante.sql              (SQL idempotente que corre Jorge en Neon)
  - backfill_validacion_vacante_exclusiones.csv  (archivo de exclusiones: headers + reporte)

El cruce baja<->cargo es por `cargos.id_sial = baja_sial_registros.cargo`
(igualdad de string, formato 'legajo-rol' corto ej '001699643-2'), NUNCA por
CUIL. El CUIL solo resuelve/valida la persona (se normaliza con
regexp_replace(cuil,'[^0-9]','','g') porque SIAL trae guiones y personas no).

Diseno: .agents/tasks/backfill-validacion-vacante/PLAN.md (Seccion B, §B.3,
§B.4, §B.6, §B.8, §E.3).

Uso (el script vive en scripts/, pero la salida va a una carpeta que NO se
versiona — los .sql/.csv derivan de datos reales, ver .gitignore):
    python scripts/gen_backfill_validacion_vacante.py \
        --out "Doc/Referencias/Concursos"

Si se corre sin flags, --dir/--out default a la carpeta del propio script.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys

# La fecha del padron cuyos cargos se cierran (los ~2.298 del 25-oct). NO los
# 522 legacy (estado_desde NULL) ni los 85 del 28-oct. §B.1.
FECHA_PADRON = "2026-10-25"

# Tipificador que marca las bajas creadas por este backfill (identificables
# para reversion logica / conteos). §B.3, §E.3.
TIPIFICADOR_ORIGEN = "SIAL"


# ---------------------------------------------------------------------------
# SQL generado. El universo real se resuelve en PostgreSQL (datos vivos de
# Neon); este modulo solo arma el andamiaje. Idempotente + dry-run por defecto.
# ---------------------------------------------------------------------------

SQL_HEADER = """-- =====================================================================
-- MANUAL: lo corre Jorge en Neon.
-- =====================================================================
-- Backfill de BAJAS para los ~2.214 cargos en 'validacion_vacante' del {fecha}.
-- Archivo GENERADO por gen_backfill_validacion_vacante.py (NO editar a mano).
-- NO toca la DB al generarse: el cruce real se resuelve en este .sql dentro de
-- PostgreSQL contra datos vivos de Neon.
--
-- MODO DE USO:
--   1) DRY-RUN (por defecto): dejar 'ROLLBACK;' activo al final. No escribe nada,
--      solo imprime el bloque de CONTEOS de sanidad para revisar.
--   2) APLICAR: comentar 'ROLLBACK;' y descomentar 'COMMIT;' al final; re-ejecutar.
--
-- Idempotente: re-ejecutable sin duplicar. Dedupe de bajas por cargo_id
-- (WHERE NOT EXISTS); UPDATE de cargos solo si siguen en 'validacion_vacante'.
--
-- Cruce baja<->cargo: cargos.id_sial = baja_sial_registros.cargo (IGUALDAD DE
-- STRING, formato 'legajo-rol' corto). NUNCA por CUIL. El CUIL solo resuelve la
-- persona (normalizado con regexp_replace(cuil,'[^0-9]','','g')).
--
-- Antes de aplicar, verificar el nombre del tipo enum en Neon:
--   SELECT typname FROM pg_type WHERE typname ILIKE 'estadobaja';
-- (se usa el cast ::"EstadoBaja" mas abajo).
--
-- Reversion: PASO 0 llena backfill_vv_audit (tabla PERSISTENTE) con el estado
-- PREVIO de cada cargo/ocupacion tocado, para revertir exacto sin restore. §E.3.
-- =====================================================================

BEGIN;

-- =============================== PASO 0 (audit) ======================
-- Tabla de auditoria PERSISTENTE (NO temp): estado PREVIO para revertir exacto.
-- Idempotente: CREATE TABLE IF NOT EXISTS. §E.3.
CREATE TABLE IF NOT EXISTS backfill_vv_audit (
  cargo_id              uuid,
  ocupacion_id          uuid,
  persona_id            uuid,
  estado_anterior       text,
  estado_desde_anterior date,
  baja_id               uuid,
  corrida_at            timestamptz NOT NULL DEFAULT now()
);

-- =============================== PASO 1 (universo) ===================
-- _bk_universo: cargos en validacion_vacante del padron {fecha}, id_sial NOT NULL.
-- La ocupacion mas reciente (ocupacion_id, persona_id) y el cuil del ocupante.
-- (~2.298 filas esperadas.)
CREATE TEMP TABLE _bk_universo ON COMMIT DROP AS
SELECT c.id              AS cargo_id,
       c.id_sial         AS id_sial,
       c.hospital_id     AS hospital_id,
       o.id              AS ocupacion_id,
       o.persona_id      AS persona_id,
       p.cuil            AS cuil_ocupante
FROM cargos c
JOIN LATERAL (
  SELECT o.id, o.persona_id
  FROM ocupaciones o
  WHERE o.cargo_id = c.id
  ORDER BY o.desde DESC NULLS LAST
  LIMIT 1
) o ON TRUE
LEFT JOIN personas p ON p.id = o.persona_id
WHERE c.estado = 'validacion_vacante'
  AND to_char(c.estado_desde, 'YYYY-MM-DD') = '{fecha}'
  AND c.id_sial IS NOT NULL;

-- =============================== PASO 2 (SIAL) =======================
-- _bk_sial: del snapshot SIAL aprobado mas reciente, la baja mas reciente por
-- id_sial (DISTINCT ON (cargo) ORDER BY cargo, cargo_hasta DESC NULLS LAST). §B.4.
CREATE TEMP TABLE _bk_sial ON COMMIT DROP AS
WITH snap AS (
  SELECT id FROM baja_sial_snapshots
  WHERE estado = 'aprobado'
  ORDER BY fecha_archivo DESC
  LIMIT 1
)
SELECT DISTINCT ON (r.cargo)
       r.cargo          AS cargo,
       r.cuil           AS cuil,
       r.ayn            AS ayn,
       r.mot_baja       AS mot_baja,
       r.doc_resp_baja  AS doc_resp_baja,
       r.cargo_hasta    AS cargo_hasta
FROM baja_sial_registros r
JOIN snap s ON s.id = r.snapshot_id
ORDER BY r.cargo, r.cargo_hasta DESC NULLS LAST;

-- --- Legajos base del universo que mapean a >1 cuil (insumo E1) --------------
CREATE TEMP TABLE _bk_legajo_multi ON COMMIT DROP AS
SELECT split_part(u.id_sial, '-', 1) AS legajo_base
FROM _bk_universo u
WHERE u.cuil_ocupante IS NOT NULL
GROUP BY split_part(u.id_sial, '-', 1)
HAVING count(DISTINCT u.cuil_ocupante) > 1;

-- --- id_sial SIAL con fechas materialmente ambiguas (insumo E3) --------------
-- >1 fila SIAL para el mismo cargo con cargo_hasta distintas Y doc_resp_baja
-- distintos. §B.6.
CREATE TEMP TABLE _bk_fecha_ambigua ON COMMIT DROP AS
WITH snap AS (
  SELECT id FROM baja_sial_snapshots
  WHERE estado = 'aprobado'
  ORDER BY fecha_archivo DESC
  LIMIT 1
)
SELECT r.cargo AS cargo
FROM baja_sial_registros r
JOIN snap s ON s.id = r.snapshot_id
WHERE r.cargo_hasta IS NOT NULL
GROUP BY r.cargo
HAVING count(DISTINCT r.cargo_hasta) > 1
   AND count(DISTINCT COALESCE(r.doc_resp_baja, '')) > 1;

-- =============================== PASO 3 (resueltos) ==================
-- _bk_resueltos: universo JOIN sial por id_sial exacto (string), EXCLUYENDO los
-- casos borde. El CUIL solo valida la persona, nunca elige el cargo. §B.6.
CREATE TEMP TABLE _bk_resueltos ON COMMIT DROP AS
SELECT u.cargo_id, u.id_sial, u.hospital_id, u.ocupacion_id, u.persona_id,
       u.cuil_ocupante,
       s.cuil         AS cuil_sial,
       s.mot_baja     AS mot_baja,
       s.doc_resp_baja AS doc_resp_baja,
       s.cargo_hasta  AS cargo_hasta
FROM _bk_universo u
JOIN _bk_sial s ON s.cargo = u.id_sial     -- id_sial exacto, NUNCA por CUIL
WHERE u.persona_id IS NOT NULL                              -- E8 PERSONA_NO_RESUELTA
  AND s.cargo_hasta IS NOT NULL                             -- FECHA_NULA (no inventar fecha)
  AND regexp_replace(u.cuil_ocupante, '[^0-9]', '', 'g')
      = regexp_replace(s.cuil, '[^0-9]', '', 'g')           -- E1 CUIL_AMBIGUO (choque)
  AND split_part(u.id_sial, '-', 1) NOT IN (SELECT legajo_base FROM _bk_legajo_multi)  -- E1 legajo con >1 cuil
  AND u.id_sial NOT IN (SELECT cargo FROM _bk_fecha_ambigua);                           -- E3 FECHA_AMBIGUA

-- =============================== PASO 4 (exclusiones) ================
-- _bk_exclusiones: universo - resueltos, con 'motivo'. Reglas del §B.6.
-- El primer motivo que aplica (en orden) es el que se reporta.
CREATE TEMP TABLE _bk_exclusiones ON COMMIT DROP AS
SELECT u.cargo_id, u.id_sial,
       CASE
         -- E4: el cargo del universo no encontro match en el snapshot SIAL
         WHEN NOT EXISTS (SELECT 1 FROM _bk_sial s WHERE s.cargo = u.id_sial)
           THEN 'E4_SIN_MATCH_ID_SIAL'
         -- E8: persona no resuelta (sin ocupante identificado)
         WHEN u.persona_id IS NULL
           THEN 'E8_PERSONA_NO_RESUELTA'
         -- FECHA_NULA: la fila SIAL elegida no trae cargo_hasta
         WHEN (SELECT s.cargo_hasta FROM _bk_sial s WHERE s.cargo = u.id_sial) IS NULL
           THEN 'FECHA_NULA'
         -- E1: choque de cuil ocupante vs cuil SIAL
         WHEN regexp_replace(u.cuil_ocupante, '[^0-9]', '', 'g')
              <> regexp_replace(
                   (SELECT s.cuil FROM _bk_sial s WHERE s.cargo = u.id_sial), '[^0-9]', '', 'g')
           THEN 'E1_CUIL_AMBIGUO'
         -- E1: el legajo base mapea a >1 cuil en el universo
         WHEN split_part(u.id_sial, '-', 1) IN (SELECT legajo_base FROM _bk_legajo_multi)
           THEN 'E1_CUIL_AMBIGUO'
         -- E3: fechas SIAL materialmente ambiguas
         WHEN u.id_sial IN (SELECT cargo FROM _bk_fecha_ambigua)
           THEN 'E3_FECHA_AMBIGUA'
         ELSE 'OTRO'
       END AS motivo
FROM _bk_universo u
WHERE NOT EXISTS (SELECT 1 FROM _bk_resueltos r WHERE r.cargo_id = u.cargo_id);

-- =====================================================================
-- MUTACIONES (todas idempotentes). Orden: audit -> bajas -> ocupaciones ->
-- cargos -> personas.
-- =====================================================================

-- =============================== PASO 0-audit ========================
-- Guardar el estado PREVIO de cada cargo/ocupacion a tocar, ANTES de mutar.
-- Idempotente: solo inserta las corridas que aun no esten registradas. §E.3.
INSERT INTO backfill_vv_audit (cargo_id, ocupacion_id, persona_id, estado_anterior, estado_desde_anterior)
SELECT r.cargo_id, r.ocupacion_id, r.persona_id, c.estado::text, c.estado_desde
FROM _bk_resueltos r
JOIN cargos c ON c.id = r.cargo_id
WHERE NOT EXISTS (
  SELECT 1 FROM backfill_vv_audit a WHERE a.cargo_id = r.cargo_id
);

-- =============================== PASO 1 (INSERT bajas) ===============
-- Imita los campos de createBajaService / importarBajasCsvService. Campos NOT
-- NULL de la tabla bajas: cargo_id, hospital_id, fecha_baja, genera_concurso,
-- estado, created_at, updated_at. §B.3.
-- E5 idempotencia: WHERE NOT EXISTS (baja previa por cargo_id).
INSERT INTO bajas (
  id, cargo_id, hospital_id, persona_id, fecha_baja, motivo, ee_baja,
  tipificador_origen, genera_concurso, estado, created_at, updated_at
)
SELECT gen_random_uuid(),
       r.cargo_id,
       r.hospital_id,
       r.persona_id,
       r.cargo_hasta                 AS fecha_baja,
       r.mot_baja                    AS motivo,
       r.doc_resp_baja               AS ee_baja,
       '{tipificador}'               AS tipificador_origen,
       false                         AS genera_concurso,
       'confirmada'::"EstadoBaja"    AS estado,
       now(), now()
FROM _bk_resueltos r
WHERE NOT EXISTS (
  SELECT 1 FROM bajas b WHERE b.cargo_id = r.cargo_id
);

-- Completar backfill_vv_audit.baja_id con la baja recien creada (para reversion).
UPDATE backfill_vv_audit a
SET baja_id = b.id
FROM bajas b
WHERE a.cargo_id = b.cargo_id
  AND a.baja_id IS NULL
  AND b.tipificador_origen = '{tipificador}';

-- =============================== PASO 2 (UPDATE ocupaciones) =========
-- Cerrar la ocupacion viva del cargo con su cargo_hasta real. Idempotente:
-- solo si hasta IS NULL.
UPDATE ocupaciones o
SET hasta = r.cargo_hasta
FROM _bk_resueltos r
WHERE o.id = r.ocupacion_id
  AND o.hasta IS NULL;

-- =============================== PASO 3 (UPDATE cargos) ==============
-- Cierre definitivo del cargo. E6 idempotencia: solo si sigue en
-- validacion_vacante.
UPDATE cargos c
SET estado = 'no_vigente',
    estado_desde = r.cargo_hasta
FROM _bk_resueltos r
WHERE c.id = r.cargo_id
  AND c.estado = 'validacion_vacante';

-- =============================== PASO 4 (UPDATE personas) ============
-- Inactivar la persona SOLO si no le queda otra ocupacion vigente en otro
-- cargo. E7: no inactivar si tiene otro cargo vigente.
UPDATE personas pe
SET activo = false
WHERE pe.id IN (SELECT persona_id FROM _bk_resueltos WHERE persona_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM ocupaciones o2
    JOIN _bk_resueltos r ON r.persona_id = pe.id
    WHERE o2.persona_id = pe.id
      AND o2.hasta IS NULL
      AND o2.cargo_id <> r.cargo_id
  );

-- =============================== CONTEOS DE SANIDAD ==================
-- Se imprimen en dry-run y en commit (leen el estado YA aplicado en la tx).
SELECT 'universo_total'       AS metrica, (SELECT count(*) FROM _bk_universo)                         AS valor
UNION ALL SELECT 'resueltos',              (SELECT count(*) FROM _bk_resueltos)
UNION ALL SELECT 'excluidos_total',        (SELECT count(*) FROM _bk_exclusiones)
UNION ALL SELECT 'excl_E1_CUIL_AMBIGUO',   (SELECT count(*) FROM _bk_exclusiones WHERE motivo = 'E1_CUIL_AMBIGUO')
UNION ALL SELECT 'excl_E3_FECHA_AMBIGUA',  (SELECT count(*) FROM _bk_exclusiones WHERE motivo = 'E3_FECHA_AMBIGUA')
UNION ALL SELECT 'excl_E4_SIN_MATCH',      (SELECT count(*) FROM _bk_exclusiones WHERE motivo = 'E4_SIN_MATCH_ID_SIAL')
UNION ALL SELECT 'excl_E8_PERSONA_NO_RES', (SELECT count(*) FROM _bk_exclusiones WHERE motivo = 'E8_PERSONA_NO_RESUELTA')
UNION ALL SELECT 'excl_FECHA_NULA',        (SELECT count(*) FROM _bk_exclusiones WHERE motivo = 'FECHA_NULA')
UNION ALL SELECT 'bajas_a_crear',          (SELECT count(*) FROM bajas WHERE tipificador_origen = '{tipificador}')
UNION ALL SELECT 'cargos_a_cerrar',        (SELECT count(*) FROM cargos c JOIN _bk_resueltos r ON r.cargo_id = c.id WHERE c.estado = 'no_vigente')
UNION ALL SELECT 'personas_a_inactivar',   (SELECT count(*) FROM personas pe WHERE pe.activo = false AND pe.id IN (SELECT persona_id FROM _bk_resueltos WHERE persona_id IS NOT NULL))
ORDER BY metrica;

-- --- REPORTE de exclusiones (exportar a CSV: backfill_validacion_vacante_exclusiones.csv) ---
SELECT e.cargo_id, e.id_sial, e.motivo
FROM _bk_exclusiones e
ORDER BY e.motivo, e.id_sial;

-- =====================================================================
-- DRY-RUN: dejar ROLLBACK (no escribe). APLICAR: comentar ROLLBACK y
-- descomentar COMMIT, luego re-ejecutar el archivo entero.
ROLLBACK;
-- COMMIT;
"""


# ---------------------------------------------------------------------------
# Emision del .sql y del CSV de exclusiones
# ---------------------------------------------------------------------------


def emitir_sql(out_path):
    """Escribe el .sql generado. El universo real lo resuelve Neon."""
    contenido = SQL_HEADER.format(fecha=FECHA_PADRON, tipificador=TIPIFICADOR_ORIGEN)
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(contenido)


def emitir_exclusiones(out_path):
    """Escribe el CSV de exclusiones con headers.

    Las filas las produce el bloque REPORTE del .sql al correr en Neon (el cruce
    es SQL, no Python). Aqui se emite el archivo con sus headers para que el
    operador lo complete con el export del dry-run.
    """
    campos = ["cargo_id", "id_sial", "motivo"]
    with open(out_path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv=None):
    aqui = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(
        description="Generador de backfill de bajas para validacion_vacante (25-oct)"
    )
    parser.add_argument("--dir", default=aqui, help="carpeta de insumos (no se usa: el cruce es SQL)")
    parser.add_argument("--out", default=aqui, help="carpeta de salida")
    args = parser.parse_args(argv)

    sql_out = os.path.join(args.out, "backfill_validacion_vacante.sql")
    excl_out = os.path.join(args.out, "backfill_validacion_vacante_exclusiones.csv")

    emitir_sql(sql_out)
    emitir_exclusiones(excl_out)

    print("== Backfill validacion_vacante (%s) -- generacion (sin tocar la DB) ==" % FECHA_PADRON)
    print("")
    print("El .sql resuelve el universo real DENTRO de PostgreSQL (datos vivos de Neon):")
    print("  cruce cargos.id_sial = baja_sial_registros.cargo (string, NUNCA por CUIL).")
    print("")
    print("Salidas:")
    print("  SQL:          %s" % sql_out)
    print("  Exclusiones:  %s" % excl_out)
    print("")
    print("Jorge lo corre en Neon: primero DRY-RUN (ROLLBACK), luego COMMIT.")
    print("Este generador NO toco la base de datos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
