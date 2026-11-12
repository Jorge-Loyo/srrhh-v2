#!/usr/bin/env python3
"""Preprocesa el Excel "Mapeo de Cargos - MSGC.xlsx" a un CSV neutro SIN datos personales.

SOLO LECTURA. Lee la hoja 'NOMINAL DE CARGOS' (encabezados en la fila 2, datos desde la 3)
y emite:
  - nominal_<corte>.csv : lista blanca de columnas (ver COLUMNAS).
  - meta.json           : corte, filas, sha256 del xlsx, version_equivalencias.

Garantias por construccion (datos personales):
  - iter_rows(max_col=28) lee hasta la columna AB: la columna AC (nombres, "control") NUNCA se toca.
  - La columna M ("CUIL / Expediente") se lee, pero solo se conserva el valor si cumple
    ^EX-\\d{4}- (expediente); cualquier otro valor (CUIL) se descarta en memoria y no se escribe.
  - Se aborta si falta o cambia de lugar un encabezado esperado, si hay un encabezado
    desconocido dentro de las 28 columnas, o si 'Codigo de Cargo' esta vacio o repetido.

El CSV contiene `id_sial_rol` (clave de cruce): vive FUERA del repo/worktree y se borra al terminar.

Uso:
  python preprocesar_excel.py --xlsx "<ruta.xlsx>" [--out <dir>] [--corte AAAA-MM-DD]
"""
import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

import openpyxl

# Debe coincidir con VERSION_EQUIVALENCIAS de equivalencias.ts (lo verifica un test).
VERSION_EQUIVALENCIAS = "2026-11-msgc-1"

HOJA = "NOMINAL DE CARGOS"
FILA_ENCABEZADO = 2
MAX_COL = 28  # A..AB. La columna AC (29) no se lee.

# (indice 0-based, encabezado esperado normalizado, nombre en el CSV o None si no se emite)
COLUMNAS = [
    (0, "Codigo de Cargo", "codigo_excel"),
    (1, "Codigo de Registro", "cr"),
    (2, "Carrera", None),
    (3, "Sigla", "sigla"),
    (4, "Nombre del cargo", None),
    (5, "Tipo", "tipo"),
    (6, "Planta / Guardia (CPH)", "planta_guardia"),
    (7, "Estado", "estado"),
    (8, "Situacion", "situacion"),
    (9, "Literal Puesto", "literal_puesto"),
    (10, "Reparticion", None),
    (11, "Sigla", None),  # segunda "Sigla " (col L), no se emite
    (12, "CUIL / Expediente", "expediente"),
    (13, "ID SIAL Rol", "id_sial_rol"),
    (14, "Situacion de revista del ocupante", "situacion_revista"),
    (15, "Especialidad del ocupante", None),
    (16, "Acronimo", "acronimo"),
    (17, "Bloque", "bloque"),
    (18, "Especialidad del cargo", "especialidad_cargo"),
    (19, "Nivel conduccion", "nivel_conduccion"),
    (20, "Unidad arbol (COD_REP)", "cod_rep"),
    (21, "Detalle", "detalle"),
    (22, "Fuente", None),
    (23, "Suma en total", None),
    (24, "Observacion POU", None),
    (25, "Archivo fuente (solapa)", None),
    (26, "Universo", None),
    (27, "Linea POU", "linea_pou"),
]

CAMPOS_CSV = [c[2] for c in COLUMNAS if c[2]]
RE_EXPEDIENTE = re.compile(r"^EX-\d{4}-")


def sin_acentos(s: str) -> str:
    tabla = str.maketrans("áéíóúÁÉÍÓÚñÑ", "aeiouAEIOUnN")
    return s.translate(tabla)


def norm_enc(v) -> str:
    return re.sub(r"\s+", " ", sin_acentos(str(v or "")).strip())


def texto(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def sha256_archivo(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--xlsx", required=True, help="Ruta del Excel MSGC")
    ap.add_argument("--out", default=None, help="Directorio de salida (fuera del repo)")
    ap.add_argument("--corte", default=None, help="Fecha del corte AAAA-MM-DD (por defecto, hoy)")
    args = ap.parse_args()

    xlsx = Path(args.xlsx)
    if not xlsx.is_file():
        print(f"ERROR: no existe {xlsx}", file=sys.stderr)
        return 2
    corte = args.corte or date.today().isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", corte):
        print("ERROR: --corte debe ser AAAA-MM-DD", file=sys.stderr)
        return 2
    out = Path(args.out) if args.out else xlsx.resolve().parents[2] / ".agents" / "tasks" / "sync-cargos-msgc" / "runtime"
    out.mkdir(parents=True, exist_ok=True)

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    if HOJA not in wb.sheetnames:
        print(f"ERROR: falta la hoja '{HOJA}'", file=sys.stderr)
        return 3
    ws = wb[HOJA]

    filas = ws.iter_rows(min_row=FILA_ENCABEZADO, max_col=MAX_COL, values_only=True)
    encabezado = next(filas)
    if len(encabezado) < MAX_COL:
        print(f"ERROR: el encabezado tiene {len(encabezado)} columnas, se esperaban {MAX_COL}", file=sys.stderr)
        return 3
    for idx, esperado, _ in COLUMNAS:
        real = norm_enc(encabezado[idx])
        if real != esperado:
            print(f"ERROR: columna {idx + 1}: encabezado '{real}' != esperado '{esperado}'", file=sys.stderr)
            return 3

    destino = out / f"nominal_{corte}.csv"
    vistos = set()
    n = 0
    n_exp = 0
    with destino.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(CAMPOS_CSV)
        for fila in filas:
            codigo = texto(fila[0])
            if not codigo:
                # Fila totalmente vacia al final de la hoja: se ignora; con datos en otras columnas, es error.
                if any(texto(v) for v in fila):
                    print(f"ERROR: fila {n + 3} sin 'Codigo de Cargo'", file=sys.stderr)
                    return 4
                continue
            if codigo in vistos:
                print(f"ERROR: 'Codigo de Cargo' repetido: {codigo}", file=sys.stderr)
                return 4
            vistos.add(codigo)
            out_fila = []
            for idx, _, nombre in COLUMNAS:
                if not nombre:
                    continue
                v = texto(fila[idx])
                if nombre == "expediente":
                    # Columna M: solo se conserva si es un expediente; el resto (CUIL) se descarta.
                    if RE_EXPEDIENTE.match(v):
                        n_exp += 1
                    else:
                        v = ""
                out_fila.append(v)
            w.writerow(out_fila)
            n += 1

    meta = {
        "corte": corte,
        "filas": n,
        "expedientes": n_exp,
        "sha256": sha256_archivo(xlsx),
        "version_equivalencias": VERSION_EQUIVALENCIAS,
        "csv": destino.name,
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OK: {n} filas ({n_exp} con expediente) -> {destino}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
