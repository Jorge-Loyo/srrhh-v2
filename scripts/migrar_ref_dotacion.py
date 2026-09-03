"""
Migración: ARCHIVOS PARA DOTACION.xlsx → tablas ref_* en Postgres
Pobla ref_agrupadores, ref_unificadores_puesto y ref_especialidades_cuil
desde las hojas del Excel que Dotaneitor usaba como fuente de verdad.

Uso:
  docker exec srrhh_dotaneitor python3 /tmp/migrar_ref_dotacion.py
"""
import sys
import pandas as pd
from sqlalchemy import create_engine, text
import os

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print('ERROR: DATABASE_URL no configurada')
    sys.exit(1)

XLSX = '/tmp/ARCHIVOS.xlsx'
engine = create_engine(DATABASE_URL)

xl = pd.ExcelFile(XLSX)

# ─── 1. ref_agrupadores ───────────────────────────────────────────────────────
print('Migrando ref_agrupadores...')
df_agr = xl.parse('AGRUPADOR')
df_agr.columns = [c.strip() for c in df_agr.columns]
df_agr = df_agr.dropna(subset=['CRUCE', 'AGRUPADOR'])
df_agr = df_agr[df_agr['CRUCE'].astype(str).str.strip() != '']

rows_agr = []
for _, row in df_agr.iterrows():
    cruce     = str(row['CRUCE']).strip()
    escalafon = str(row.get('ESCALAFON', '')).strip()
    lit_puesto = str(row.get('LIT_PUESTO', '')).strip()
    agrupador  = str(row['AGRUPADOR']).strip()
    if cruce and agrupador:
        rows_agr.append({
            'cruce': cruce,
            'escalafon': escalafon,
            'lit_puesto': lit_puesto,
            'agrupador': agrupador,
        })

with engine.begin() as conn:
    inserted = 0
    for r in rows_agr:
        result = conn.execute(text("""
            INSERT INTO ref_agrupadores (id, cruce, escalafon, lit_puesto, agrupador, activo)
            VALUES (gen_random_uuid(), :cruce, :escalafon, :lit_puesto, :agrupador, true)
            ON CONFLICT (cruce) DO NOTHING
        """), r)
        inserted += result.rowcount
print(f'  ref_agrupadores: {inserted} filas insertadas de {len(rows_agr)} procesadas')

# ─── 2. ref_unificadores_puesto ───────────────────────────────────────────────
print('Migrando ref_unificadores_puesto...')
df_unif = xl.parse('UNIFICADOR DE PUESTOS')
df_unif.columns = [c.strip() for c in df_unif.columns]
df_unif = df_unif.dropna(subset=['Cruce', 'UNIFICADOR DE PUESTO'])
df_unif = df_unif[df_unif['Cruce'].astype(str).str.strip() != '']
# Filtrar los "Revisar con JUAN MANUEL" — no son datos válidos
df_unif = df_unif[~df_unif['UNIFICADOR DE PUESTO'].astype(str).str.upper().str.contains('REVISAR')]

rows_unif = []
for _, row in df_unif.iterrows():
    cruce       = str(row['Cruce']).strip()
    lit_cod_reg = str(row.get('LIT_COD_REG', '')).strip()
    lit_puesto  = str(row.get('LIT_PUESTO', '')).strip()
    unificador  = str(row['UNIFICADOR DE PUESTO']).strip()
    if cruce and unificador:
        rows_unif.append({
            'cruce': cruce,
            'lit_cod_reg': lit_cod_reg,
            'lit_puesto': lit_puesto,
            'unificador': unificador,
        })

with engine.begin() as conn:
    inserted = 0
    for r in rows_unif:
        result = conn.execute(text("""
            INSERT INTO ref_unificadores_puesto (id, cruce, lit_cod_reg, lit_puesto, unificador, activo)
            VALUES (gen_random_uuid(), :cruce, :lit_cod_reg, :lit_puesto, :unificador, true)
            ON CONFLICT (cruce) DO NOTHING
        """), r)
        inserted += result.rowcount
print(f'  ref_unificadores_puesto: {inserted} filas insertadas de {len(rows_unif)} procesadas')

# ─── 3. ref_especialidades_cuil ───────────────────────────────────────────────
print('Migrando ref_especialidades_cuil...')

HOJAS_TIPO = {
    'ESPECIALIDADES CPH':        'cph',
    'ESPECIALIDADES SUPLENTES':  'suplentes',
    'ESPECIALIDADES RESIDENTES': 'residentes',
}

total_insertadas = 0
for hoja, tipo in HOJAS_TIPO.items():
    df_esp = xl.parse(hoja)
    df_esp.columns = [c.strip() for c in df_esp.columns]
    df_esp = df_esp.dropna(subset=['CUIL', 'ESPECIALIDAD UNIF.'])
    df_esp = df_esp[df_esp['CUIL'].astype(str).str.strip() != '']
    df_esp = df_esp[df_esp['ESPECIALIDAD UNIF.'].astype(str).str.strip() != '']

    # Normalizar CUIL a string sin decimales
    df_esp['CUIL'] = df_esp['CUIL'].astype(str).str.split('.').str[0].str.strip()

    # Cuil y Rol — columna puede llamarse distinto según la hoja
    cuil_rol_col = next((c for c in df_esp.columns if 'cuil' in c.lower() and 'rol' in c.lower()), None)

    rows_esp = []
    for _, row in df_esp.iterrows():
        cuil       = str(row['CUIL']).strip()
        especialidad = str(row['ESPECIALIDAD UNIF.']).strip()
        cuil_y_rol = str(row[cuil_rol_col]).strip() if cuil_rol_col else None
        if cuil and especialidad:
            rows_esp.append({
                'tipo': tipo,
                'cuil': cuil,
                'cuil_y_rol': cuil_y_rol,
                'especialidad': especialidad,
            })

    with engine.begin() as conn:
        inserted = 0
        for r in rows_esp:
            result = conn.execute(text("""
                INSERT INTO ref_especialidades_cuil (id, tipo, cuil, cuil_y_rol, especialidad, activo)
                VALUES (gen_random_uuid(), :tipo, :cuil, :cuil_y_rol, :especialidad, true)
                ON CONFLICT DO NOTHING
            """), r)
            inserted += result.rowcount
        total_insertadas += inserted
    print(f'  {hoja} ({tipo}): {inserted} filas insertadas de {len(rows_esp)} procesadas')

print(f'\nTotal ref_especialidades_cuil: {total_insertadas} filas')

# ─── Verificación final ───────────────────────────────────────────────────────
print('\nVerificación final:')
with engine.connect() as conn:
    for tabla in ['ref_agrupadores', 'ref_unificadores_puesto', 'ref_especialidades_cuil']:
        count = conn.execute(text(f'SELECT COUNT(*) FROM {tabla}')).scalar()
        print(f'  {tabla}: {count} filas')

print('\nMigración completada.')
