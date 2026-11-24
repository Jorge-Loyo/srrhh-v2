import openpyxl, re

wb = openpyxl.load_workbook(
    'Doc/Referencias/Archivos_semanales/POU_DECRETO 315-22 y modificaciones - HISTORICO.xlsx',
    read_only=False, data_only=True
)
ws = wb['ULTIMO ANEXO']

# Leer todas las filas
rows = list(ws.iter_rows(min_row=1, values_only=True))

# Identificar hospitales: fila donde col C tiene texto largo (nombre hospital)
# y la siguiente fila tiene PERFIL/ESPECIALIDAD
hospitales = []
for i, row in enumerate(rows):
    c = row[2]  # columna C
    d = row[3]  # columna D
    e = row[4]  # columna E
    # Nombre de hospital: col C tiene texto, col D y E vacías, no es PERFIL
    if c and isinstance(c, str) and not d and not e:
        if 'Hospital' in c or 'CESAC' in c or 'Centro' in c:
            hospitales.append((i+1, c.strip()))

print(f'=== HOSPITALES DETECTADOS ({len(hospitales)}) ===')
for row_num, nombre in hospitales[:30]:
    print(f'  row {row_num:4d}: {nombre}')

print()
# Ver filas 88-100 (zona de dotaciones semanales)
print('=== FILAS 88-105 (dotaciones diarias y semanales) ===')
for i, row in enumerate(rows[87:104], 88):
    non_none = [v for v in row if v is not None]
    if non_none:
        print(f'  row {i:3d}: {list(row[:8])}')

wb.close()
