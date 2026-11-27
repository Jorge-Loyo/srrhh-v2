import openpyxl

wb = openpyxl.load_workbook(
    'Doc/Referencias/Archivos_semanales/Cargos_salud_20261115.xlsx',
    read_only=True, data_only=True
)
ws = wb.active

# Header completo
headers = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
print('=== COLUMNAS CARGOS_SALUD ===')
for i, h in enumerate(headers):
    print(f'  {i:2d}  {h}')

# 3 filas de muestra
print()
print('=== MUESTRA (3 filas) ===')
for row in ws.iter_rows(min_row=2, max_row=4, values_only=True):
    for h, v in zip(headers, row):
        if v is not None:
            print(f'  {h}: {v}')
    print()

wb.close()
