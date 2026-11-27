import openpyxl

files = {
    'Arbol': 'Doc/Referencias/Archivos_semanales/Arbol_Salud_20261115.xlsx',
    'Bajas': 'Doc/Referencias/Archivos_semanales/Bajas_salud_20261115.xlsx',
    'Cargos': 'Doc/Referencias/Archivos_semanales/Cargos_salud_20261115.xlsx',
    'Ocupacion_POU': 'Doc/Referencias/Archivos_semanales/Ocupacion_POU_16-11.xlsx',
    'POU_HISTORICO': 'Doc/Referencias/Archivos_semanales/POU_DECRETO 315-22 y modificaciones - HISTORICO.xlsx',
}

for name, path in files.items():
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    print(f'=== {name} ===')
    print(f'  Sheets: {wb.sheetnames}')
    for sh in wb.sheetnames[:4]:
        ws = wb[sh]
        rows = list(ws.iter_rows(min_row=1, max_row=3, values_only=True))
        print(f'  [{sh}] {ws.max_row}r x {ws.max_column}c')
        for r in rows:
            print(f'    {r}')
    wb.close()
    print()
