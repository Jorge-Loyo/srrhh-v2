import json
d = json.load(open('/mnt/c/Desarrollo/SRH/SRRHH-Legacy/apps/api/scripts/sync-cargos-msgc/_excel_mapa.json'))
print('Total:', len(d))
estados = {}
for f in d:
    estados[f['estado']] = estados.get(f['estado'], 0) + 1
print('Estados:', estados)
bloques = {}
for f in d:
    bloques[f['bloque']] = bloques.get(f['bloque'], 0) + 1
print('Bloques:', bloques)
sin_sial = sum(1 for f in d if not f['sial_rol_corto'])
print('Sin sial_rol_corto:', sin_sial)
con_sial = sum(1 for f in d if f['sial_rol_corto'])
print('Con sial_rol_corto:', con_sial)
