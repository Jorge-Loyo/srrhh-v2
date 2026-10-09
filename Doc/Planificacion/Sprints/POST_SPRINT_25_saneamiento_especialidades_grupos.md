# POST-SPRINT 25 — Saneamiento de especialidades, grupos y fixes de pipeline del padrón

**Fecha:** 2026-10 | **Rama:** `jorge` (sin push)
**Commits:** `cb41bf4` … `7b9ccc1` (ver tabla al final)

Sesión larga de saneamiento de datos de dotación + fixes del pipeline del
padrón + nueva estructura de **grupos de especialidad** transversales. Todo el
trabajo de datos se aplicó directo en la BD (con tablas de respaldo
`tmp_bk_*`), y los fixes de lógica quedaron commiteados en `jorge`.

---

## 1. "Escalafón" → "Carrera" en la UI (S25)

Reemplazo del término **Escalafón** por **Carrera** en toda la UI visible
(~28 archivos del front), incluyendo textos de ayuda. NO se tocaron nombres de
datos ("Escalafón General"), variables ni código. Commits `cb41bf4`, `88082fe`.

Nuevo filtro **Código de registro** en cascada de catálogo (Personas/Cargos):
se agregó el nivel `codigoRegistroId`. Commit previo `78d7839`.

---

## 2. La especialidad del cargo sigue al último SIAL (regla "vacío = conservar")

**Regla de negocio (Jorge):** la especialidad del cargo = la **última** del
SIAL. Si el SIAL trae la especialidad **vacía**, se **conserva** la anterior (no
se borra). Si no hay anterior, se usan los recursos disponibles (CSV RRHH,
derivación por puesto).

| Commit    | Qué                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1f9aaab` | La especialidad del cargo sigue a la última del SIAL (bug Vilariño: el legacy cambiaba pero la FK quedaba congelada).                                                |
| `6ae26dc` | "vacío = conservar": si el SIAL trae especialidad vacía para un cargo que ya tenía una, NO se re-resuelve. + equivalencias de nombre.                                |
| `af281a7` | `SIN ESPECIALIDAD` del SIAL se trata como vacío (no se crea especialidad basura). + re-resolver puesto cuando cambia el literal en la MISMA carrera (caso Lombardo). |

**`EQUIVALENCIAS_ESPECIALIDAD`** (en `apps/api/src/modules/padron/resolverPuestoCargo.ts`)
— fusiones de nombre que el SIAL sigue trayendo y no deben deshacerse import a
import. Agregadas esta sesión: `obstetrica → obstetricia` (`600441c`), además de
las de pediatría/psicología/bioquímica/antropología/biología ya existentes.
`especialidadSialReal()` normaliza `SIN ESPECIALIDAD`/`(sin especificar)`/`s/e`
a NULL.

**Datos aplicados:** sincronización SIAL de especialidad en CPH (66 cargos
cambiados al último SIAL; 37 conservados por SIAL vacío); asignaciones por CSV
RRHH y padrón octubre de sesiones previas.

---

## 3. Reclasificación de carrera por código de registro

**Regla:** el **código de registro MANDA** sobre el escalafón. Si el nuevo
cód. registro pertenece a otro escalafón, el cargo cambió de carrera y se
re-resuelve escalafón + puesto + especialidad + se regenera el código con el
prefijo correcto (caso Giordano: suplente de guardia → CPH). Commit `c242e19`.

---

## 4. Cargos FANTASMA de jefatura (J Cat vacío)

**Regla de negocio (Jorge):** un cargo de **jefatura** (conducción) es válido
solo si tiene **J Cat** (`ocupaciones.codigo_jefaturas`) con valor. Si una
persona tiene dos cargos del mismo puesto de conducción —uno con J Cat (real) y
otro sin (fantasma)— el fantasma es un **error del SIAL** que no debe verse.

- **Datos:** 12 cargos fantasma detectados y deshabilitados (`estado=no_vigente`
  - ocupación cerrada). Respaldo `tmp_bk_fantasmas_jcat`. Casos: Charabora,
    Hernández, Pandullo, Indart, González Montaner, Marchetto, Braun, Neira,
    Jolis, Aquije, González Fernando, Merino.
- **Vista** (`f35f628`): `EXCLUIR_ESPEJO_JEFATURA` en `/dotacion` y KPIs se
  relajó — ya NO exige `codigo_repa` idéntico (el SIAL crea el fantasma con repa
  que difiere 1-2 dígitos). Basta mismo `literal_puesto` + hermano con J Cat.
- **Pipeline** (`ee0f3fa`): paso **6d** en `aprobarSnapshotService` — pasada
  idempotente al final del import que marca `no_vigente` + cierra la ocupación
  de todo fantasma de jefatura, antes del histórico (paso 7) y el KPI (paso 8).
  Verificado: solo toca duplicados con hermano; los ~2466 cargos de conducción
  sin J Cat SIN hermano (jefaturas reales sin el dato) NO se tocan.

**Jefes sin J Cat por error (pendiente):** Martinez Montes (`001065730-3`) y
Porporato (`001010964-3`) son jefes de unidad reales a los que el SIAL no les
puso J Cat → NO aparecen en el gráfico. Caso inverso al fantasma. **Sin
resolver** (ver §9).

---

## 5. Modalidad POU/POF — el literal del puesto manda

**Bug:** `modalidadDeUnificador` derivaba la modalidad solo del
`unificador_puesto`; con unificador vacío caía a POF. Un cargo "de guardia" con
unificador vacío quedaba POF y creaba/resolvía un puesto POF duplicado.

- **Pipeline** (`770b7df`): la función ahora también mira el **literal del
  puesto** — si contiene "guardia", es POU. Misma regla que
  `codigoCargo.prefijoDeCargo`.
- **Datos:** 4 cargos "especialista en la guardia medico" mal clasificados POF
  → movidos al puesto POU correcto; puesto POF duplicado desactivado.

**Puesto genérico "farmaceutico"** (`6046aeb`): no debe existir (solo
planta/guardia). `canonicalizarLiteralPuesto` resuelve el literal genérico
"farmaceutico" a "farmaceutico de planta" (POF) o "...de guardia" (POU) según
modalidad. Datos: 2 puestos genéricos desactivados tras reubicar sus cargos.

**Veterinario de guardia CPH:** no existe en CPH → puesto desactivado (vacío).
El de Salud-Guardias (1 cargo, suplencia real del SIAL) se respeta.

---

## 6. Dedup de la serie de Evolución (suplencia de guardia)

**Bug (Pratto/Kirsch):** el dedup colapsaba una fila por (persona, repa, puesto)
y elegía el representante por `id_sial_rol` ascendente. Cuando una persona tiene
su cargo fijo (CPH) + una **suplencia de guardia** (SG, escalafón
"Salud - Guardias") del mismo literal/repa, el SG podía ganar y la persona
quedaba fuera del conteo CPH (daba 3276 en vez de 3278).

**Fix** (`2d8a30b`): el `ORDER BY` de ambos dedups (serie + export de
`kpis.service.ts`) prioriza "no es `SG-%`" primero → el cargo fijo siempre gana.
La suplencia de guardia es una **habilitación**, no el cargo de la persona.

Otros fixes de Evolución de la sesión: `2d6888e` (bajas con id_sial_rol largo),
`464463f` (mes en curso en vivo), `8e760fa` (serie = export), `73527a2` (todos
los meses con 0).

---

## 7. GRUPOS de especialidad (jerarquía grupo → sub-especialidad)

**Decisión (Jorge):** NO reescribir las especialidades existentes; agregar una
columna `especialidades_puesto.grupo` (NULL = sin grupo) que actúa de
**agrupador padre** transversal a los puestos. Criterio: solo se agrupa cuando
hay **varias especialidades afines**; una especialidad única grande
(anestesiología, oftalmología) queda suelta. Migración
`20261009000000_especialidad_grupo` (`6b4c0f4`).

**Filtro "Grupos"** en Evolución (`efe2cf8`) + facetado en vivo / aplicar manual
(`0ef4bd8`) + **filtro de grupo también en `/dotacion`** (`7b9ccc1`, dimensión
`grupoEspecialidad`, combinable y con facetado como las demás).

**28 grupos** definidos y consistentes (misma especialidad = mismo grupo en
todos los puestos, por pasada de consistencia transversal):

Alergia e Inmunología, Anatomía Patológica, Bacteriología, Bioquímica,
Bioquímica Clínica, Cardiología, Cirugía, Clínica Médica, Dermatología,
Diagnóstico por Imágenes, Farmacia, Fisiatría, Fonoaudiología,
Gastroenterología, Hemoterapia, Infectología, Kinesiología, Microbiología,
Neurología, Nutrición, Odontología, Oncología y Hematología, Ortopedia y
Traumatología, Pediatría y Neonatología, Salud Mental, Terapia Intensiva,
Tocoginecología, Trabajo Social.

Puestos agrupados: especialista en la guardia medico, jefe de departamento (02),
jefe de division (04), jefe de unidad (05), medico de planta, farmacéutico
planta/guardia, kinesiólogo, fonoaudiólogo, psicólogo, odontólogo, obstétrica,
profesional guardia medico — todos vía la pasada transversal por nombre.

**Pendiente de pipeline:** los grupos son mantenimiento MANUAL. Si un import
trae una especialidad nueva, entra SIN grupo. No hay herencia automática de
grupo por nombre en el pipeline (ver §9).

---

## 8. Correcciones puntuales de datos

| Caso                          | Qué                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Lombardo (`001778303-2`)      | puesto psicólogo→bioquímico (congelado), re-apuntado a bioquimico de planta + esp bioquimico.                                  |
| 5 cargos CPH puesto desfasado | asistente social / kinesiólogo / obstetra / odontólogo / psicólogo de planta re-apuntados al puesto correcto.                  |
| 48 extranjeros                | DNI viejo (≥92M, provisorio) → DNI nuevo (~19M) + CUIL recalculado, matcheados por id_sial. Respaldo `tmp_bk_dni_extranjeros`. |
| Medrano                       | puesto "farmaceutico" → "farmaceutico de planta".                                                                              |
| Audino (`001730162-1`)        | psicólogo con especialidad "cardiologia" (error SIAL) → Psicologia. **Puntual; el SIAL puede revertirlo.**                     |
| Obstétrica                    | fusión obstetrica → obstetricia (401 cargos).                                                                                  |

---

## 9. Pendientes / a evaluar

1. **Jefes sin J Cat por error del SIAL** (Martinez Montes, Porporato): son
   jefes reales que no aparecen en el gráfico porque el SIAL no les cargó J Cat.
   Falta decidir cómo distinguirlos del fantasma (hoy el J Cat vacío los oculta
   si tienen hermano; sin hermano, el conteo de jefes puede no reflejarlos).
2. **Herencia de grupo en el pipeline:** que una especialidad nueva (o re-creada)
   herede el `grupo` de otra con el mismo nombre, para no desarmar la
   consistencia transversal en cada import.
3. **Casos "error del SIAL" puntuales** (Audino psicólogo/cardiología): se
   corrigen a mano y el import puede revertirlos. Idealmente corregir en la
   fuente (SIAL). Evaluar un mecanismo de "overrides" persistentes.
4. **Puesto resuelto desde catálogo en el combo de Evolución:** hoy el combo de
   Puesto se arma del texto `padron_historico.literal_puesto` (no del catálogo),
   así que literales viejos siguen apareciendo hasta corregir el histórico
   (se hizo puntual para "farmaceutico"). Evaluar resolver desde el catálogo del
   cargo (como ya hace la especialidad).
5. **~1191 cargos CPH sin especialidad** restantes (médicos genéricos de guardia
   no derivables, correcto que queden sin esp; revisar los que sí tengan fuente).

---

## 10. Entorno y convenciones de la sesión (para retomar)

- BD: `docker exec -i srrhh_postgres psql -U srrhh_user -d srrhh_db`. SQL
  complejo vía archivo en `services/dotaneitor/tmp/*.sql` (gitignoreado) +
  `psql -f /dev/stdin < archivo`.
- Scripts TS: `docker exec -w /repo/apps/api srrhh_api pnpm exec tsx src/_tmp/X.ts`
  (src bind-mounteado; `src/_tmp/` se borra al terminar).
- API corre con `tsx watch` → toma cambios de `src/` automáticamente.
- Typecheck: back `cwd apps/api && pnpm exec tsc --noEmit | grep -v __tests__`;
  front `cwd apps/web && pnpm exec tsc --noEmit`.
- Respaldos de datos: tablas `tmp_bk_*` en `srrhh_postgres` (persisten).

---

## 11. Tabla de commits (rama `jorge`)

| Commit    | Resumen                                                         |
| --------- | --------------------------------------------------------------- |
| `cb41bf4` | Escalafón → Carrera en UI                                       |
| `88082fe` | Carrera en textos de ayuda                                      |
| `2d6888e` | Evolución: bajas con id_sial_rol largo                          |
| `1f9aaab` | especialidad sigue al SIAL                                      |
| `c242e19` | reclasificar carrera por cód. registro                          |
| `464463f` | Evolución: mes en curso en vivo                                 |
| `8e760fa` | Evolución: serie = export (dedup)                               |
| `73527a2` | Evolución: todos los meses con 0                                |
| `6ae26dc` | vacío = conservar + equivalencias                               |
| `6b4c0f4` | columna grupo + agrupación bioquímica                           |
| `efe2cf8` | filtro Grupos en Evolución + aplicar manual                     |
| `0ef4bd8` | facetado en vivo                                                |
| `af281a7` | re-resolver puesto misma carrera + SIN ESPECIALIDAD=vacío       |
| `f35f628` | excluir fantasma de jefatura aunque difiera repa                |
| `ee0f3fa` | normalizar cargos fantasma de jefatura en cada import (paso 6d) |
| `770b7df` | modalidad POU desde el literal de guardia                       |
| `2d8a30b` | dedup Evolución no elige suplencia SG                           |
| `6046aeb` | canonizar literal genérico "farmaceutico"                       |
| `600441c` | fusionar obstetrica → obstetricia                               |
| `7b9ccc1` | filtro grupo de especialidad en /dotacion                       |
