import openpyxl

for name, path, sheet in [
    ('ARBOL',         'Doc/Referencias/Archivos_semanales/Arbol_Salud_20261115.xlsx',  'Sheet1'),
    ('OCUPACION_POU', 'Doc/Referencias/Archivos_semanales/Ocupacion_POU_16-11.xlsx',   'Base'),
]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    headers = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    print(f'=== {name} ({sheet}) ===')
    for i, h in enumerate(headers):
        print(f'  {i:2d}  {h}')
    print()
    print('  Muestra (2 filas):')
    for row in ws.iter_rows(min_row=2, max_row=3, values_only=True):
        print(f'  {dict(zip(headers, row))}')
    print()
    wb.close()
