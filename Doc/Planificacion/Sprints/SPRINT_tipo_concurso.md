# Sprint — Tipo/Motivo de Concurso (alta por baja / retención de cargo / cobertura de dotación)

> Plan acordado con Jorge (2026-10-29). Unifica el "tipo de concurso" en el enum `MotivoConcurso`,
> agrega **Retención de Cargo** como tercer tipo, lo propaga desde la baja al concurso, lo muestra
> en el encabezado del concurso, y codifica los concursos de retención con sufijo `-R-`.
> Backfill de datos lo corre Jorge en Neon; el código lo ejecuta un workflow.

---

## 1. Regla de negocio

Un concurso nace por uno de **3 motivos** (hoy el dropdown "Origen" del alta por baja solo tiene 2:
`Alta por Baja` y `Cobertura Dotación` — falta el tercero):

1. **Alta por baja** (`alta_por_baja`): se dio de baja a la persona que ocupaba el cargo; se concursa
   el cargo que quedó vacante. El concurso toma el cargo de la baja (código CPH normal).
2. **Retención de cargo** (`retencion_de_cargo`): el titular RETIENE su cargo (situación de revista
   "retención de cargo") y se concursa un **reemplazante**. El cargo del concurso conserva su propio
   número y se le inserta `-R-` → `CPH-POF-017530` ⇒ **`CPH-POF-R-017530`**. El cargo retenido NO se
   toca (sigue ocupado por el titular). Usa `prefijoRemplazante()` (ya existe en codigoCargo.ts).
3. **Cobertura de dotación** (`cobertura_dotacion`): el cargo estaba vacante (sin ocupante) y se llama
   a concurso para cubrirlo. Sin baja previa.

El tipo se elige al declarar la baja/alta (dropdown "Origen") y se **lleva al concurso** que se genera.

---

## 2. Decisiones de diseño

- **D1 — Fuente de verdad: enum `MotivoConcurso`.** Se extiende a los 3 valores de negocio. El dropdown
  de la baja escribe ahí. Se deja de usar el string libre `Concurso.origen` como fuente de tipo (se
  puede conservar para trazabilidad de la carga, pero la lógica lee el enum).
  - Enum actual: `{ nuevo_cargo, alta_por_baja }`. Nuevo: agregar `retencion_de_cargo`, `cobertura_dotacion`.
    `nuevo_cargo` se conserva (no romper datos/código que lo usen; revisar si tiene uso real).
- **D2 — Código `-R-` para retención.** Al generar un concurso de retención, el código del cargo del
  concurso se deriva con `prefijoRemplazante(prefijo, 'R')` → inserta `-R-` antes del secuencial.
  Conserva el número propio del concurso. (No es el número del cargo retenido.)
- **D3 — Backfill por inferencia** (regla confirmada con Jorge, medida en Neon 2026-10-29):
  - `retencion_de_cargo`: el cargo de la baja asociada está ocupado hoy con `situacion_revista`
    que contiene "retencion". → **2 concursos CPH** (Duek `CPH-POF-017530`, Rissi `CPH-POF-017548`).
  - `alta_por_baja`: tiene baja asociada (ee_baja matchea una fila en `bajas`). → **581 CPH**.
  - `cobertura_dotacion`: sin baja. → **648 CPH + 392 CEETPS = 1040**.
  - Total: 1229 CPH + 392 CEETPS = 1621.
- **D4 — Renombrar `-R-` en el backfill**: los 2 de retención se recodifican a `CPH-POF-R-017530` y
  `CPH-POF-R-017548` (verificar colisión; no debería haber). Volumen trivial (2 casos), sin riesgo.

---

## 3. Alcance de desarrollo (workflow)

### Backend
1. **Migración Prisma**: extender enum `MotivoConcurso` con `retencion_de_cargo` y `cobertura_dotacion`
   (ALTER TYPE ... ADD VALUE, idempotente, estilo migración manual del repo). NO ejecutar contra DB.
2. **Propagar el tipo**: el flujo de alta por baja (NuevaBajaPage → endpoint de baja/concurso) guarda el
   `motivoConcurso` elegido en el `Concurso`. Encontrar dónde se crea el concurso desde la baja.
3. **Codificación `-R-`**: al crear un concurso de `retencion_de_cargo`, derivar el código con
   `prefijoRemplazante()`. Ubicar la generación de código del cargo del concurso.

### Frontend
4. **Dropdown Origen**: agregar "Retención de Cargo" en NuevaBajaPage (hoy: Alta por Baja / Cobertura
   Dotación). Mapear a `MotivoConcurso`.
5. **Badge de tipo en el encabezado del concurso**: en el detalle del concurso (CPH y CEETPS) mostrar un
   badge con el tipo (Alta por baja / Retención de cargo / Cobertura de dotación), al lado de los badges
   de estado/sub-estado existentes.

### Verificación
- Builds `pnpm --filter @srrhh/api build` y `pnpm --filter @srrhh/web build` en verde.
- NO ejecutar nada contra la DB. El backfill lo corre Jorge.

---

## 4. Backfill (SQL, lo corre Jorge en Neon — dejar escrito, NO ejecutar)

Siguiendo D3: poblar `concursos.motivo_concurso` (y/o el campo que corresponda en concursos_cph/ceetps
según dónde viva el tipo — confirmar en implementación) con el tipo inferido, y renombrar el código de
los 2 concursos de retención a `-R-`. Archivo: `apps/api/scripts/backfill_tipo_concurso.sql`.

Orden:
1. `retencion_de_cargo` (los 2 con ocupación "retención de cargo" en la baja asociada).
2. `alta_por_baja` (con baja asociada, excepto los ya marcados retención).
3. `cobertura_dotacion` (el resto, sin baja).
4. Renombrar código de los 2 de retención: `CPH-POF-017530` → `CPH-POF-R-017530`,
   `CPH-POF-017548` → `CPH-POF-R-017548` (verificar colisión antes).

---

## 5. Relación con los 62 casos de revisión manual

- **Grupo A1 (39 pares SG/RES↔CPH)**: son concursos cuyo cargo quedó mal codificado; la baja da el
  código y carrera CPH correctos. Se resuelven como la Parte A (repuntar al cargo de la baja). NO son
  parte de este sprint de "tipo" — son corrección de código/cargo, se tratan aparte.
- **Grupo A2 (2 retención, Duek/Rissi)**: SON los 2 concursos de retención de este sprint. Al aplicar
  D2/D4 quedan con código `-R-`.
- **Grupo B (3 con designado)**: Garcia Gomez (alta por baja, de Finkelstein CUIL 20308595278),
  Peralta y Palenque Ocampo (cobertura de dotación). Son casos de "designado que falta impactar en la
  dotación" — se tratan en el flujo de designación, no en este sprint de tipo.
