import pandas as pd

path = '/tmp/ARCHIVOS.xlsx'
xl = pd.ExcelFile(path)
print('Hojas:', xl.sheet_names)
for sheet in xl.sheet_names:
    df = xl.parse(sheet)
    print(f'--- {sheet}: {len(df)} filas, cols: {list(df.columns)}')
    if len(df) > 0:
        print(df.head(2).to_string())
        print()
