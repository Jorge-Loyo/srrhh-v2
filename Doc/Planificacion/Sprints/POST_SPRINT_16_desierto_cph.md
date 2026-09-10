# POST-SPRINT 16 — Corrección modelo Desierto CPH

**Estado:** ✅ Completado — commits `348a466`, `957acc7`
**Fecha:** 2026-09
**Autor:** Jorge (backend) + Agustín (frontend)
**Rama:** `jorge`

---

## Problema

El modelo anterior trataba `desierto` como un **estado terminal** del enum `EstadoConcursoCph`
(igual que `finalizado`). Esto era incorrecto: en la práctica administrativa, un concurso
declarado desierto **no se cierra** — se relanza con una nueva disposición de llamado y
vuelve a abrir inscripciones. Puede declararse desierto múltiples veces antes de que
alguien gane.

### Comportamiento real del proceso

```
ACTIVO
  └─ C-DISPO DE LLAMADO
       └─ D-EXAMEN PUBLICADO
            └─ sin postulantes → Q-DESIERTO (sub-estado, no estado terminal)
                 ├─ Se relanza → nueva dispo de llamado → vuelve a C-DISPO DE LLAMADO
                 │   (puede repetirse N veces)
                 └─ Se decide no continuar → suspendido = true (flag ya existente)

FINALIZADO → único cierre real: resolucionDesignacion
SUSPENDIDO → flag suspendido = true (reversible, puede reactivarse)
```

---

## Decisiones de diseño

### 1. `desierto` deja de ser un estado del enum

`EstadoConcursoCph` pasa de 5 valores a 4:
- ~~`desierto`~~ — eliminado
- `no_iniciado`, `activo`, `finalizado`, `suspendido` — se mantienen

`Q-DESIERTO` sigue existiendo como **sub-estado** (campo `subEstado`). Es el indicador
de que el último llamado no tuvo postulantes. No bloquea el concurso.

### 2. Nueva tabla `ConcursoCphDesierto` — historial de rondas desiertas

Cada vez que se declara desierto, se guarda un snapshot de todos los campos relevantes
de esa ronda antes de limpiarlos. Así se puede ver el historial completo de cuántas
veces fue desierto y qué datos tenía cada ronda.

### 3. Campos que se limpian al declarar desierto

| Campo | Motivo |
|-------|--------|
| `sorteoJurado` | El jurado puede cambiar en el nuevo llamado |
| `disposicion` | Nueva dispo de llamado para el relanzamiento |
| `fechaInscDesde` | Nueva inscripción |
| `fechaInscHasta` | Nueva inscripción |
| `fechaExamen` | Nuevo examen |
| `fechaOrdenMerito` | Nuevo orden de mérito |
| `qInscriptos` | Nuevo conteo |
| `eeDesignacion` | Nueva etapa de designación |
| `cargaDocumentacion` | Nueva etapa |
| `fechaAptoMedico` | Nueva etapa |
| `fechaIte` | Nueva etapa |
| `proyectoResolucion` | Nueva etapa |
| `resoALaFirma` | Nueva etapa |
| `resolucionDesignacion` | Nueva etapa |
| `fechaResolucion` | Nueva etapa |
| `cargoSial` | Nueva etapa |

### 4. Campos que se conservan al declarar desierto

| Campo | Motivo |
|-------|--------|
| `eeBaja`, `fechaBaja` | La baja original no cambia |
| `eeConcurso`, `fechaEeConcurso` | El expediente del concurso sigue vigente |
| `fechaAutorizacion` | La autorización original sigue vigente |
| `especialidadSolicitada`, `puestoSolicitado` | El puesto a cubrir no cambia |
| `ifacs`, `insal`, `fechaIfacs`, `fechaInsal` | Informes previos se conservan |
| `dispoDesierta`, `fechaDispoDesierta` | Referencia al último desierto (historial completo en tabla nueva) |
| `cantidadCargos`, `observaciones` | Datos generales del concurso |

### 5. Migración de datos existentes

Los concursos que tenían `estado = 'desierto'` en la BD se migraron a:
- `estado = 'activo'`
- `suspendido = true`

Así quedan correctamente representados: el proceso no terminó, pero está en pausa
esperando decisión administrativa.

---

## Tareas

| # | Tarea | Dev | Est. | Estado |
|---|-------|-----|------|--------|
| PS16D-1 | Schema Prisma: nueva tabla `ConcursoCphDesierto`. Migración SQL manual: eliminar valor `desierto` del enum, actualizar filas existentes, recrear índice parcial, crear tabla historial | Jorge | 2h | ✅ `348a466` |
| PS16D-2 | Fix `calcConcursoCph`: `Q-DESIERTO` ya no produce `estado = desierto`. Actualizar `EstadoConcursoCphCalc` | Jorge | 1h | ✅ `957acc7` |
| PS16D-3 | Endpoint `POST /concursos-cph/:id/declarar-desierto` — guarda snapshot en `ConcursoCphDesierto`, limpia campos de la ronda, pone `suspendido = true`, sub-estado queda `Q-DESIERTO` | Jorge | 2h | ✅ `957acc7` |
| PS16D-4 | Fix guards en `suspenderConcursoCphService` y `designarConcursoCphService`: eliminar el bloqueo por `estado === 'desierto'` | Jorge | 0.5h | ✅ `957acc7` |
| PS16D-5 | Actualizar `packages/types`: eliminar `DESIERTO` de `EstadoConcursoCph`, agregar `ConcursoCphDesierto`, `DeclararDesiertoRequest` | Jorge | 0.5h | ✅ `957acc7` |
| PS16D-6 | Frontend Wizard CPH: reemplazar etapa "Desierto (si aplica)" por panel "Declarar desierto" — botón + modal (`dispoDesierta` + `fechaDispoDesierta` + `observaciones`) + historial de rondas | Agustín | 4h | ✅ `957acc7` |
| PS16D-7 | Frontend labels: `estadoBadge`/`estadoLabel` con lógica `Q-DESIERTO`. `ConcursosCphPage` usa las nuevas funciones | Agustín | 1h | ✅ `957acc7` |
| PS16D-8 | Verificación end-to-end: declarar desierto → ver historial → reanudar → avanzar sub-estados → designar | Jorge + Agustín | 2h | ⏳ pendiente (junto con S16-9) |

**Total estimado**: ~13h

---

## Migración aplicada

Patrón usado (shadow database roto — falta `TipoAutorizacion`):

```bash
# 1. Registrar la migración como aplicada en _prisma_migrations
npx prisma migrate resolve --applied 20260922000000_ps16d_desierto_cph

# 2. Ejecutar el SQL de la migración principal
npx prisma db execute --file prisma/migrations/20260922000000_ps16d_desierto_cph/migration.sql \
  --url "postgresql://srrhh_user:srrhh_pass@localhost:5433/srrhh_db"

# 3. Ejecutar el SQL del índice parcial (debe ir fuera de la transacción principal)
npx prisma db execute --file prisma/migrations/20260922000000_ps16d_desierto_cph/fix_index.sql \
  --url "postgresql://srrhh_user:srrhh_pass@localhost:5433/srrhh_db"
```

### Secuencia SQL para eliminar un valor de enum en PostgreSQL

```sql
-- 1. DROP INDEX dependiente del enum
DROP INDEX IF EXISTS "concursos_cph_cargo_abierto_unique";

-- 2. Migrar filas con el valor a eliminar
UPDATE concursos_cph SET estado = 'activo', suspendido = true
  WHERE estado = 'desierto';

-- 3. DROP DEFAULT que usa el enum
ALTER TABLE concursos_cph ALTER COLUMN estado DROP DEFAULT;

-- 4. Cambiar columna a text temporalmente
ALTER TABLE concursos_cph ALTER COLUMN estado TYPE text
  USING estado::text;

-- 5. DROP TYPE viejo
DROP TYPE "EstadoConcursoCph";

-- 6. CREATE TYPE nuevo sin el valor eliminado
CREATE TYPE "EstadoConcursoCph" AS ENUM ('no_iniciado','activo','finalizado','suspendido');

-- 7. Volver a castear la columna al nuevo enum
ALTER TABLE concursos_cph ALTER COLUMN estado TYPE "EstadoConcursoCph"
  USING estado::"EstadoConcursoCph";

-- 8. Restaurar DEFAULT
ALTER TABLE concursos_cph ALTER COLUMN estado SET DEFAULT 'no_iniciado'::"EstadoConcursoCph";

-- 9. Crear tabla historial
CREATE TABLE concursos_cph_desiertos ( ... );
```

```sql
-- fix_index.sql — fuera de la transacción principal
CREATE UNIQUE INDEX "concursos_cph_cargo_abierto_unique"
  ON concursos_cph (cargo_id)
  WHERE estado <> 'finalizado'::"EstadoConcursoCph";
```

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Nueva tabla `ConcursoCphDesierto`, `EstadoConcursoCph` sin `desierto`, relaciones en `ConcursoCph` y `Usuario` |
| `prisma/migrations/20260922000000_ps16d_desierto_cph/migration.sql` | Migración completa (enum + datos + tabla historial) |
| `prisma/migrations/20260922000000_ps16d_desierto_cph/fix_index.sql` | Recrea índice parcial sin `desierto` |
| `apps/api/src/modules/concursos-cph/concursosCph.calc.ts` | `EstadoConcursoCphCalc` sin `'desierto'`, branch `Q-DESIERTO` ya no produce `estado='desierto'` |
| `apps/api/src/modules/concursos-cph/concursos-cph.schema.ts` | `declararDesiertoSchema` con `dispoDesierta`, `fechaDispoDesierta`, `observaciones?` |
| `apps/api/src/modules/concursos-cph/concursos-cph.service.ts` | `declararDesiertoService`, guards `suspender`/`designar` solo bloquean `finalizado`, `include` con `desiertoHistorial` |
| `apps/api/src/modules/concursos-cph/concursos-cph.routes.ts` | `POST /:id/declarar-desierto` con `requirePermiso(WRITE_PERMISO)` |
| `packages/types/src/index.ts` | `EstadoConcursoCph` sin `DESIERTO`, `DeclararDesiertoRequest`, `ConcursoCphDesierto` |
| `apps/web/src/modules/concursos-cph/hooks/useConcursosCph.ts` | `useDeclararDesiertoCph` |
| `apps/web/src/modules/concursos-cph/lib/labels.ts` | `estadoBadge`/`estadoLabel` con lógica `suspendido + Q-DESIERTO` → "Desierto" en rojo |
| `apps/web/src/modules/concursos-cph/pages/ConcursosCphPage.tsx` | Usa `estadoBadge`/`estadoLabel` |
| `apps/web/src/modules/concursos-cph/pages/ConcursoCphWizard.tsx` | Panel desierto con botón + modal + historial de rondas; guard de designación sin `estado !== 'desierto'` |

---

## Criterio de éxito

- [x] No existe `estado = 'desierto'` en ninguna fila de `concursos_cph` después de la migración
- [x] Declarar desierto guarda el snapshot en `concursos_cph_desiertos` y limpia los campos de la ronda
- [x] El concurso queda `estado = activo`, `suspendido = true`, `subEstado = Q-DESIERTO`
- [x] El Wizard CPH muestra el historial de rondas desiertas con todos sus datos
- [x] Los concursos migrados desde `desierto` aparecen como `activo + suspendido` en el listado
- [x] `designarConcursoCphService` y `suspenderConcursoCphService` no bloquean por `estado === desierto`
- [x] `tsc` sin errores en todos los pasos
- [ ] Reanudar (quitar `suspendido`) permite avanzar sub-estados normalmente — verificar en PS16D-8
- [ ] Sin regresiones en el flujo normal de concursos CPH — verificar en PS16D-8 / S16-9

---

## Notas

- **`dispoDesierta` y `fechaDispoDesierta` en `concursos_cph`** se conservan como referencia
  al último desierto. El historial completo vive en `concursos_cph_desiertos`.
- **El flujo de relanzamiento** no requiere endpoint propio — el operador quita `suspendido`
  (endpoint existente `POST /:id/suspender` con `suspendido: false`) y carga la nueva
  `disposicion`. El sub-estado avanza automáticamente por `calcConcursoCph`.
- **CEETPS no tiene este problema** — su enum `EstadoConcursoCeetps` no tiene `desierto`.
- **El partial unique index** fue actualizado: condición `estado <> 'finalizado'` (ya no
  menciona `desierto` que dejó de existir).
- **Shadow database roto**: falta `TipoAutorizacion` en la BD shadow. Patrón de migración
  manual documentado arriba. Aplica a todas las migraciones futuras hasta que se resuelva.
