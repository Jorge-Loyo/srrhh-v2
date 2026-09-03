"""
Carga inicial (y recarga) de las tablas de referencia que `DotacionAutomationBD` lee desde
Postgres en vez de Excel: `ref_agrupadores`, `ref_unificadores_puesto`, `ref_especialidades_cuil`,
más los campos de catálogo de `hospitales` que también venían de este mismo archivo.

Contexto (ver Doc/Dotaneitor_Analisis.md y el hallazgo de Agustin, 2026-09-02): cuando Dotaneitor
se migró de leer `ARCHIVOS PARA DOTACION.xlsx` a leer estas tablas de Postgres (S2-19), se creó el
schema pero **nunca se cargaron los datos** — las tablas quedaron en 0 filas. Consecuencia real en
el padrón: como `Dotaneitor.py` arma `agrupador_map`/`unificador_map` con un dict() por fila de
estas tablas y después hace `.map()` contra ese dict, con las tablas vacías esos `.map()` no
encuentran nada y las columnas AGRUPADOR / UNIFICADOR DE PUESTOS / UNIVERSO TOTALIZADOR /
MONOVALENCIA salen en blanco para el 100% de las filas del padrón, sin ningún error visible. Este
script es el fix: carga esos datos una vez (y sirve para recargarlos si el Excel de referencia se
actualiza más adelante).

Uso:
    cd services/dotaneitor
    python scripts/seed_referencias.py --archivo "/ruta/a/ARCHIVOS PARA DOTACION.xlsx"

Si no se pasa --archivo, usa la variable de entorno ARCHIVOS_DOTACION_PATH, y si tampoco está
seteada, prueba la ubicación de desarrollo local de este equipo (ver DEFAULT_ARCHIVO abajo).

Nota de datos personales: las hojas ESPECIALIDADES CPH/SUPLENTES/RESIDENTES tienen CUIL + nombre
de personas reales. Este script lee esas hojas directo del Excel y las escribe en Postgres; en
ningún momento las vuelca a un archivo intermedio ni las commitea al repo — el Excel de origen
tampoco se sube al repo (queda donde está hoy, fuera del control de versiones).

Es re-ejecutable: `ref_agrupadores` / `ref_unificadores_puesto` / `ref_especialidades_cuil` se
truncan y se recargan enteras en cada corrida (son tablas de referencia completas, no
incrementales). `hospitales` se actualiza por UPDATE matcheando por `sigla` — no crea hospitales
nuevos que no existan ya en la tabla (decisión de alcance de S2-14/paso 15: Dotaneitor no da de
alta catálogos por su cuenta todavía).
"""
import argparse
import os
import sys
import uuid
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text


def _sin_nan(df):
    """Reemplaza NaN/NaT de pandas por None, así psycopg2 los manda como NULL en vez de la
    representación en string ('NaN') que produce si se los deja como float NaN."""
    return df.astype(object).where(pd.notna(df), None)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from especialidades import normalizar_texto_especialidad  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent

# Ubicación de desarrollo local de este equipo — ajustar si el archivo se mueve. En cualquier otro
# entorno, pasar --archivo explícitamente.
DEFAULT_ARCHIVO = BASE_DIR.parent.parent / 'Automatización Dotación' / 'ARCHIVOS PARA DOTACION.xlsx'

HOJAS_ESPECIALIDAD = {
    'cph': 'ESPECIALIDADES CPH',
    'suplentes': 'ESPECIALIDADES SUPLENTES',
    'residentes': 'ESPECIALIDADES RESIDENTES',
}


def cargar_engine():
    load_dotenv(BASE_DIR.parent / '.env.local')
    load_dotenv(BASE_DIR / '.env')
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL no configurada (revisar .env / .env.local)')
    return create_engine(database_url)


def cargar_agrupador(engine, archivo):
    df = pd.read_excel(archivo, sheet_name='AGRUPADOR')
    df = df.rename(columns={
        'CRUCE': 'cruce', 'ESCALAFON': 'escalafon', 'LIT_PUESTO': 'lit_puesto', 'AGRUPADOR': 'agrupador',
    })[['cruce', 'escalafon', 'lit_puesto', 'agrupador']]
    df = df.dropna(subset=['cruce'])
    df.insert(0, 'id', [str(uuid.uuid4()) for _ in range(len(df))])
    df = _sin_nan(df)

    with engine.begin() as conn:
        conn.execute(text('TRUNCATE TABLE ref_agrupadores'))
        conn.execute(
            text('INSERT INTO ref_agrupadores (id, cruce, escalafon, lit_puesto, agrupador) '
                 'VALUES (:id, :cruce, :escalafon, :lit_puesto, :agrupador)'),
            df.to_dict(orient='records'),
        )
    return len(df)


def cargar_unificador(engine, archivo):
    df = pd.read_excel(archivo, sheet_name='UNIFICADOR DE PUESTOS')
    df = df.rename(columns={
        'Cruce': 'cruce', 'LIT_COD_REG': 'lit_cod_reg', 'LIT_PUESTO': 'lit_puesto',
        'UNIFICADOR DE PUESTO': 'unificador',
    })[['cruce', 'lit_cod_reg', 'lit_puesto', 'unificador']]
    df = df.dropna(subset=['cruce'])
    df.insert(0, 'id', [str(uuid.uuid4()) for _ in range(len(df))])
    df = _sin_nan(df)

    with engine.begin() as conn:
        conn.execute(text('TRUNCATE TABLE ref_unificadores_puesto'))
        conn.execute(
            text('INSERT INTO ref_unificadores_puesto (id, cruce, lit_cod_reg, lit_puesto, unificador) '
                 'VALUES (:id, :cruce, :lit_cod_reg, :lit_puesto, :unificador)'),
            df.to_dict(orient='records'),
        )
    return len(df)


def cargar_especialidades_cuil(engine, archivo):
    partes = []
    reporte = {}
    for tipo, hoja in HOJAS_ESPECIALIDAD.items():
        df = pd.read_excel(archivo, sheet_name=hoja, dtype={'CUIL': str})
        df = df.rename(columns={'Cuil y Rol': 'cuil_y_rol', 'ESPECIALIDAD UNIF.': 'especialidad'})
        df['tipo'] = tipo
        df['cuil'] = df['CUIL'].astype(str).str.strip()
        # Misma normalización que aplica ConsolidadorEspecialidadesBD.cargar() al leer en runtime —
        # se deja ya prolijo en la tabla para que quien mire los datos a mano vea el valor final.
        df['especialidad'] = df['especialidad'].apply(normalizar_texto_especialidad)
        df = df[['tipo', 'cuil', 'cuil_y_rol', 'especialidad']].dropna(subset=['cuil', 'especialidad'])
        partes.append(df)
        reporte[hoja] = len(df)

    todas = pd.concat(partes, ignore_index=True)
    todas.insert(0, 'id', [str(uuid.uuid4()) for _ in range(len(todas))])
    todas = _sin_nan(todas)

    with engine.begin() as conn:
        conn.execute(text('TRUNCATE TABLE ref_especialidades_cuil'))
        # Insertado en lotes: son ~49k filas, un solo execute con executemany interno de SQLAlchemy
        # ya lo maneja bien, pero se trocea por prolijidad/memoria.
        registros = todas.to_dict(orient='records')
        for i in range(0, len(registros), 5000):
            conn.execute(
                text('INSERT INTO ref_especialidades_cuil (id, tipo, cuil, cuil_y_rol, especialidad) '
                     'VALUES (:id, :tipo, :cuil, :cuil_y_rol, :especialidad)'),
                registros[i:i + 5000],
            )
    return reporte, len(todas)


def actualizar_hospitales(engine, archivo):
    df = pd.read_excel(archivo, sheet_name='SIGLAS')
    df = df.rename(columns={
        'Sigla': 'sigla', 'UNIVERSO TOTALIZADOR': 'universo_totalizador',
        'Tipo de Hospital / Sigla': 'tipo', 'Monovalencia': 'monovalencia',
    })[['sigla', 'universo_totalizador', 'tipo', 'monovalencia']]
    df = df.dropna(subset=['sigla'])
    df = _sin_nan(df)

    with engine.begin() as conn:
        existentes = {
            row[0] for row in conn.execute(text('SELECT sigla FROM hospitales')).fetchall()
        }
        actualizados = 0
        for _, row in df.iterrows():
            if row['sigla'] not in existentes:
                continue
            conn.execute(
                text('UPDATE hospitales SET universo_totalizador = :universo_totalizador, '
                     'tipo = :tipo, monovalencia = :monovalencia WHERE sigla = :sigla'),
                {
                    'universo_totalizador': row['universo_totalizador'],
                    'tipo': row['tipo'],
                    'monovalencia': row['monovalencia'],
                    'sigla': row['sigla'],
                },
            )
            actualizados += 1

    sin_match = sorted(set(df['sigla']) - existentes)
    return actualizados, sin_match


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archivo', default=os.getenv('ARCHIVOS_DOTACION_PATH', str(DEFAULT_ARCHIVO)))
    args = parser.parse_args()

    archivo = Path(args.archivo)
    if not archivo.exists():
        print(f'✗ No se encontró el archivo: {archivo}')
        sys.exit(1)

    print(f'Leyendo {archivo}...')
    engine = cargar_engine()

    n_ag = cargar_agrupador(engine, archivo)
    print(f'✓ ref_agrupadores: {n_ag} filas cargadas')

    n_uni = cargar_unificador(engine, archivo)
    print(f'✓ ref_unificadores_puesto: {n_uni} filas cargadas')

    reporte_esp, n_esp = cargar_especialidades_cuil(engine, archivo)
    for hoja, n in reporte_esp.items():
        print(f'  - {hoja}: {n} filas')
    print(f'✓ ref_especialidades_cuil: {n_esp} filas cargadas')

    n_hosp, sin_match = actualizar_hospitales(engine, archivo)
    print(f'✓ hospitales: {n_hosp} actualizados (universo_totalizador/tipo/monovalencia)')
    if sin_match:
        print(f'  [!] {len(sin_match)} sigla(s) de la hoja SIGLAS sin hospital existente '
              f'(no se crean, solo se actualizan los que ya están): {", ".join(sin_match)}')

    print('\nListo.')


if __name__ == '__main__':
    main()
