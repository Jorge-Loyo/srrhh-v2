# Sprint — Vinculación baja ↔ concurso (quién se fue de baja)

> Plan acordado con Jorge (2026-10-30). Objetivo: que TODO concurso CPH con expediente
> de baja cargado (`ee_baja`) tenga identificada correctamente la persona que se fue.
> Base: investigación read-only en `.agents/tasks/vinculacion-baja-concurso/findings.md`
> + medición de cobertura real hecha el 2026-10-30 (ver §2).
>
> El backfill (datos) lo corre Jorge en Neon con dry-run previo. El código (si hace falta)
> por workflow. NO ejecutar nada contra la DB sin dry-run + validación.

---

## 1. Problema y causa raíz

**Problema:** 725 concursos CPH tienen `ee_baja` (texto) pero `concursos.baja_id = NULL` → el sistema
no sabe quién dejó el cargo. El encabezado del wizard no muestra la persona de la baja.

**Causa raíz (confirmada):** el script `apps/api/scripts/carga-concursos/cargar-concursos.ts` creó
los concursos con `bajaId: null` (líneas 589, 662) y guardó el expediente solo como texto en
`ConcursoCph.eeBaja` (599). El `cuil_baja` del Excel quedó solo como traza de auditoría, nunca creó
la `Baja` ni vinculó `Persona`. No existe puente baja SIAL → baja formal (bajas-sial solo aprueba
snapshots, no crea filas en `bajas`).

**El fix de visualización YA está en producción** (commit 90bbb7d): el wizard lee
`concurso.baja.persona` (apellidoNombre + CUIL). Basta crear/vincular la `Baja` con `persona_id`
para que se vea quién se fue. No requiere más cambios de front/back para el dato.

---

## 2. Cobertura real medida (2026-10-30)

Cruce del mapa `ee_baja → CUIL` de los CSV (`Doc/Referencias/Concursos/CONTABILIZACION CARGOS - *.csv`,
1220 pares únicos con CUIL válido) contra los concursos sin baja formal:

| Grupo | Cantidad | % |
| --- | --- | --- |
| **Universo** (concursos con ee_baja, sin baja formal) | **725** | 100% |
| Resueltos por CSV (ee_baja normalizado → CUIL) | **549** | 76% |
| — persona ya existe en `personas` (vincula directo) | 392 | |
| — persona a CREAR (histórica, no está) | 157 | |
| Sin match en CSV | 176 | 24% |
| — de esos, con ocupación cerrada (vía respaldo) | **0** | |

**Conclusiones de la medición:**
- El CSV resuelve el 76%. Es la vía principal.
- La vía de respaldo (última ocupación cerrada del cargo) **NO aporta nada** (0 de 176): son bajas
  viejas de personas que nunca estuvieron en el padrón del sistema.
- Los 176 sin CSV **no tienen fuente automática** de quién se fue → carga manual por RRHH o baja
  con `persona_id = null`.

---

## 3. Estrategia de vinculación

Para cada uno de los 549 resueltos por CSV:
1. **Resolver CUIL + nombre** del mapa CSV (normalizando `ee_baja` al patrón `EX-AÑO-NÚMERO`:
   el CSV trae sufijo `- -GCABA-SIGLA`, la BD guarda el núcleo).
2. **Upsert Persona por CUIL** (`@unique`): si no existe, crear histórica con `apellidoNombre`
   (del CSV), `cuil`, `numeroDoc` si está, `activo = false`. Idempotente. Descartar CUILs sin
   verificador válido (no crear persona basura).
3. **Enriquecer** motivo/fecha/resolución desde `baja_sial_registros` por CUIL (vía SIAL) cuando exista.
4. **Crear la `Baja`** con insert DIRECTO (NO `createBajaService`):
   - `cargoId`, `hospitalId` (del cargo/concurso), `personaId`, `fechaBaja` (del CSV/SIAL),
     `eeBaja` (normalizado), `motivo`, `docRespaldatoria`, `tipificadorOrigen = 'Backfill vinculacion 725'`,
     **`generaConcurso = false`**, **`estado = 'confirmada'`**.
   - NO tocar `cargo.estado` ni recrear concurso (ya tienen el suyo).
5. **Vincular** `UPDATE concursos SET baja_id = <nuevaBaja> WHERE id = <concursoId del ConcursoCph>`
   (la FK vive en `concursos.baja_id`, NO en `concursos_cph`).

Para los 176 sin CSV: reportarlos aparte (listado cargo + ee_baja) para que RRHH complete el CUIL.
Opcional: crear la baja con `persona_id = null` para dejar registrado el expediente (el header
mostraría "—" hasta que se complete la persona).

---

## 4. Diseño del backfill (idempotente, con dry-run)

**Forma:** script/SQL manual que corre Jorge en Neon (NO por UI — la UI crea de a una y dispara
efectos colaterales). Dos variantes posibles, decidir en implementación:
- (a) Script Node/TS que lee los CSV, arma el mapa, y hace los upsert/insert vía Prisma (como
  `cargar-concursos.ts`). Ventaja: maneja la normalización y el CSV en código. Desventaja: tsx/esbuild
  falla desde WSL en el repo base (correr dentro del container `srrhh_api` o generar SQL).
- (b) Script Python (lee CSV) que GENERA un `.sql` idempotente con los INSERT/UPDATE, que Jorge
  corre con dry-run (BEGIN … ROLLBACK para ver conteos, luego COMMIT). Ventaja: es el patrón que ya
  usamos en esta sesión, SQL revisable. **Recomendada.**

**Idempotencia:** dedupe por `(cargoId, eeBaja normalizado)` — si ya existe una baja con ese par,
re-vincular / completar `personaId` en vez de insertar otra. Re-ejecutable sin duplicar.

**Dry-run obligatorio:** reportar antes de COMMIT: bajas a crear, personas a crear, concursos a
vincular, CUILs inválidos descartados, y los 176 sin resolver.

**Orden del backfill:**
1. Crear personas históricas faltantes (157).
2. Crear las 549 bajas (insert directo).
3. Vincular `concursos.baja_id`.
4. (Opcional) enriquecer motivo/fecha desde SIAL.
5. Chequeo post: `concursos con ee_baja sin baja_id` debería bajar de 725 a ~176.

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Crear 549 bajas + 157 personas en producción | Dry-run con rollback; backup; lo corre Jorge manual |
| Re-disparar concursos / mover estado del cargo | Insert DIRECTO, `generaConcurso=false`, NO usar createBajaService, NO tocar cargo.estado |
| Personas históricas duplicadas | Upsert por `cuil` (@unique); descartar CUIL sin verificador |
| EE no cruza por el sufijo del CSV | Normalizar a `EX-AÑO-NÚMERO` (regex) antes de comparar |
| Falta de idempotencia en re-runs | Dedupe por `(cargoId, eeBaja normalizado)` |
| `baja_id` en tabla equivocada | FK es `concursos.baja_id` (base), NO `concursos_cph` |
| Persona sin CUIL resoluble (176) | Reportar aparte; baja con `persona_id = null` o manual |

---

## 6. Verificación

- Post-backfill: `SELECT count(*) FROM concursos_cph cc JOIN concursos c ON c.id=cc.concurso_id
  WHERE cc.ee_baja IS NOT NULL AND c.baja_id IS NULL;` → debería dar ~176 (los sin CSV).
- Spot-check visual: abrir 2-3 de los concursos vinculados en el wizard → el encabezado muestra
  la persona de la baja con CUIL.
- No romper: `pnpm --filter @srrhh/api test` (vitest bajas + carga-concursos).

---

## 7. Fuera de alcance / follow-up

- Los 176 sin dato automático: definir con RRHH si se cargan a mano o se dejan con baja sin persona.
- Puente formal baja SIAL → baja formal (hoy no existe): si se quiere que las bajas SIAL generen
  bajas formales automáticamente a futuro, es otro sprint.
- `Cargo.sub_estado` en runtime en el resto del import del padrón (follow-up del Paso 2).
