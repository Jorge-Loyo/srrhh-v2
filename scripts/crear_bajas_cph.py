#!/usr/bin/env python3
"""
Crea un registro de `bajas` por cada concurso CPH importado (origen=
'import_csv_2026-10-08') y vincula concurso.baja_id. Con eso las bajas aparecen
en /cargos/alta-por-baja y la columna "Respaldatoria" pasa de "Cobertura/Sin
doc." a "Baja + expediente" (SIN tocar codigo: respaldatoria() ya clasifica como
Baja cuando baja_id != null).

Por defecto DRY-RUN. --commit ejecuta en transaccion. --neon apunta a Neon
(requiere NEON_DIRECT en el entorno).

Mapeo (validado con Jorge):
  cargoId/hospitalId <- del concurso (ya resueltos alli)
  personaId          <- del concurso
  fechaBaja          <- CSV fecha_de_baja_ampliacion
  motivo             <- CSV motivo_de_baja (minuscula)
  tipificadorOrigen  <- 'alta por baja' (todas son baja real; Origen del form)
  eeBaja             <- CSV ex_baja_ampliacion (minuscula)
  partidaPresupuestaria <- CSV partida_presupuestaria (null si falta)
  docRespaldatoria   <- CSV doc_respaldatoria_de_baja (minuscula, null si falta)
  fechaPaseParalelo  <- CSV fecha_pase_paralelo_envio_a_gt (null si falta)
  cargaHoraria       <- CSV carga_horaria_de_baja (int, null si falta)
  generaConcurso     <- CSV genera_concurso (default true)
  estado             <- 'confirmada' (ya derivo en concurso activo)
  registradoPorId    <- null (import automatico)
  concurso.baja_id   <- la baja creada

REVERTIR:
  DELETE FROM etiquetas_baja WHERE baja_id IN (SELECT baja_id FROM concursos WHERE origen='import_csv_2026-10-08');
  UPDATE concursos SET baja_id=NULL WHERE origen='import_csv_2026-10-08';
  DELETE FROM bajas WHERE id NOT IN (SELECT baja_id FROM concursos WHERE baja_id IS NOT NULL)
    -- o mas seguro: guardar los ids creados. Ver nota: las bajas del import son
    -- las que estaban vinculadas a un concurso con ese origen.
"""
import csv
import os
import re
import subprocess
import sys
import unicodedata
import uuid
from collections import Counter
from pathlib import Path

REPO = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy'
NEON_DIRECT = os.environ.get('NEON_DIRECT', '')
B = Path('/mnt/c/Desarrollo/SRH/Seguimientos-Alexis/output')
CSV_BAJAS = B / 'bajas_cph_limpio_2026-10-08.csv'
ORIGEN_CONCURSO = 'import_csv_2026-10-08'
TIPIFICADOR = 'alta por baja'

COMMIT = '--commit' in sys.argv
NEON = '--neon' in sys.argv


def norm(s):
    s = (s or '').strip()
    out = [c for c in unicodedata.normalize('NFD', s)
           if not (unicodedata.category(c) == 'Mn' and c != '\u0303')]
    return ' '.join(unicodedata.normalize('NFC', ''.join(out)).lower().split())


def psql(sql, neon=False):
    if neon:
        inner = f"psql '{NEON_DIRECT}' -t -A -c \"{sql}\""
        cmd = ['docker', 'compose', 'exec', '-T', 'postgres', 'sh', '-c', inner]
    else:
        cmd = ['docker', 'compose', 'exec', '-T', 'postgres', 'psql', '-U', 'srrhh_user',
               '-d', 'srrhh_db', '-t', '-A', '-c', sql]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return [l for l in r.stdout.splitlines() if l.strip()]


def q(v):
    if v is None or v == '':
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def main():
    neon = NEON
    print(f"Base objetivo: {'NEON' if neon else 'LOCAL'} | modo: {'COMMIT' if COMMIT else 'DRY-RUN'}")
    if neon and not NEON_DIRECT:
        print("ERROR: --neon requiere NEON_DIRECT exportado."); sys.exit(1)

    # concursos importados: id, cargo_id, hospital_id, persona_id, id_sial del cargo
    filas = psql(
        "SELECT c.id||'~'||c.cargo_id||'~'||c.hospital_id||'~'||COALESCE(c.persona_id::text,'')"
        "||'~'||COALESCE(ca.id_sial,'') "
        "FROM concursos c JOIN cargos ca ON ca.id=c.cargo_id "
        f"WHERE c.origen='{ORIGEN_CONCURSO}';", neon)
    concursos = []
    for r in filas:
        cid, cargo_id, hosp_id, pers_id, id_sial = r.split('~')
        concursos.append({'concurso_id': cid, 'cargo_id': cargo_id, 'hospital_id': hosp_id,
                          'persona_id': pers_id or None, 'id_sial': id_sial})
    print(f"Concursos importados encontrados: {len(concursos)}")

    # ya con baja? (idempotencia)
    con_baja = set(psql(
        f"SELECT c.id FROM concursos c WHERE c.origen='{ORIGEN_CONCURSO}' AND c.baja_id IS NOT NULL;", neon))
    if con_baja:
        print(f"  (ya tienen baja_id: {len(con_baja)} — se saltan)")

    # CSV indexado por cargo (id_sial)
    with open(CSV_BAJAS, encoding='utf-8-sig', newline='') as f:
        csv_por_cargo = {}
        for r in csv.DictReader(f):
            if (r.get('estado_concurso') or '').strip() != 'ACTIVO':
                continue
            cg = (r.get('cargo') or '').strip()
            if not cg:
                continue
            fa = (r.get('fecha_de_baja_ampliacion') or '').strip()
            prev = csv_por_cargo.get(cg)
            # dedup: fila de baja mas reciente (igual criterio que el import de concursos)
            if prev is None or fa > (prev.get('fecha_de_baja_ampliacion') or '').strip():
                csv_por_cargo[cg] = r

    inserts = []
    sin_csv = []
    for c in concursos:
        if c['concurso_id'] in con_baja:
            continue
        row = csv_por_cargo.get(c['id_sial'])
        if not row:
            sin_csv.append(c['id_sial']); continue
        baja_id = str(uuid.uuid4())
        fecha = (row.get('fecha_de_baja_ampliacion') or '').strip()
        ch = (row.get('carga_horaria_de_baja') or '').strip()
        carga = ch if ch.isdigit() else None
        gc = (row.get('genera_concurso') or '').strip().lower()
        genera = 'false' if gc == 'false' else 'true'  # default true
        fpp = (row.get('fecha_pase_paralelo_envio_a_gt') or '').strip()

        baja_sql = (
            f"INSERT INTO bajas (id,cargo_id,hospital_id,persona_id,fecha_baja,motivo,"
            f"tipificador_origen,ee_baja,partida_presupuestaria,doc_respaldatoria,"
            f"fecha_pase_paralelo,carga_horaria,genera_concurso,estado,created_at,updated_at) VALUES ("
            f"{q(baja_id)},{q(c['cargo_id'])},{q(c['hospital_id'])},{q(c['persona_id'])},"
            f"{q(fecha or None)},{q(norm(row.get('motivo_de_baja')))},{q(TIPIFICADOR)},"
            f"{q(norm(row.get('ex_baja_ampliacion')))},{q(norm(row.get('partida_presupuestaria')) or None)},"
            f"{q(norm(row.get('doc_respaldatoria_de_baja')) or None)},{q(fpp or None)},"
            f"{carga if carga else 'NULL'},{genera},'confirmada',now(),now());"
        )
        link_sql = f"UPDATE concursos SET baja_id={q(baja_id)} WHERE id={q(c['concurso_id'])};"
        inserts.append((c['id_sial'], baja_sql, link_sql))

    print(f"\nBajas a crear: {len(inserts)}  |  concursos sin fila CSV: {len(sin_csv)}")
    if sin_csv:
        print(f"  sin_csv (muestra): {sin_csv[:5]}")
    if inserts:
        print("\n── SQL de la PRIMERA baja (ejemplo) ──")
        print(inserts[0][1])
        print(inserts[0][2])

    if not COMMIT:
        print("\nDRY-RUN: no se escribio nada. Agregá --commit para ejecutar.")
        return

    sql = "BEGIN;\n" + "\n".join(b + "\n" + l for _, b, l in inserts) + "\nCOMMIT;\n"
    tmp = Path('/tmp/crear_bajas_cph.sql'); tmp.write_text(sql, encoding='utf-8')
    subprocess.run(['docker', 'compose', 'cp', str(tmp), 'postgres:/tmp/crear_bajas_cph.sql'], cwd=REPO, check=True)
    if neon:
        inner = f"psql '{NEON_DIRECT}' -v ON_ERROR_STOP=1 -f /tmp/crear_bajas_cph.sql"
        cmd = ['docker', 'compose', 'exec', '-T', 'postgres', 'sh', '-c', inner]
    else:
        cmd = ['docker', 'compose', 'exec', '-T', 'postgres', 'psql', '-U', 'srrhh_user',
               '-d', 'srrhh_db', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/crear_bajas_cph.sql']
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    print(r.stdout[-1500:]); print(r.stderr[-1500:])
    print("EXITO" if r.returncode == 0 else f"FALLO (exit {r.returncode}) — ROLLBACK automatico")


if __name__ == '__main__':
    main()
