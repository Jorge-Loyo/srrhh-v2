# Sync de cargos con el Excel MSGC — FASE 1 (dry-run, SOLO LECTURA)

Compara el Excel `Mapeo de Cargos - MSGC.xlsx` (hoja `NOMINAL DE CARGOS`) con los cargos del sistema y
reporta qué se crearía, qué cambiaría, qué pasaría a no vigente y qué no cruza. Se puede repetir cada
semana con el corte nuevo y compara contra la corrida anterior (`--previo`).

**En la Fase 1 NO existe modo escritura.** No hay flag ni código que escriba en Neon ni en ninguna base
(un test lo verifica). La lectura del sistema corre en una transacción `READ ONLY`.

> **ATENCIÓN: la API local apunta a la Neon de PRODUCCIÓN** (conexión directa `:5432`, ver
> `docker-compose.override.yml`, `Doc/Desarrollo/ARRANQUE_LOCAL.md` y `DEPLOY_PRODUCCION.md` §7).
> "Correr en local" no es una base separada. La garantía es la transacción `READ ONLY` y la ausencia de
> código de escritura. En el log tiene que aparecer `transaction_read_only=on`; si no, el script aborta.

## Qué NO se verificó (lo hace Jorge)

El agente que escribió esto no tiene Docker ni acceso a Neon. **La corrida contra Neon NO fue
verificada.** Sí se probó, offline, con fixtures sintéticos (`--sistema-json`) y con el CSV real del Excel
contra un sistema vacío. Si algo falla en los pasos 2 a 5, avisar con el mensaje exacto.

## Archivos

| Archivo | Para qué |
|---|---|
| `preprocesar_excel.py` | Lee el Excel en el host y emite `nominal_<corte>.csv` + `meta.json` sin CUIL ni nombres |
| `leerNominal.ts` | Lee el CSV con lista blanca de columnas |
| `acronimoMsgc.ts`, `equivalencias.ts` | Acrónimos del Excel y tabla de equivalencias versionada |
| `cruce.ts` | Motor puro de cruce (categorías a–j y cierre) |
| `sistemaReadonly.ts` | Snapshot del sistema en transacción `READ ONLY` |
| `reporteCsv.ts` | Escribe `resumen.json`, `resumen.md` y `detalle_<cat>.csv` |
| `dry-run.ts` | CLI |

## Runbook (desde WSL, en `/mnt/c/Desarrollo/SRH/SRRHH-Legacy`, con el stack arriba)

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

Variables de ejemplo (ajustar rutas): `WT` = carpeta del worktree/rama con este código,
`RT` = carpeta de runtime FUERA de git.

```bash
WT=/mnt/c/Desarrollo/SRH/SRRHH-Legacy/.worktrees/sync-cargos-msgc-f1
RT=/mnt/c/Desarrollo/SRH/SRRHH-Legacy/.agents/tasks/sync-cargos-msgc/runtime
```

1. **Host: preprocesar el Excel** (Python con `openpyxl`; el Excel está gitignorado y vive en el checkout principal):

   ```bash
   python "$WT/apps/api/scripts/sync-cargos-msgc/preprocesar_excel.py" \
     --xlsx "/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Mapeo de Cargos - MSGC.xlsx" \
     --out "$RT"
   ```

   Genera `nominal_<corte>.csv` y `meta.json` en `$RT`. Deben ser 53.064 filas en este corte.

2. **Crear las carpetas de trabajo en el contenedor:**

   ```bash
   docker exec srrhh_api mkdir -p /tmp/sync-msgc/in /tmp/sync-msgc/out
   ```

3. **Copiar el CSV, el `meta.json` y el código al contenedor:**

   ```bash
   docker cp "$RT/nominal_<corte>.csv" srrhh_api:/tmp/sync-msgc/in/
   docker cp "$RT/meta.json" srrhh_api:/tmp/sync-msgc/in/
   # Borrar el destino antes: si ya existe, `docker cp <dir>` anida la copia y correría el código viejo.
   docker exec srrhh_api rm -rf /repo/apps/api/scripts/sync-cargos-msgc
   docker exec srrhh_api mkdir -p /repo/apps/api/scripts/sync-cargos-msgc
   docker cp "$WT/apps/api/scripts/sync-cargos-msgc/." srrhh_api:/repo/apps/api/scripts/sync-cargos-msgc/
   ```

4. **Correr el dry-run dentro del contenedor:**

   ```bash
   docker exec -w /repo/apps/api srrhh_api pnpm exec tsx scripts/sync-cargos-msgc/dry-run.ts \
     --input /tmp/sync-msgc/in/nominal_<corte>.csv --out /tmp/sync-msgc/out
   ```

   Para ver el delta contra la semana anterior, copiar antes su `resumen.json` al contenedor y sumar
   `--previo /tmp/sync-msgc/in/resumen_anterior.json`. El log debe mostrar `transaction_read_only=on`
   y terminar con `SIMULACION: no se escribio nada en ninguna base.`

5. **Traer los resultados y limpiar:**

   ```bash
   docker cp srrhh_api:/tmp/sync-msgc/out <destino>
   docker exec srrhh_api rm -rf /tmp/sync-msgc /repo/apps/api/scripts/sync-cargos-msgc
   rm "$RT/nominal_<corte>.csv"   # contiene id_sial_rol (clave de cruce): no dejarlo
   ```

## Por qué así

- **`docker exec` y no `tsx` desde WSL:** `node_modules` se instaló para otra plataforma y `tsx`/esbuild
  falla por binario de plataforma (ver `ARRANQUE_LOCAL.md`). Dentro del contenedor corre bien.
- **`docker cp` y no el worktree:** el contenedor `srrhh_api` monta solo `apps/api/src`, `packages/types/src`,
  `packages/utils/src` y `prisma/` del checkout principal (ver `docker-compose.override.yml`). No monta
  `scripts/` ni el worktree, así que el código se copia. El script importa `../../src/shared/txOpts.js`, que sí
  está montado. `@srrhh/normalizacion` (usado por `acronimoMsgc`, `cruce` y `equivalencias`) NO está montado: se
  resuelve desde la imagen, igual que ya lo hace `apps/api/src`. No se pudo verificar en un contenedor; si la
  primera corrida falla con "Cannot find package '@srrhh/normalizacion'", reportar el error exacto.
- **Código viejo:** `meta.json` del resultado informa `version_equivalencias`; comprobar que coincida con la
  versión esperada tras actualizar equivalencias.
- **El Excel no entra al contenedor:** el preprocesador corre en el host y no lee la columna de nombres
  (AC); de la columna M conserva solo valores `EX-AAAA-...`. Así CUIL y nombres nunca llegan al lector.

## Salidas

`resumen.json`, `resumen.md` y `detalle_a.csv` … `detalle_j.csv` con columnas fijas
(`codigo_excel, categoria, accion, cargo_codigo_sistema, codigo_propuesto, acronimo, cr, sigla, puesto, motivo`).
Ninguna salida lleva `id_sial_rol`, CUIL, nombres ni ids de persona; cada celda se valida (rechaza 11 dígitos
seguidos y el patrón `\d+-\d+`).

| Cat | Qué es |
|---|---|
| a | Ocupado cruzado por ID SIAL Rol, sin diferencias |
| b | Ocupado cruzado con diferencias (prefijo/acrónimo, CR, sigla, puesto, especialidad, estado) |
| c | Ocupado del Excel sin ocupación viva en el sistema (crear) |
| d | Jefatura ENF-J / TEC-J / EG-J: segunda fila del par con el mismo ID SIAL Rol (crear vinculada al cargo base) |
| e | Fila sin ocupante (Concurso, Nunca levantado, Sin designar): crear cupo |
| f | Cargos vigentes del sistema sin ocupante (candidatos a reemplazo), con y sin vínculos |
| g | Cargos con ocupante vivo cuyo ID SIAL Rol no está en el Excel (pasarían a no vigente) |
| h | Ya no vigentes / validacion_vacante / eliminados (informativo) |
| i | Ambigüedades: rol repetido, rol en cargo no vigente, cargo con más de una ocupación viva, `-TTR-`, colisiones de recodificación |
| j | Filas no resolubles contra catálogos (sigla fuera de `hospitales`, CR, puesto, especialidad) |

Las categorías a, b, c, d, e y las filas de i que son del Excel particionan las filas del Excel; j y el resto
de i son diagnósticos adicionales. El cierre compara `vigentes_hoy + (c+d+e) − f − g` con las filas del Excel,
con dos métricas: solo `vigente`, y `vigente + validacion_vacante`.

## Corrida local sin base (para probar)

```bash
pnpm --filter @srrhh/api exec tsx scripts/sync-cargos-msgc/dry-run.ts \
  --input <nominal.csv> --sistema-json <fixture.json> --out <dir>
```

El fixture es un `SnapshotSistema` (ver `cruce.ts`); `{"cargos":[],"ocupaciones":[],"siglasHospital":[],"siglasOrganigrama":[],"codigosRegistro":[],"puestos":[],"especialidades":[]}` equivale a un sistema vacío.
