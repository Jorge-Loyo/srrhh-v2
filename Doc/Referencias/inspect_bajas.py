import openpyxl

wb = openpyxl.load_workbook(
    'Doc/Referencias/Archivos_semanales/Bajas_salud_20261115.xlsx',
    read_only=True, data_only=True
)
ws = wb.active
headers = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
print('=== COLUMNAS BAJAS_SALUD ===')
for i, h in enumerate(headers):
    print(f'  {i:2d}  {h}')
print()
print('=== MUESTRA (2 filas) ===')
for row in ws.iter_rows(min_row=2, max_row=3, values_only=True):
    for h, v in zip(headers, row):
        if v is not None:
            print(f'  {h}: {v}')
    print()
wb.close()
