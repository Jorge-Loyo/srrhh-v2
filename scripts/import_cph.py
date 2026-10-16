#!/usr/bin/env python3
"""
Import de concursos CPH activos (bajas_cph + base_concursos) a la base.

Por defecto DRY-RUN (imprime resumen y el SQL del primer concurso, NO escribe).
Con --commit ejecuta todo en UNA transacción (todo o nada).
Con --neon usa la conexion de Neon (requiere NEON_DIRECT en el entorno del
contenedor via psql; se pasa por variable); por defecto usa la base local.

Reglas (todas validadas con Jorge):
  Universo: bajas_cph ACTIVO + cod_reg 37 + cargo existente + baja SIAL.
  Dedup: 1 por cargo, baja mas reciente.
  Descartar: baja real (no ampliacion) sin fecha.
  Efector: UPPER(sigla_efector) -> hospitales.
  Puesto: heredado del cargo (cargo.puesto_cargo_id).
  Especialidad: (0) override cargo, (1) SIAL sistema, (2) CSV mapeado,
                (3) regla por puesto. Si nada -> NULL.
  Texto en BD: minuscula sin tilde (mantiene ñ).
  Jurados / orden de merito: NO se cargan.
  origen = 'import_csv_2026-10-08' (reversible).

Uso:
  python3 scripts/import_cph.py              # dry-run (local)
  python3 scripts/import_cph.py --commit     # ejecuta en local
  python3 scripts/import_cph.py --commit --neon   # ejecuta en Neon
    (--neon requiere exportar NEON_DIRECT con la URL directa de Neon:
       NEON_URL=$(grep 'neon.tech' apps/api/.env | sed -E 's/^#\\s*//; s/^DATABASE_URL=//; s/^"//; s/"$//')
       export NEON_DIRECT=$(echo "$NEON_URL" | sed -E 's/-pooler//; s/:6432/:5432/; s/[?&]channel_binding=require//'))

Primera corrida: 2026-10-08. Resultado: 584 concursos importados (local + Neon),
2 descartados (baja real sin fecha), 564 con FK de especialidad resuelta.

REVERTIR (borra solo lo que creo este import, por el marcador `origen`):
  DELETE FROM concursos_cph WHERE concurso_id IN
    (SELECT id FROM concursos WHERE origen='import_csv_2026-10-08');
  DELETE FROM concursos WHERE origen='import_csv_2026-10-08';

AL REUSAR PARA ACTUALIZAR (futuras cargas del seguimiento):
  - Cambiar el nombre de los CSV (B / '...') y ORIGEN a la nueva fecha.
  - Revisar las tablas de equivalencias de abajo: si el CSV nuevo trae puestos/
    especialidades que no existen en el catalogo, el dry-run los lista como NO
    RESUELTOS — hay que mapearlos (o agregarlos al catalogo) antes de --commit.
  - OJO con duplicar: si ya existen concursos del import anterior para el mismo
    cargo, decidir si se borran los viejos (REVERTIR) antes de recargar, o se
    filtran para no duplicar. Este script NO deduplica contra lo ya cargado.

Equivalencias de especialidad definidas manualmente (puesto/CSV -> catalogo del
sistema), confirmadas una por una al revisar los datos reales. Ver EQ,
ESP_FIJA_POR_PUESTO y ESP_POR_CARGO abajo.
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
ORIGEN = 'import_csv_2026-10-08'

COMMIT = '--commit' in sys.argv
NEON = '--neon' in sys.argv

# ── Reglas de especialidad (idénticas al dry-run validado) ──
EQ = {
    'bioquimica clinica (hematologia)': 'bioquimica clinica-area hematologia',
    'cardiologia (ecocardiograma)': 'cardiologia',
    'diagnostico por imagenes (ecografia)': 'diagnostico por imagenes',
    'otorrinolaringologia (orl)': 'otorrinolaringologia',
    'estomatologia': 'clinica estomatologica',
}
ESP_FIJA_POR_PUESTO = {
    'lic. en comunicacion social': 'licenciado en comunicacion social',
    'asistente social de guardia': 'asistente social',
    'asistente social de planta': 'asistente social',
    'medico veterinario de planta': 'medico veterinario',
    'bioquimico de guardia': 'bioquimica clinica',
    'psicologo de planta': 'psicologia clinica',
    'bioquimico de planta': 'bioquimica',
    'odontologo de planta': 'odontologo',
    'nutricionista de planta': 'nutricionista',
    'obstetrica de planta': 'obstetricia',
}
ESP_POR_CARGO = {
    '001626863-3': 'bioquimica clinica',
    '001056596-3': 'licenciado en ciencias de la educ.',
}
MOTIVO_AMPLIACION = 'ampliacion'


def norm(s):
    s = (s or '').strip()
    out = [c for c in unicodedata.normalize('NFD', s)
           if not (unicodedata.category(c) == 'Mn' and c != '\u0303')]
    return ' '.join(unicodedata.normalize('NFC', ''.join(out)).lower().split())


def sin_par(s):
    return re.sub(r'\s*\([^)]*\)\s*$', '', s).strip()


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
    """Literal SQL seguro: NULL o 'texto' con comillas escapadas."""
    if v is None or v == '':
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def main():
    neon = NEON
    print(f"Base objetivo: {'NEON' if neon else 'LOCAL'} | modo: {'COMMIT' if COMMIT else 'DRY-RUN'}")
    if neon and not NEON_DIRECT:
        print("ERROR: --neon requiere la variable de entorno NEON_DIRECT exportada.")
        sys.exit(1)

    # ── cargar datos de la base ──
    cargos_sial = set(psql("SELECT id_sial FROM cargos WHERE id_sial IS NOT NULL;", neon))
    cargos_baja = set(psql("SELECT DISTINCT c.id_sial FROM cargos c JOIN baja_sial_registros b ON b.cargo=c.id_sial;", neon))
    hospitales = {r.split('|')[1]: r.split('|')[0] for r in
                  psql("SELECT id||'|'||sigla FROM hospitales;", neon)}
    cargo_row = {}  # id_sial -> (cargo_id, hospital_id, puesto_cargo_id, puesto_nombre, esp_sial)
    for r in psql("SELECT c.id_sial||'~'||c.id||'~'||c.hospital_id||'~'||COALESCE(c.puesto_cargo_id::text,'')"
                  "||'~'||COALESCE(lower(unaccent(p.nombre)),'')||'~'||COALESCE(lower(unaccent(e.nombre)),'') "
                  "FROM cargos c LEFT JOIN puestos_cargo p ON p.id=c.puesto_cargo_id "
                  "LEFT JOIN especialidades_puesto e ON e.id=c.especialidad_puesto_id "
                  "WHERE c.id_sial IS NOT NULL;", neon):
        parts = r.split('~')
        cargo_row[parts[0]] = parts[1:]
    persona_por_cuil = {}
    for r in psql("SELECT cuil||'|'||id FROM personas WHERE cuil IS NOT NULL;", neon):
        cu, _, pid = r.partition('|'); persona_por_cuil[cu] = pid
    # especialidad_puesto por (puesto_cargo_id, nombre_norm) -> id
    esp_id = {}
    for r in psql("SELECT puesto_cargo_id::text||'~'||lower(unaccent(nombre))||'~'||id::text "
                  "FROM especialidades_puesto WHERE activo;", neon):
        pcid, nom, eid = r.split('~'); esp_id[(pcid, nom)] = eid
        esp_id.setdefault(('*', nom), eid)  # fallback por nombre
    # disponibles por puesto_nombre
    disp = {}
    for r in psql("SELECT lower(unaccent(p.nombre))||'~'||lower(unaccent(e.nombre)) "
                  "FROM especialidades_puesto e JOIN puestos_cargo p ON p.id=e.puesto_cargo_id WHERE e.activo;", neon):
        p, _, e = r.partition('~'); disp.setdefault(p, set()).add(e)

    # ── leer CSVs ──
    with open(B / 'base_concursos_limpio_2026-10-08.csv', encoding='utf-8-sig', newline='') as f:
        base_por_ee = {(r.get('ee_concurso') or '').strip(): r for r in csv.DictReader(f)
                       if (r.get('ee_concurso') or '').strip()}
    with open(B / 'bajas_cph_limpio_2026-10-08.csv', encoding='utf-8-sig', newline='') as f:
        act = [r for r in csv.DictReader(f)
               if (r.get('estado_concurso') or '').strip() == 'ACTIVO'
               and (r.get('codigo_de_registro') or '').strip() == '37'
               and (r.get('cargo') or '').strip()]
    universo = [r for r in act if (r.get('cargo') or '').strip() in cargos_sial
                and (r.get('cargo') or '').strip() in cargos_baja]
    # dedup por cargo: baja mas reciente
    por_cargo = {}
    for r in universo:
        c = (r.get('cargo') or '').strip()
        fa = (r.get('fecha_de_baja_ampliacion') or '').strip()
        if c not in por_cargo or fa > (por_cargo[c].get('fecha_de_baja_ampliacion') or '').strip():
            por_cargo[c] = r

    def resolver_esp(cargo, puesto_nombre, esp_sial, esp_csv):
        opts = disp.get(puesto_nombre, set())
        if cargo in ESP_POR_CARGO:
            return ESP_POR_CARGO[cargo]
        if esp_sial:
            return esp_sial
        esp = EQ.get(esp_csv, esp_csv)
        if esp:
            if esp in opts:
                return esp
            for o in opts:
                if sin_par(o) == esp:
                    return o
            if sin_par(esp) in opts:
                return sin_par(esp)
        if puesto_nombre in ESP_FIJA_POR_PUESTO:
            return ESP_FIJA_POR_PUESTO[puesto_nombre]
        return None

    inserts = []
    descartados = []
    for cargo, r in por_cargo.items():
        row = cargo_row.get(cargo)
        if not row:
            descartados.append((cargo, 'cargo no encontrado')); continue
        cargo_id, hospital_id_cargo, pcid, puesto_nom, esp_sial = row
        fecha = (r.get('fecha_de_baja_ampliacion') or '').strip()
        motivo = norm(r.get('motivo_de_baja'))
        if not fecha and motivo != MOTIVO_AMPLIACION:
            descartados.append((cargo, f'baja real sin fecha ({motivo})')); continue
        sigla = (r.get('sigla_efector') or r.get('sigla') or '').strip().upper()
        hospital_id = hospitales.get(sigla, hospital_id_cargo)  # fallback: hospital del cargo
        ee = (r.get('expediente_concurso') or '').strip()
        base = base_por_ee.get(ee, {})
        esp_resuelta = resolver_esp(cargo, puesto_nom, esp_sial, norm(r.get('especialidad_solicitada')))
        esp_fk = esp_id.get((pcid, esp_resuelta)) or esp_id.get(('*', esp_resuelta)) if esp_resuelta else None
        cuil = (r.get('cuil') or '').strip()
        persona_id = persona_por_cuil.get(cuil)

        concurso_id = str(uuid.uuid4())
        cph_id = str(uuid.uuid4())
        fecha_vacante = fecha if fecha else (r.get('fecha_de_baja_ampliacion') or '').strip()

        c_sql = (
            f"INSERT INTO concursos (id,cargo_id,hospital_id,persona_id,baja_id,origen,fecha_vacante,"
            f"motivo,expediente,tipo_concurso,created_at) VALUES ("
            f"{q(concurso_id)},{q(cargo_id)},{q(hospital_id)},{q(persona_id)},NULL,{q(ORIGEN)},"
            f"{q(fecha_vacante)},{q(norm(r.get('motivo_de_baja')))},{q(norm(r.get('expediente_concurso')))},"
            f"'cph',now());"
        )
        cph_sql = (
            f"INSERT INTO concursos_cph (id,concurso_id,cargo_id,hospital_id,estado,sub_estado,sub_estado_3,"
            f"puesto_cargo_solicitado_id,especialidad_puesto_solicitada_id,puesto_solicitado,especialidad_solicitada,"
            f"sigla_solicitada,ee_baja,fecha_baja,ee_concurso,fecha_ee_concurso,fecha_autorizacion,disposicion,"
            f"fecha_insc_desde,fecha_insc_hasta,fecha_examen,fecha_ifacs,fecha_insal,ee_designacion,"
            f"resolucion_designacion,observaciones,suspendido,created_at,updated_at) VALUES ("
            f"{q(cph_id)},{q(concurso_id)},{q(cargo_id)},{q(hospital_id)},'activo',"
            # sub_estado y sub_estado_3 son CODIGOS de estado (A-CARATULADO,
            # B-SORTEO JUR, ...), no texto descriptivo: van en MAYUSCULAS como
            # los produce calcConcursoCph y como los espera el front (etapaActual,
            # filtros). NO normalizar a minuscula.
            f"{q((norm(base.get('sub_estado')) or norm(r.get('sub_estado'))).upper() or None)},"
            f"{q(norm(base.get('sub_estado3')).upper() or None)},"
            f"{q(pcid or None)},{q(esp_fk)},{q(puesto_nom)},{q(esp_resuelta)},"
            f"{q(sigla.lower())},{q(norm(r.get('ex_baja_ampliacion')))},{q(fecha or None)},"
            f"{q(norm(r.get('expediente_concurso')))},{q(base.get('fecha_ee_concurso') or None)},"
            f"{q(base.get('fecha_autorizacion') or None)},{q(norm(base.get('disposicion')))},"
            f"{q(base.get('fecha_insc_desde') or None)},{q(base.get('fecha_insc_hasta') or None)},"
            f"{q(base.get('fecha_examen') or None)},{q(base.get('fecha_ifacs') or None)},"
            f"{q(base.get('fecha_insal') or None)},{q(norm(r.get('expediente_de_designacion')))},"
            f"{q(norm(r.get('resolucion_de_designacion')))},{q(norm(base.get('observaciones')))},"
            f"false,now(),now());"
        )
        inserts.append((cargo, c_sql, cph_sql))

    print(f"\nImportables: {len(inserts)}  |  Descartados: {len(descartados)}")
    for m, n in Counter(d[1] for d in descartados).most_common():
        print(f"   {n}  {m}")

    if inserts:
        print("\n── SQL del PRIMER concurso (ejemplo) ──")
        print(inserts[0][1])
        print(inserts[0][2])

    if not COMMIT:
        print("\nDRY-RUN: no se escribio nada. Agregá --commit para ejecutar.")
        return

    # ── ejecutar en transaccion ──
    sql = "BEGIN;\n" + "\n".join(c + "\n" + cph for _, c, cph in inserts) + "\nCOMMIT;\n"
    tmp = Path('/tmp/import_cph.sql'); tmp.write_text(sql, encoding='utf-8')
    subprocess.run(['docker', 'compose', 'cp', str(tmp), 'postgres:/tmp/import_cph.sql'], cwd=REPO, check=True)
    if neon:
        inner = f"psql '{NEON_DIRECT}' -v ON_ERROR_STOP=1 -f /tmp/import_cph.sql"
        cmd = ['docker', 'compose', 'exec', '-T', 'postgres', 'sh', '-c', inner]
    else:
        cmd = ['docker', 'compose', 'exec', '-T', 'postgres', 'psql', '-U', 'srrhh_user',
               '-d', 'srrhh_db', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/import_cph.sql']
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    print(r.stdout[-2000:]); print(r.stderr[-2000:])
    print("EXITO" if r.returncode == 0 else f"FALLO (exit {r.returncode}) — ROLLBACK automatico")


if __name__ == '__main__':
    main()
