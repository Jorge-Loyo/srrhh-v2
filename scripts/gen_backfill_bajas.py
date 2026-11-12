#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador del backfill de VINCULACION DE BAJAS para concursos CPH.

NO toca la base de datos. Lee los 6 CSV `CONTABILIZACION CARGOS - *.csv`,
arma el mapa EE(normalizado) -> {CUIL, nombre, fecha, motivo, doc} y emite:

  - backfill_bajas.sql                    (SQL idempotente que corre Jorge en Neon)
  - backfill_bajas_cuil_invalidos.csv     (pares CSV descartados: CUIL invalido / EE ambiguo / etc.)

El cruce real contra `concursos_cph` lo hace el .sql dentro de PostgreSQL; este
generador solo conoce el lado CSV. Diseno: .agents/tasks/vinculacion-baja-concurso/DESIGN_backfill.md

Uso (el script vive en scripts/, pero los CSV y la salida van en
Doc/Referencias/Concursos/ — que NO se versiona, ver .gitignore):
    python scripts/gen_backfill_bajas.py \
        --dir "Doc/Referencias/Concursos" \
        --out "Doc/Referencias/Concursos"

Si se corre sin flags, --dir/--out default a la carpeta del propio script.

El generador aborta (exit != 0) si falta un archivo o no encuentra una columna
esperada: NO emite un .sql parcial que podria correrse por error.
"""

from __future__ import annotations

import argparse
import csv
import glob
import os
import re
import sys

# ---------------------------------------------------------------------------
# 1. Normalizacion del expediente (EE) -- debe igualar pg_temp.norm_ee del SQL
# ---------------------------------------------------------------------------

_EE_RE = re.compile(r"^(?:EX|EE)[-\s]*([0-9]{4})[-\s]*([0-9]+)")


def norm_ee(raw):
    """EX-2023-00449288- -GCABA-HBR -> EX-2023-449288. None si no matchea.

    Pasos (identicos al SQL, DESIGN 3.2):
      1. trim + upper
      2. prefijo EX|EE, extraer anio (4 dig) y numero; descartar sufijo
      3. quitar ceros a la izquierda del numero (int())
      4. clave = 'EX-' + anio + '-' + numero (siempre prefijo EX)
    """
    if raw is None:
        return None
    s = str(raw).strip().upper()
    m = _EE_RE.match(s)
    if not m:
        return None
    anio, numero = m.group(1), m.group(2)
    numero = str(int(numero))  # quita ceros a la izquierda
    return "EX-" + anio + "-" + numero


# ---------------------------------------------------------------------------
# 2. Validacion de CUIL (replica de helpers.ts normalizarCuil, DESIGN 5)
# ---------------------------------------------------------------------------

_MULT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]


def validar_cuil(v):
    """Devuelve el CUIL de 11 digitos valido, o None si invalido."""
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    solo_dig = re.sub(r"\D", "", s)
    if len(solo_dig) != 11:
        return None
    prefijo = int(solo_dig[:2])
    if prefijo < 20 or prefijo > 34:
        return None
    suma = sum(int(solo_dig[i]) * _MULT[i] for i in range(10))
    verif = 11 - (suma % 11)
    if verif == 11:
        verif = 0
    if verif == 10:
        verif = 9
    if verif != int(solo_dig[10]):
        return None
    return solo_dig


# ---------------------------------------------------------------------------
# 3. Saneo de celdas y fechas (DESIGN 4.2 / 4.3)
# ---------------------------------------------------------------------------

_CENTINELAS = {"", "-", "no hallado", "nan", "false"}


def celda(v):
    """trim; centinela/vacio -> None."""
    if v is None:
        return None
    s = str(v).strip()
    if s.lower() in _CENTINELAS:
        return None
    if s.startswith("#"):  # #N/A, #VALUE!, etc.
        return None
    return s


_FECHA_RE = re.compile(r"^\s*(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})")
_ISO_RE = re.compile(r"^\s*(\d{4})-(\d{2})-(\d{2})")


def fecha_iso(v):
    """d/m/yyyy o dd/mm/yyyy (dia primero) -> 'YYYY-MM-DD'. None si no parsea."""
    s = celda(v)
    if s is None:
        return None
    m = _ISO_RE.match(s)
    if m:
        return "%s-%s-%s" % (m.group(1), m.group(2), m.group(3))
    m = _FECHA_RE.match(s)
    if not m:
        return None
    dia, mes, anio = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mes <= 12 and 1 <= dia <= 31):
        return None
    return "%04d-%02d-%02d" % (anio, mes, dia)


# ---------------------------------------------------------------------------
# 4. Deteccion de formato y mapeo de columnas por HEADER (DESIGN 4)
# ---------------------------------------------------------------------------


def _norm_header(h):
    """Normaliza un header: colapsa espacios/newlines internos y trim."""
    return re.sub(r"\s+", " ", (h or "").strip())


def _idx_de(headers_norm, nombre, ocurrencia=1):
    """Indice de la columna cuyo header normalizado == nombre.

    ocurrencia=2 toma la segunda aparicion (Formato B repite 'NOMBRE Y APELLIDO'
    y 'CUIL': el bloque de baja es la 2da). Aborta si no la encuentra.
    """
    objetivo = _norm_header(nombre)
    vistas = 0
    for i, h in enumerate(headers_norm):
        if h == objetivo:
            vistas += 1
            if vistas == ocurrencia:
                return i
    raise KeyError(
        "columna %r (ocurrencia %d) no encontrada en el header" % (nombre, ocurrencia)
    )


def detectar_formato(headers_norm):
    """'A' si contiene 'EE BAJA/ AMPLIACION'; 'B' si 'EX BAJA/AMPLIACION'."""
    hset = set(headers_norm)
    if "EE BAJA/ AMPLIACION" in hset:
        return "A"
    if "EX BAJA/AMPLIACION" in hset:
        return "B"
    raise KeyError(
        "no se reconoce el formato (falta 'EE BAJA/ AMPLIACION' y 'EX BAJA/AMPLIACION')"
    )


def columnas_formato(formato, headers_norm):
    """Devuelve dict con indices de las columnas de baja segun el formato."""
    if formato == "A":
        return {
            "ee": _idx_de(headers_norm, "EE BAJA/ AMPLIACION"),
            "cuil": _idx_de(headers_norm, "CUIL BAJA"),
            "cuil_sin_guion": None,
            "nombre": _idx_de(headers_norm, "NOMBRE BAJA"),
            "fecha": _idx_de(headers_norm, "FECHA BAJA"),
            "tipo": _idx_de(headers_norm, "TIPO DE BAJA"),
            "motivo": None,
            "doc": None,
        }
    # Formato B: el bloque de baja usa 'CUIL' (col 30, unica ocurrencia; la
    # designacion usa 'CUIL DESIGNADO') y 'NOMBRE Y APELLIDO' (2da ocurrencia;
    # la 1ra es la del bloque de designacion).
    return {
        "ee": _idx_de(headers_norm, "EX BAJA/AMPLIACION"),
        "cuil": _idx_de(headers_norm, "CUIL"),
        "cuil_sin_guion": _idx_de(headers_norm, "CUIL SIN GUION"),
        "nombre": _idx_de(headers_norm, "NOMBRE Y APELLIDO", ocurrencia=2),
        "fecha": _idx_de(headers_norm, "FECHA DE BAJA / AMPLIACION"),
        "tipo": None,
        "motivo": _idx_de(headers_norm, "MOTIVO DE BAJA"),
        "doc": _idx_de(headers_norm, "DOC RESPALDATORIA DE BAJA"),
    }


# ---------------------------------------------------------------------------
# 5. Lectura de los CSV y armado del mapa EE -> datos
# ---------------------------------------------------------------------------


def _get(fila, idx):
    if idx is None or idx >= len(fila):
        return None
    return fila[idx]


def elegir_cuil(fila, cols):
    """Regla de desempate CUIL (DESIGN 4.1). Devuelve (cuil_valido, cuil_crudo)."""
    crudo_30 = celda(_get(fila, cols["cuil"]))
    v = validar_cuil(crudo_30)
    if v is not None:
        return v, crudo_30
    crudo_40 = celda(_get(fila, cols["cuil_sin_guion"]))
    v = validar_cuil(crudo_40)
    if v is not None:
        return v, crudo_40
    # Ninguno valido: devolver el crudo con mas contenido para el reporte.
    crudo = crudo_30 or crudo_40
    return None, crudo


def construir_mapa(csv_dir):
    """Lee todos los CSV. Devuelve (mapa, invalidos, resumen_por_archivo).

    mapa:      { ee_norm: {cuil, apellido_nombre, fecha_baja, motivo, doc, tipo_baja, numero_doc} }
    invalidos: lista de dicts para backfill_bajas_cuil_invalidos.csv
    """
    patron = os.path.join(csv_dir, "CONTABILIZACION CARGOS - *.csv")
    archivos = sorted(glob.glob(patron))
    if not archivos:
        raise SystemExit("ERROR: no se encontraron CSV con patron %r" % patron)

    mapa = {}
    invalidos = []
    resumen = []

    for ruta in archivos:
        nombre_archivo = os.path.basename(ruta)
        filas_leidas = 0
        pares_validos = 0
        with open(ruta, encoding="utf-8-sig", newline="") as fh:
            reader = csv.reader(fh)
            try:
                header = next(reader)
            except StopIteration:
                raise SystemExit("ERROR: %s esta vacio" % nombre_archivo)
            headers_norm = [_norm_header(h) for h in header]
            try:
                formato = detectar_formato(headers_norm)
                cols = columnas_formato(formato, headers_norm)
            except KeyError as e:
                raise SystemExit(
                    "ERROR en %s: %s. El header cambio; abortando sin emitir SQL."
                    % (nombre_archivo, e)
                )

            for fila in reader:
                filas_leidas += 1
                ee_raw = celda(_get(fila, cols["ee"]))
                if ee_raw is None:
                    continue  # fila sin EE de baja: no aporta
                ee = norm_ee(ee_raw)
                cuil, cuil_crudo = elegir_cuil(fila, cols)
                nombre = celda(_get(fila, cols["nombre"]))

                # EE no normalizable
                if ee is None:
                    invalidos.append(
                        {
                            "archivo": nombre_archivo,
                            "ee_crudo": ee_raw,
                            "ee_normalizado": "",
                            "cuil_crudo": cuil_crudo or "",
                            "motivo_descarte": "EE_NO_NORMALIZABLE",
                        }
                    )
                    continue
                # CUIL invalido
                if cuil is None:
                    invalidos.append(
                        {
                            "archivo": nombre_archivo,
                            "ee_crudo": ee_raw,
                            "ee_normalizado": ee,
                            "cuil_crudo": cuil_crudo or "",
                            "motivo_descarte": "CUIL_INVALIDO",
                        }
                    )
                    continue
                # Sin nombre: no se puede crear persona (apellido_nombre NOT NULL)
                if nombre is None:
                    invalidos.append(
                        {
                            "archivo": nombre_archivo,
                            "ee_crudo": ee_raw,
                            "ee_normalizado": ee,
                            "cuil_crudo": cuil_crudo or "",
                            "motivo_descarte": "SIN_NOMBRE",
                        }
                    )
                    continue

                reg = {
                    "cuil": cuil,
                    "apellido_nombre": nombre,
                    "fecha_baja": fecha_iso(_get(fila, cols["fecha"])),
                    "motivo": celda(_get(fila, cols["motivo"])),
                    "doc_respaldatoria": celda(_get(fila, cols["doc"])),
                    "tipo_baja": celda(_get(fila, cols["tipo"])),
                    "numero_doc": None,  # los CSV no lo traen
                }

                if ee not in mapa:
                    mapa[ee] = reg
                    pares_validos += 1
                else:
                    prev = mapa[ee]
                    if prev["cuil"] == reg["cuil"]:
                        # Mismo CUIL: fusionar completando huecos.
                        for k in (
                            "fecha_baja",
                            "motivo",
                            "doc_respaldatoria",
                            "tipo_baja",
                            "numero_doc",
                        ):
                            if not prev.get(k) and reg.get(k):
                                prev[k] = reg[k]
                    else:
                        # CUIL distinto para el mismo EE: ambiguo -> excluir.
                        invalidos.append(
                            {
                                "archivo": nombre_archivo,
                                "ee_crudo": ee_raw,
                                "ee_normalizado": ee,
                                "cuil_crudo": "%s|%s" % (prev["cuil"], reg["cuil"]),
                                "motivo_descarte": "EE_AMBIGUO",
                            }
                        )
                        # quitar del mapa: no arriesgar persona equivocada
                        mapa.pop(ee, None)
                        pares_validos -= 1

        resumen.append((nombre_archivo, formato, filas_leidas, pares_validos))

    # Un EE que termino ambiguo pudo volver a entrar luego; aseguramos que
    # ningun ee marcado EE_AMBIGUO quede en el mapa.
    ambiguos = {r["ee_normalizado"] for r in invalidos if r["motivo_descarte"] == "EE_AMBIGUO"}
    for ee in ambiguos:
        mapa.pop(ee, None)

    return mapa, invalidos, resumen


# ---------------------------------------------------------------------------
# 6. Emision del SQL idempotente (DESIGN 6, 8, 9)
# ---------------------------------------------------------------------------


def sql_str(v):
    """Literal SQL: None -> NULL; string -> comilla simple escapada."""
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_date(v):
    return "NULL" if v is None else "DATE '%s'" % v


SQL_HEADER = """-- =====================================================================
-- MANUAL: lo corre Jorge en Neon.
-- =====================================================================
-- Backfill de VINCULACION DE BAJAS para concursos CPH.
-- Archivo GENERADO por gen_backfill_bajas.py (NO editar a mano).
-- Fuente: los 6 CSV 'CONTABILIZACION CARGOS - *.csv'. NO toca la DB al generarse.
--
-- MODO DE USO:
--   1) DRY-RUN (por defecto): dejar 'ROLLBACK;' activo al final. No escribe nada,
--      solo imprime el bloque de CONTEOS para revisar (bajas/personas/concursos/
--      CUIL invalidos/no-resueltos).
--   2) APLICAR: comentar 'ROLLBACK;' y descomentar 'COMMIT;' al final; re-ejecutar.
--
-- Idempotente: re-ejecutable sin duplicar. Dedupe por (cargo_id, ee_baja norm).
--
-- Validacion de sanidad esperada (medicion 2026-10-30):
--   universo_total ~= 725, concursos_a_vincular ~= 549, personas_a_crear ~= 157,
--   universo_no_resuelto ~= 176. Si se desvia fuerte: NO hacer COMMIT, revisar.
--
-- Antes de aplicar, verificar el nombre del tipo enum en Neon:
--   SELECT typname FROM pg_type WHERE typname ILIKE 'estadobaja';
-- (se usa el cast ::"EstadoBaja" mas abajo).
-- =====================================================================

BEGIN;

-- --- Normalizacion EE en SQL (identica a norm_ee() de Python) -----------------
CREATE OR REPLACE FUNCTION pg_temp.norm_ee(raw text) RETURNS text AS $$
  SELECT CASE
    WHEN m IS NULL THEN NULL
    ELSE 'EX-' || m[1] || '-' || (m[2])::bigint::text   -- ::bigint quita ceros a la izq
  END
  FROM (
    SELECT regexp_match(upper(btrim(raw)), '^(?:EX|EE)[-\\s]*([0-9]{4})[-\\s]*([0-9]+)') AS m
  ) s;
$$ LANGUAGE sql IMMUTABLE;

-- --- Staging: una fila por EE normalizado valido del mapa CSV -----------------
CREATE TEMP TABLE _bk_map (
  ee_norm           text PRIMARY KEY,
  cuil              varchar(11) NOT NULL,
  apellido_nombre   varchar(200) NOT NULL,
  fecha_baja        date,
  motivo            varchar(500),
  doc_respaldatoria varchar(500),
  tipo_baja         varchar(100),
  numero_doc        varchar(20)
) ON COMMIT DROP;
"""


SQL_BODY = """
-- --- Resolucion del universo (materializada para compartir entre pasos) -------
CREATE TEMP TABLE _bk_resueltos ON COMMIT DROP AS
WITH universo AS (
  SELECT cc.concurso_id, cc.cargo_id, cc.hospital_id,
         c.id AS concurso_base_id, c.fecha_vacante,
         pg_temp.norm_ee(cc.ee_baja) AS ee_norm,
         cc.ee_baja AS ee_raw
  FROM concursos_cph cc
  JOIN concursos c ON c.id = cc.concurso_id
  WHERE cc.ee_baja IS NOT NULL
    AND c.baja_id IS NULL
)
SELECT u.concurso_id, u.cargo_id, u.hospital_id, u.concurso_base_id,
       u.fecha_vacante, u.ee_norm, u.ee_raw,
       m.cuil, m.apellido_nombre, m.fecha_baja, m.motivo,
       m.doc_respaldatoria, m.tipo_baja, m.numero_doc
FROM universo u
JOIN _bk_map m ON m.ee_norm = u.ee_norm;

-- Enriquecimiento SIAL por CUIL (solo snapshot aprobado; registro mas reciente).
CREATE TEMP TABLE _bk_sial ON COMMIT DROP AS
SELECT DISTINCT ON (regexp_replace(bsr.cuil, '\\D', '', 'g'))
       regexp_replace(bsr.cuil, '\\D', '', 'g') AS cuil_norm,
       bsr.cargo_hasta, bsr.mot_baja, bsr.doc_resp_baja
FROM baja_sial_registros bsr
JOIN baja_sial_snapshots bss ON bss.id = bsr.snapshot_id AND bss.estado = 'aprobado'
ORDER BY regexp_replace(bsr.cuil, '\\D', '', 'g'), bsr.cargo_hasta DESC NULLS LAST;

-- =============================== PASO 1 ===============================
-- Upsert idempotente de Persona por CUIL (@unique). No pisa personas existentes.
INSERT INTO personas (id, cuil, apellido_nombre, activo, numero_doc, created_at, updated_at)
SELECT gen_random_uuid(), r.cuil, r.apellido_nombre, false, r.numero_doc, now(), now()
FROM (SELECT DISTINCT cuil, apellido_nombre, numero_doc FROM _bk_resueltos) r
ON CONFLICT (cuil) DO NOTHING;

-- =============================== PASO 2 ===============================
-- INSERT directo de Baja. Dedupe por (cargo_id, ee_baja normalizado).
-- genera_concurso=false, estado='confirmada', sin tocar cargo.estado.
INSERT INTO bajas (
  id, cargo_id, hospital_id, persona_id, fecha_baja, motivo, doc_respaldatoria,
  tipo_baja, ee_baja, tipificador_origen, genera_concurso, estado, created_at, updated_at
)
SELECT
  gen_random_uuid(), r.cargo_id, r.hospital_id, p.id,
  COALESCE(r.fecha_baja, s.cargo_hasta, r.fecha_vacante)  AS fecha_baja,
  COALESCE(r.motivo, s.mot_baja)                          AS motivo,
  COALESCE(r.doc_respaldatoria, s.doc_resp_baja)          AS doc_respaldatoria,
  r.tipo_baja,
  r.ee_norm                                               AS ee_baja,
  'Backfill vinculacion 725'                              AS tipificador_origen,
  false                                                   AS genera_concurso,
  'confirmada'::"EstadoBaja"                              AS estado,
  now(), now()
FROM _bk_resueltos r
JOIN personas p   ON p.cuil = r.cuil
LEFT JOIN _bk_sial s ON s.cuil_norm = r.cuil
WHERE NOT EXISTS (
  SELECT 1 FROM bajas b
  WHERE b.cargo_id = r.cargo_id
    AND pg_temp.norm_ee(b.ee_baja) = r.ee_norm
);

-- =============================== PASO 2b ==============================
-- Completar persona en baja preexistente con persona_id NULL (idempotencia).
UPDATE bajas b
SET persona_id = p.id, updated_at = now()
FROM _bk_resueltos r
JOIN personas p ON p.cuil = r.cuil
WHERE b.cargo_id = r.cargo_id
  AND pg_temp.norm_ee(b.ee_baja) = r.ee_norm
  AND b.persona_id IS NULL;

-- =============================== PASO 3 ===============================
-- Vincular concursos.baja_id (tabla base, NO concursos_cph). Idempotente.
UPDATE concursos c
SET baja_id = sub.baja_id
FROM (
  SELECT DISTINCT ON (r.concurso_base_id) r.concurso_base_id, b.id AS baja_id
  FROM _bk_resueltos r
  JOIN bajas b
    ON b.cargo_id = r.cargo_id
   AND pg_temp.norm_ee(b.ee_baja) = r.ee_norm
  ORDER BY r.concurso_base_id, b.created_at ASC, b.id ASC
) sub
WHERE c.id = sub.concurso_base_id
  AND c.baja_id IS NULL;

-- =============================== CONTEOS ==============================
-- Se imprimen igual en dry-run y en commit (leen el estado YA aplicado en la tx).
SELECT 'universo_total' AS metrica,
       (SELECT count(*) FROM concursos_cph cc JOIN concursos c ON c.id = cc.concurso_id
          WHERE cc.ee_baja IS NOT NULL
            AND (c.baja_id IS NULL OR c.id IN (SELECT concurso_base_id FROM _bk_resueltos))) AS valor
UNION ALL SELECT 'concursos_a_vincular', (SELECT count(DISTINCT concurso_base_id) FROM _bk_resueltos)
UNION ALL SELECT 'bajas_creadas',        (SELECT count(*) FROM bajas WHERE tipificador_origen = 'Backfill vinculacion 725')
UNION ALL SELECT 'personas_backfill',    (SELECT count(*) FROM personas p WHERE p.activo = false
          AND p.cuil IN (SELECT cuil FROM _bk_resueltos))
UNION ALL SELECT 'universo_no_resuelto', (SELECT count(*) FROM concursos_cph cc
          JOIN concursos c ON c.id = cc.concurso_id
          WHERE cc.ee_baja IS NOT NULL AND c.baja_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM _bk_map m WHERE m.ee_norm = pg_temp.norm_ee(cc.ee_baja)))
UNION ALL SELECT 'cuil_invalidos_descartados', %(cuil_invalidos)d
ORDER BY metrica;

-- Variante de conteo "a-crear" ANTES de aplicar: correr este bloque solo en una
-- sesion limpia (dry-run) para ver cuanto FALTA. En la tx de arriba los INSERT
-- ya corrieron, por eso 'bajas_creadas' refleja el total con el tipificador.

-- --- REPORTE RRHH: concursos del universo SIN baja resuelta (exportar a CSV) --
-- (los ~176). No se inventa ningun dato para ellos.
SELECT cc.concurso_id, cc.cargo_id, cg.codigo AS cargo_codigo, cg.id_sial,
       h.nombre AS hospital, cc.ee_baja AS ee_baja_crudo,
       pg_temp.norm_ee(cc.ee_baja) AS ee_baja_norm
FROM concursos_cph cc
JOIN concursos c ON c.id = cc.concurso_id
JOIN cargos cg   ON cg.id = cc.cargo_id
JOIN hospitales h ON h.id = cc.hospital_id
WHERE cc.ee_baja IS NOT NULL AND c.baja_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM _bk_map m WHERE m.ee_norm = pg_temp.norm_ee(cc.ee_baja))
ORDER BY h.nombre, cc.ee_baja;

-- =====================================================================
-- DRY-RUN: dejar ROLLBACK (no escribe). APLICAR: comentar ROLLBACK y
-- descomentar COMMIT, luego re-ejecutar el archivo entero.
ROLLBACK;
-- COMMIT;
"""


def emitir_sql(mapa, n_cuil_invalidos, out_path):
    pares = sorted(mapa.items())
    lineas = [SQL_HEADER]
    if pares:
        lineas.append(
            "\nINSERT INTO _bk_map (ee_norm, cuil, apellido_nombre, fecha_baja, "
            "motivo, doc_respaldatoria, tipo_baja, numero_doc)\nVALUES\n"
        )
        valores = []
        for ee, r in pares:
            valores.append(
                "  (%s, %s, %s, %s, %s, %s, %s, %s)"
                % (
                    sql_str(ee),
                    sql_str(r["cuil"]),
                    sql_str(r["apellido_nombre"]),
                    sql_date(r["fecha_baja"]),
                    sql_str(r["motivo"]),
                    sql_str(r["doc_respaldatoria"]),
                    sql_str(r["tipo_baja"]),
                    sql_str(r["numero_doc"]),
                )
            )
        lineas.append(",\n".join(valores) + ";\n")
    else:
        lineas.append("\n-- (mapa vacio: no se generaron filas de staging)\n")

    lineas.append(SQL_BODY % {"cuil_invalidos": n_cuil_invalidos})

    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("".join(lineas))


# ---------------------------------------------------------------------------
# 7. Reporte de CUIL invalidos / EE descartados
# ---------------------------------------------------------------------------


def emitir_invalidos(invalidos, out_path):
    campos = ["archivo", "ee_crudo", "ee_normalizado", "cuil_crudo", "motivo_descarte"]
    with open(out_path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()
        for row in invalidos:
            w.writerow(row)


# ---------------------------------------------------------------------------
# 8. CLI
# ---------------------------------------------------------------------------


def main(argv=None):
    aqui = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Generador de backfill de bajas CPH")
    parser.add_argument("--dir", default=aqui, help="carpeta con los CSV")
    parser.add_argument("--out", default=aqui, help="carpeta de salida")
    args = parser.parse_args(argv)

    mapa, invalidos, resumen = construir_mapa(args.dir)

    sql_out = os.path.join(args.out, "backfill_bajas.sql")
    inval_out = os.path.join(args.out, "backfill_bajas_cuil_invalidos.csv")

    n_amb = sum(1 for r in invalidos if r["motivo_descarte"] == "EE_AMBIGUO")
    n_cuil = sum(1 for r in invalidos if r["motivo_descarte"] == "CUIL_INVALIDO")
    n_ee = sum(1 for r in invalidos if r["motivo_descarte"] == "EE_NO_NORMALIZABLE")
    n_sn = sum(1 for r in invalidos if r["motivo_descarte"] == "SIN_NOMBRE")

    # El contador del SQL cuenta solo CUIL invalidos (lo que pide el brief);
    # el CSV de reporte conserva todas las categorias de descarte.
    emitir_sql(mapa, n_cuil, sql_out)
    emitir_invalidos(invalidos, inval_out)

    # Resumen a stdout.
    print("== Backfill de bajas CPH -- generacion (sin tocar la DB) ==")
    print("Archivos CSV leidos:")
    for nombre, formato, filas, pares in resumen:
        print("  %-45s formato %s  filas=%-5d pares_validos=%d" % (nombre, formato, filas, pares))
    print("")
    print("Mapa EE->CUIL (filas de staging en el SQL): %d" % len(mapa))
    print("Descartes (-> backfill_bajas_cuil_invalidos.csv): %d" % len(invalidos))
    print("  CUIL_INVALIDO=%d  EE_AMBIGUO=%d  EE_NO_NORMALIZABLE=%d  SIN_NOMBRE=%d"
          % (n_cuil, n_amb, n_ee, n_sn))
    print("")
    print("Salidas:")
    print("  SQL:               %s" % sql_out)
    print("  CUIL invalidos:    %s" % inval_out)
    print("")
    print("El .sql resuelve el universo real (725/549/176) DENTRO de PostgreSQL.")
    print("Jorge lo corre en Neon: primero DRY-RUN (ROLLBACK), luego COMMIT.")
    print("Este generador NO toco la base de datos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
