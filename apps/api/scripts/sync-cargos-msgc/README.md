# Sync de cargos con el Excel MSGC — FASE 1 (dry-run, SOLO LECTURA)

Compara el Excel `Mapeo de Cargos - MSGC.xlsx` (hoja `NOMINAL DE CARGOS`) con los cargos del sistema y
reporta qué se crearía, qué cambiaría, qué pasaría a no vigente y qué no cruza. Se puede repetir cada
semana con el corte nuevo y compara contra la corrida anterior (`--previo`).

**El dry-run (Fase 1) NO escribe; el modo escritura de la Fase 2 está en `sincronizar.ts` (ver al final).** No hay flag ni código que escriba en Neon ni en ninguna base
(un test lo verifica). La lectura del sistema corre en una transacción `READ ONLY`.

> **ATENCIÓN: la API local apunta a la Neon de PRODUCCIÓN** (conexión directa `:5432`, ver
> `docker-compose.override.yml`, `Doc/Desarrollo/ARRANQUE_LOCAL.md` y `DEPLOY_PRODUCCION.md` §7).
> "Correr en local" no es una base separada. La garantía es la transacción `READ ONLY` y la ausencia de
> código de escritura. En el log tiene que aparecer `transaction_read_only=on`; si no, el script aborta.

## Qué NO se verificó (lo hace Jorge)

El agente que escribió esto no tiene Docker ni acceso a Neon. **La corrida contra Neon NO fue
verificada.** Sí se probó, offline, con fixtures sintéticos (`--sistema-json`) y con el CSV real del Excel
contra un sistema vacío. Si algo falla en los pasos 2 a 5, avisar con el mensaje exacto.

La primera corrida real contra Neon falló por formato de clave: no cruzó ningún ocupado
(`a=0 b=0 c=49238 g=49184`) porque el Excel trae `legajo-rol` y el sistema guarda
`legajo-rol-cuil-rol`. Quedó corregido (ver «Clave de cruce»), verificado solo con fixtures sintéticos;
falta una nueva corrida real.

La v3 (validacion_vacante al cupo, reuso por expediente, `concursos_colgados.csv`) se verificó con tests unitarios y
una corrida con sistema vacío; las dos consultas nuevas de concursos NO se probaron contra la base real.

## Archivos

| Archivo | Para qué |
|---|---|
| `preprocesar_excel.py` | Lee el Excel en el host y emite `nominal_<corte>.csv` + `meta.json` sin CUIL ni nombres |
| `leerNominal.ts` | Lee el CSV con lista blanca de columnas |
| `acronimoMsgc.ts`, `equivalencias.ts` | Acrónimos del Excel y tabla de equivalencias versionada |
| `cruce.ts` | Motor puro de cruce (categorías a–j, reuso por cupo/expediente, cierre y concursos colgados) |
| `sistemaReadonly.ts` | Snapshot del sistema en transacción `READ ONLY` |
| `reporteCsv.ts` | Escribe `resumen.json`, `resumen.md`, `detalle_<cat>.csv`, `concursos_colgados.csv`, `conflictos_expediente.csv` y `concursos_sin_expediente.csv` |
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

`resumen.json`, `resumen.md`, `detalle_a.csv` … `detalle_j.csv`, `concursos_colgados.csv`, `conflictos_expediente.csv` y `concursos_sin_expediente.csv`. Los detalle tienen columnas fijas
(`codigo_excel, categoria, accion, cargo_codigo_sistema, codigo_propuesto, acronimo, cr, sigla, puesto, motivo`).
Ninguna salida lleva `id_sial_rol`, CUIL, nombres ni ids de persona; cada celda se valida (rechaza 11 dígitos
seguidos y el patrón `\d+-\d+`). Única excepción: la columna `expediente_concurso` de `concursos_colgados.csv` acepta
listas `EX-AAAA-NNNNNNNN | ...` (hasta 10 dígitos de número; con 11 o más se rechaza como posible CUIL).

| Cat | Qué es |
|---|---|
| a | Ocupado cruzado por ID SIAL Rol, sin diferencias |
| b | Ocupado cruzado con diferencias (prefijo/acrónimo, CR, sigla, puesto, especialidad, estado) |
| c | Ocupado del Excel sin ocupación viva en el sistema (crear) |
| d | Jefatura ENF-J / TEC-J / EG-J: segunda fila del par con el mismo ID SIAL Rol (crear vinculada al cargo base) |
| e | Fila sin ocupante (Concurso, Nunca levantado, Sin designar). Acción `reusar cargo del sistema` (con el cargo y la transición de estado en `motivo`) o `crear cupo` |
| f | Cargos candidatos al cupo: vacantes **vigentes** sin ocupante **y `validacion_vacante` sin ocupante**. Acción `reusar para cupo del Excel` (con `codigo_excel` de la fila) o `pasar a no_vigente` (sobrante) |
| g | Cargos con ocupante vivo cuyo ID SIAL Rol no está en el Excel (pasarían a no vigente) |
| h | Ya no vigentes / eliminados / `validacion_vacante` CON ocupación viva (informativo). Los `validacion_vacante` sin ocupante ya no están acá: pasaron a f |
| i | Ambigüedades: rol repetido, rol en cargo no vigente, cargo con más de una ocupación viva, `-TTR-`, colisiones de recodificación, clave legajo-rol duplicada o `id_sial_rol` mal formado en el sistema |
| j | Filas no resolubles contra catálogos (sigla fuera de `hospitales`, CR, puesto, especialidad) |

### Reuso por cupo y por expediente (e ↔ f)

Las filas e se emparejan con los cargos candidatos (f). Clave de cupo: sigla + acrónimo + puesto + especialidad.
Orden de preferencia (determinista; las filas del bloque Concurso eligen primero):

1. **Expediente** (prioridad sobre el cupo): un cargo con un concurso ACTIVO (regla única
   `apps/api/src/modules/cargos/concursoActivo.regla.ts`) cuyo expediente normalizado `EX-AAAA-NNNNNNNN` coincide con el de
   la fila. Primero dentro de la misma clave de cupo; si para ese expediente queda exactamente una fila y un cargo sin
   emparejar, se reusa aunque el cupo difiera (`motivo`: «el cupo difiere»; el cargo queda con los atributos del Excel).
2. **Cupo**, dentro de la misma clave, en este orden:
   a. fila del bloque Concurso: primero cargos con concurso activo; fila de otro bloque: primero cargos SIN concurso activo
      (esos quedan para las filas Concurso);
   b. cargo cuyo estado ya coincide con el del Excel (`Vigente` → `vigente`; `En validación` → `validacion_vacante`),
      así no hay transición de estado;
   c. más vínculos (bajas, concursos, solicitudes de alta): se evita dejarlos colgados de un cargo no vigente;
   d. menor código.

Criterio: mantener vivos los concursos activos y minimizar transiciones de estado. Es una elección de diseño sin
datos reales a mano: el resultado se puede auditar en `detalle_e.csv` / `detalle_f.csv` (`motivo`).

Estado final del cargo reusado = el del Excel mapeado al sistema; la transición se propone en `motivo`
(`transicion de estado validacion_vacante -> vigente`). Los candidatos sin fila e pasan a **NO VIGENTE**.

### concursos_sin_expediente.csv

Una fila por **concurso del Excel sin número de expediente**: filas del bloque `Concurso` (no `Ampliación`) que no traen
`EX-AAAA-...`. Columnas: `codigo_excel, sigla, acronimo, cr, literal_puesto, especialidad_cargo, detalle, tipo` (`detalle` es la
columna V del Excel; `tipo` es `CPH` para CR 37/22 y `CEETPS` para el resto). Es para que Jorge busque la información y complete
el expediente en el Excel. Sin datos personales (la celda `detalle` se valida: se rechaza si trae 11 dígitos seguidos o un legajo-rol).
`resumen.md` / `resumen.json` traen el total y el desglose CPH / CEETPS (`concursos_sin_expediente`, `fase2.concursos.sin_expediente_excel`).

**Comportamiento actual (se mantiene mientras Jorge no los complete):** para esas filas **no se crea concurso** (sin número no
se podrían reconocer en la corrida siguiente y se duplicarían); el cargo SÍ se crea o reusa como cualquier fila `Concurso`. Cuando
el Excel traiga el expediente, la corrida siguiente crea el concurso (queda en `fase2.concursos.crear_desde_excel`).
Nota: antes de este ajuste el resumen contaba estas filas dentro de «a crear» aunque no se creaban; ahora se cuentan aparte.

### Métrica de cierre

La ÚNICA métrica a vigilar: `vigente + validacion_vacante` proyectado == filas del Excel (53.064 en el corte 12-nov).
Proyectado = vigentes hoy + validacion_vacante hoy + a crear (c + d + e sin cargo) − vacantes vigentes sobrantes −
validacion_vacante sobrantes − g. Si no cierra, `resumen.md/json` reparte la diferencia por categoría
(`a_b`, `c`, `d`, `e`, `i_filas` y `sistema_sin_fila_excel`; suman la diferencia). «Solo vigente» queda como dato
secundario (los reusados quedan con el estado del Excel; se compara con las filas «Vigente» del Excel).

### concursos_colgados.csv

Para cada cargo vacante o `validacion_vacante` que el plan pasa a NO VIGENTE y que tiene concursos (CPH/CEETPS) u otros
vínculos: una fila por concurso (o una fila `sin concurso` si solo tiene bajas, solicitudes de alta, padrón o etiquetas).
Columnas: `cargo_codigo_sistema, estado_cargo, sigla, acronimo_propuesto, puesto, especialidad, tipo_concurso,
estado_concurso, sub_estado_concurso, activo, expediente_concurso, motivo_concurso, autorizado, expediente_en_excel,
fila_excel, otros_vinculos, revision`. `activo` sigue la regla única (estado activo y, si es `nuevo_cargo`, autorizado).
Si un concurso activo tiene un expediente que el Excel trae en otra fila, `revision` dice
`revisar: el Excel tiene este expediente en otra fila`. `resumen.md` trae los totales por tipo y por activo/no activo.
El snapshot lee los concursos con dos SELECT más (`concursos_cph`/`concursos_ceetps` + `concursos`), sin persona ni baja.

**Clave de cruce.** El Excel (columna N, `id_sial_rol` del CSV) trae `legajo-rol` (`999999999-9` o
`999999999-99`). `ocupaciones.id_sial_rol` del sistema trae `legajo-rol-cuil-rol`
(`999999999-9-99999999999-9`). La clave del sistema es `claveRolSial()` (`cruce.ts`): los dos primeros
segmentos separados por `-`, comparados contra el valor del Excel tal cual. Ambos lados se normalizan solo con
`trim`; no se tocan dígitos (no se quitan ceros a la izquierda). Un valor del sistema mal formado (menos de dos
segmentos o no numéricos) no cruza y se reporta en i. Si dos cargos vivos dan la misma clave (mismo
legajo-rol con distinto CUIL) se reportan ambos en i y el cruce usa el de menor id de cargo. La clave y el CUIL
nunca salen en ninguna salida.

Las categorías a, b, c, d, e y las filas de i que son del Excel particionan las filas del Excel; j y el resto
de i son diagnósticos adicionales.

## Corrida local sin base (para probar)

```bash
pnpm --filter @srrhh/api exec tsx scripts/sync-cargos-msgc/dry-run.ts \
  --input <nominal.csv> --sistema-json <fixture.json> --out <dir>
```

El fixture es un `SnapshotSistema` (ver `cruce.ts`); `{"cargos":[],"ocupaciones":[],"siglasHospital":[],"siglasOrganigrama":[],"codigosRegistro":[],"puestos":[],"especialidades":[]}` equivale a un sistema vacío.

## Fase 2 - Fase A: decisiones del 12-nov en el motor (sigue SOLO LECTURA)

- Equivalencias (`VERSION_EQUIVALENCIAS` 2026-11-msgc-2): SSAME -> SSSAME, UAIEAIT -> EAIT, las 15 `DGAH<sigla>` -> hospital (se saca `DGA`), ssapac -> SSAPAC. Solo queda SSSAME para crear.
- Puestos sucios (el CR nunca se toca): CR 87 "Enfermeria" -> puesto del concurso del sistema por expediente, o Enfermero Profesional con `revisionDato`; CR 87 "Tecnico de la Salud" -> Enfermero Profesional/ENF; CR 85 "Tecnico"/"Tecnico de la Salud" -> puesto del concurso (si no existe, a revisar, categoria j); CR 85 "Enfermeria" o sin puesto -> Auxiliar de Enfermeria/ENF.
- Etiqueta CEETPS "SI" (detalle termina en `/ SI`, CR 85/87), "Ampliacion" (cargo nuevo + concurso `nuevo_cargo` sin autorizar; nunca reusa un cargo del sistema), jefaturas con par (`cargoBaseId`) y vacantes -J sin par (sin cargo base, `revisionDato`).
- Concursos: solo quedan los del Excel (cruce por expediente normalizado). `resumen.json/md` seccion `fase2` informa conservar / eliminar / crear y expedientes repetidos (valido si es de baja o creacion, error si es de concurso, entra en la categoria i).
- Nuevo `conflictos_expediente.csv`: casos con dos numeros de expediente distintos (Excel vs sistema) para que Jorge elija.

## Modo escritura (Fase 2, FEAT-003): `sincronizar.ts`

> **ADVERTENCIA:** el generador de códigos con acrónimos MSGC NO debe activarse en producción antes que los datos
> recodificados: mezclaría prefijos viejos y nuevos. Hay un interruptor, `NOMENCLATURA_CODIGO_CARGO=legacy|msgc` (default
> `legacy`; ver `Doc/Desarrollo/DEPLOY_PRODUCCION.md` §8): la API usa el generador que diga la variable, la base nueva requiere
> `msgc`. **Este script usa SIEMPRE los acrónimos MSGC** (no lee la variable). Todo el modo escritura corre SOLO contra la copia local.

```
# Simulación (por defecto, no escribe): plan de la carga con el sistema leído en READ ONLY o desde un fixture
tsx scripts/sync-cargos-msgc/sincronizar.ts --input <nominal.csv> [--sistema-json <fixture.json>]
# Escritura (solo base LOCAL): exige las dos banderas y una DATABASE_URL local
tsx scripts/sync-cargos-msgc/sincronizar.ts --input <nominal.csv> --ejecutar --confirmo-base-local [--forzar-limpieza]
```

- `asegurarBaseLocal(DATABASE_URL)` se llama ANTES de abrir la conexión; neon.tech o un host no local abortan.
- Orden: limpieza (`limpieza.ts`, solo la primera vez; `--forzar-limpieza` la repite; borra también `kpis_dotacion_snapshot`)
  -> **escalafón CPH a código 37** (`escalafon.ts`, siempre; idempotente) -> carga (`cargar.ts`, aplica `ResultadoCruce.plan`)
  -> recodificación (`recodificar.ts`, en dos fases liberar/asignar por el índice único; el código viejo queda en `codigo_legacy`)
  -> recalcular `sub_estado` -> **regenerar `kpis_dotacion_snapshot`** (`kpisDotacion.ts`) -> verificación (`verificar.ts`) -> fila en `sync_corridas`.
- Escalafón CPH (`escalafon.ts`): `escalafones.codigo` `'22'` -> `'37'` y `escalafones.nombre` -> «Nueva Carrera Profesional Hospitalaria».
  Corre ANTES de la carga y la recodificación (la carga lee los catálogos ya actualizados). Los códigos de registro 22 y 37 siguen
  asociados (cuelgan de `escalafones.id`, que no cambia) y los cargos conservan su código de registro. Si ya está en 37 con el nombre
  nuevo no escribe; si existen el 22 y el 37 a la vez, o ninguno, aborta antes de cargar.
- KPIs (`kpisDotacion.ts`): `DELETE` + `INSERT ... SELECT` de la serie completa con el CTE `estadoActivoAcumuladoSql()` del sistema
  (`kpis.service.ts`, la misma fuente que `scripts/backfill_kpis_dotacion.sql` y el populate al aprobar un padrón): un punto por mes con
  padrón aprobado × código de registro del cargo × situación de revista + fila `(total)`. Como `padron_snapshots`, `padron_historico`,
  `padron_diff` y `ocupaciones` se conservan, la serie histórica se regenera completa; lo que cambia es el código de registro/cargo.
  Si no hubiera padrones aprobados la serie queda vacía. La verificación exige filas cuando hay meses con padrón aprobado.
- Los cargos creados llevan `origen = 'msgc'`: en la corrida siguiente el cruce los reconoce por cupo (filas c / d / ampliación) y no duplica.
- Concursos: solo se crean los del Excel con expediente (los que no tienen número no se pueden reconocer como "del Excel"); esos se
  listan en `concursos_sin_expediente.csv` del dry-run (ver arriba) y no generan concurso hasta que Jorge los complete.
- Requiere haber aplicado antes `prisma/migrations/20261116000000_sync_cargos_msgc_f2` en la copia local.
## Fase 2: modo escritura y salvaguardas (resumen)
Runbook completo, en orden (clonar Neon -> local, levantar, dry-run, respaldo, escribir, verificar, volver a Neon, paso a producción):
`.agents/tasks/sync-cargos-msgc/reporte-fase2.md`. Stack con la copia local: `docker compose -f docker-compose.yml -f docker-compose.localdb.yml up -d`
(Postgres 18 aparte `srrhh_postgres18`, base `srrhh_sync`, puerto 5434; no se combina con `docker-compose.override.yml`, que apunta a Neon).
Salvaguardas del modo escritura (`sincronizar.ts`):
- Sin banderas es simulación: no escribe. Escribir exige `--ejecutar` **y** `--confirmo-base-local`.
- `asegurarBaseLocal(DATABASE_URL)` corre antes de abrir la conexión: aborta con `neon.tech` en cualquier posición, hosts no locales o URL no parseable; nunca imprime la contraseña.
- Solo `limpieza.ts`, `kpisDotacion.ts` (importado únicamente por `repoPrisma.ts`) y `repoPrisma.ts` contienen sentencias de escritura; el dry-run, el reporte y el cruce no pueden invocarlos (lo verifican tests).
- La limpieza se ejecuta una sola vez (según `sync_corridas`); repetirla requiere `--forzar-limpieza`.
- Carga + recodificación + `sub_estado` van en una transacción; el escalafón y los KPIs van en transacciones propias (idempotentes). Después se verifica (cierre = filas del Excel, cero prefijos viejos, integridad, `sub_estado`, escalafón CPH en 37 con el nombre nuevo, `kpis_dotacion_snapshot` regenerado, segunda corrida en seco = 0).
- Respaldo `pg_dump` local antes de escribir (paso 4 del reporte). Requiere la migración `20261116000000_sync_cargos_msgc_f2` aplicada a mano en la copia local; nunca `migrate dev/deploy` contra Neon.
- El generador de códigos con acrónimos MSGC no debe activarse en producción antes que los datos recodificados (`NOMENCLATURA_CODIGO_CARGO`, default `legacy`).

## Re-copiar el script al contenedor y correr el dry-run sobre la base local (tras este ajuste)

Desde WSL, en la raíz del repo, con la copia local levantada (`docker compose -f docker-compose.yml -f docker-compose.localdb.yml up -d`) y el
worktree/rama `sync-msgc-f2-ajustes` (o `jorge` ya mergeada) como `WT`. Borrar el destino antes de `docker cp` (si no, anida la copia):

```bash
WT=/mnt/c/Desarrollo/SRH/SRRHH-Legacy/.worktrees/sync-msgc-f2-ajustes
RT=/mnt/c/Desarrollo/SRH/SRRHH-Legacy/.agents/tasks/sync-cargos-msgc/runtime
docker exec srrhh_api rm -rf /repo/apps/api/scripts/sync-cargos-msgc
docker exec srrhh_api mkdir -p /repo/apps/api/scripts/sync-cargos-msgc /tmp/sync-msgc/in /tmp/sync-msgc/out
docker cp "$WT/apps/api/scripts/sync-cargos-msgc/." srrhh_api:/repo/apps/api/scripts/sync-cargos-msgc/
docker cp "$RT/nominal_<corte>.csv" srrhh_api:/tmp/sync-msgc/in/ && docker cp "$RT/meta.json" srrhh_api:/tmp/sync-msgc/in/
docker exec -w /repo/apps/api srrhh_api pnpm exec tsx scripts/sync-cargos-msgc/dry-run.ts \
  --input /tmp/sync-msgc/in/nominal_<corte>.csv --out /tmp/sync-msgc/out
docker cp srrhh_api:/tmp/sync-msgc/out "$RT/resultado-<corte>-f2-ajustes"
```

El script no depende de código nuevo de `src/` ni de `@srrhh/types`: solo importa de `src/` lo que la imagen ya tiene
(`modules/cargos/concursoActivo.regla`, `shared/txOpts` y, únicamente en el modo escritura, `modules/kpis/kpis.service` para el CTE de
KPIs). Alcanza con re-copiar la carpeta del script; no hace falta reconstruir la imagen para el dry-run. (Para probar la API con la
base ya recodificada sí hay que reconstruirla, `... up -d --build api`, con `NOMENCLATURA_CODIGO_CARGO=msgc`.)

