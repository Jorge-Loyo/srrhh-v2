import csv

for fname, cuil_idx in [
    ('/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv', 1),
    ('/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',  1),
]:
    print(fname.split('/')[-1])
    with open(fname) as f:
        r = csv.reader(f)
        next(r)
        lens = {}
        samples = {}
        for row in r:
            if cuil_idx < len(row):
                v = row[cuil_idx].strip().replace('-', '')
                l = len(v)
                lens[l] = lens.get(l, 0) + 1
                if l > 11 and l not in samples:
                    samples[l] = row[cuil_idx].strip()
        for k, cnt in sorted(lens.items()):
            s = f'  e.g. "{samples[k]}"' if k in samples else ''
            print(f'  cuil len={k}: {cnt}{s}')
    print()
