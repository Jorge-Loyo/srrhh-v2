# POST-SPRINT 16 — Corrección modelo Desierto CPH

**Estado:** 📋 Planificado
**Fecha:** 2026-09
**Autor:** Jorge (backend) + Agustín (frontend)
**Rama:** `jorge`

---

## Problema

El modelo actual trata `desierto` como un **estado terminal** del enum `EstadoConcursoCph`
(igual que `finalizado`). Esto es incorrecto: en la práctica administrativa, un concurso
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

### Consecuencias del modelo incorrecto actual

- Un concurso declarado desierto queda bloqueado — no se puede editar ni relanzar
  (`suspenderConcursoCphService` y `designarConcursoCphService` tienen guards que
  rechazan `estado === 'desierto'`)
- El enum `EstadoConcursoCph` en `packages/types` y en Prisma tiene un valor `desierto`
  que no refleja la realidad del proceso
- El Wizard CPH muestra la etapa "Desierto" como un camino alternativo terminal, cuando
  en realidad es un evento dentro del ciclo activo

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

Se limpian los datos de la ronda que falló (se guardan en el historial antes):

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
| `dispoDesierta`, `fechaDispoDesierta` | Registro del último desierto (el historial va a la tabla nueva) |
| `cantidadCargos`, `observaciones` | Datos generales del concurso |

### 5. Migración de datos existentes

Los concursos que hoy tienen `estado = 'desierto'` en la BD están **activos pero en
espera de autorización para relanzarse**. Se migran a:
- `estado = 'activo'`
- `suspendido = true`

Así quedan correctamente representados: el proceso no terminó, pero está en pausa
esperando decisión administrativa.

---

## Tareas

| # | Tarea | Dev | Est. | Prioridad |
|---|-------|-----|------|-----------|
| PS16D-1 | Schema Prisma: nueva tabla `ConcursoCphDesierto`. Migración: eliminar valor `desierto` del enum `EstadoConcursoCph`, actualizar filas existentes (`desierto` → `activo` + `suspendido = true`) | Jorge | 2h | 🔴 |
| PS16D-2 | Fix `calcConcursoCph`: `Q-DESIERTO` ya no produce `estado = desierto` — el estado sigue siendo `activo`. Actualizar `EstadoConcursoCphCalc` | Jorge | 1h | 🔴 |
| PS16D-3 | Endpoint `POST /concursos-cph/:id/declarar-desierto` — guarda snapshot en `ConcursoCphDesierto`, limpia campos de la ronda, pone `suspendido = true`, sub-estado queda `Q-DESIERTO` | Jorge | 2h | 🔴 |
| PS16D-4 | Fix guards en `suspenderConcursoCphService` y `designarConcursoCphService`: eliminar el bloqueo por `estado === 'desierto'` (ya no existe ese estado) | Jorge | 0.5h | 🔴 |
| PS16D-5 | Actualizar `packages/types`: eliminar `DESIERTO` de `EstadoConcursoCph`, agregar interfaz `ConcursoCphDesierto`, agregar `DeclamarDesiertoRequest` | Jorge | 0.5h | 🔴 |
| PS16D-6 | Frontend Wizard CPH: reemplazar etapa "Desierto (si aplica)" por panel "Declarar desierto" — botón que abre modal de confirmación con `dispoDesierta` + `fechaDispoDesierta`. Agregar sección "Historial de desiertes" que lista los snapshots de `ConcursoCphDesierto` | Agustín | 4h | 🔴 |
| PS16D-7 | Frontend `ConcursosCphPage`: filtro por `subEstado = Q-DESIERTO` en lugar de `estado = desierto`. Badge visual actualizado | Agustín | 1h | 🟡 |
| PS16D-8 | Verificación end-to-end: declarar desierto → ver historial → reanudar (quitar suspendido) → avanzar sub-estados → designar | Jorge + Agustín | 2h | 🔴 |

**Total estimado**: ~13h

---

## Dependencias entre tareas

```
PS16D-1 ──► PS16D-2 ──► PS16D-3
PS16D-1 ──► PS16D-4
PS16D-1 ──► PS16D-5
PS16D-3 + PS16D-5 ──► PS16D-6
PS16D-5 ──► PS16D-7
Todo ──► PS16D-8
```

---

## Schema de la nueva tabla

```prisma
model ConcursoCphDesierto {
  id                    String    @id @default(uuid()) @db.Uuid
  concursoCphId         String    @map("concurso_cph_id") @db.Uuid
  // Número de ronda (1 = primer desierto, 2 = segundo, etc.)
  nroRonda              Int       @map("nro_ronda")
  // Campos de la ronda que falló — snapshot antes de limpiar
  dispoDesierta         String    @map("dispo_desierta") @db.VarChar(50)
  fechaDispoDesierta    DateTime  @map("fecha_dispo_desierta") @db.Date
  sorteoJurado          DateTime? @map("sorteo_jurado") @db.Date
  disposicion           String?   @db.VarChar(100)
  fechaInscDesde        DateTime? @map("fecha_insc_desde") @db.Date
  fechaInscHasta        DateTime? @map("fecha_insc_hasta") @db.Date
  fechaExamen           DateTime? @map("fecha_examen") @db.Date
  fechaOrdenMerito      DateTime? @map("fecha_orden_merito") @db.Date
  qInscriptos           Int?      @map("q_inscriptos")
  eeDesignacion         String?   @map("ee_designacion") @db.VarChar(150)
  cargaDocumentacion    Boolean?  @map("carga_documentacion")
  fechaAptoMedico       DateTime? @map("fecha_apto_medico") @db.Date
  fechaIte              DateTime? @map("fecha_ite") @db.Date
  proyectoResolucion    Boolean?  @map("proyecto_resolucion")
  resoALaFirma          Boolean?  @map("reso_a_la_firma")
  resolucionDesignacion String?   @map("resolucion_designacion") @db.VarChar(100)
  fechaResolucion       DateTime? @map("fecha_resolucion") @db.Date
  cargoSial             String?   @map("cargo_sial") @db.VarChar(50)
  observaciones         String?   @db.Text
  registradoPorId       String?   @map("registrado_por_id") @db.Uuid
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz

  concursoCph   ConcursoCph @relation(fields: [concursoCphId], references: [id])
  registradoPor Usuario?    @relation(fields: [registradoPorId], references: [id])

  @@index([concursoCphId])
  @@map("concursos_cph_desiertos")
}
```

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Nueva tabla `ConcursoCphDesierto`, eliminar `desierto` del enum `EstadoConcursoCph`, relación en `ConcursoCph` y `Usuario` |
| `prisma/migrations/20260900000002_ps16d_desierto/` | Migración nueva |
| `apps/api/src/modules/concursos-cph/concursosCph.calc.ts` | `Q-DESIERTO` → `estado = activo`, eliminar `desierto` de `EstadoConcursoCphCalc` |
| `apps/api/src/modules/concursos-cph/concursos-cph.schema.ts` | Agregar `declararDesiertoSchema` |
| `apps/api/src/modules/concursos-cph/concursos-cph.service.ts` | `declararDesiertoService`, fix guards en `suspender` y `designar` |
| `apps/api/src/modules/concursos-cph/concursos-cph.routes.ts` | `POST /:id/declarar-desierto` |
| `packages/types/src/index.ts` | Eliminar `DESIERTO` de `EstadoConcursoCph`, agregar `ConcursoCphDesierto`, `DeclararDesiertoRequest` |
| `apps/web/src/modules/concursos-cph/pages/ConcursoCphWizard.tsx` | Panel desierto + historial de rondas |
| `apps/web/src/modules/concursos-cph/hooks/useConcursosCph.ts` | `useDeclararDesiertosCph` |
| `apps/web/src/modules/concursos-cph/pages/ConcursosCphPage.tsx` | Fix filtro/badge desierto |

---

## Criterio de éxito

- [ ] No existe `estado = 'desierto'` en ninguna fila de `concursos_cph` después de la migración
- [ ] Declarar desierto guarda el snapshot en `concursos_cph_desiertos` y limpia los campos de la ronda
- [ ] El concurso queda `estado = activo`, `suspendido = true`, `subEstado = Q-DESIERTO`
- [ ] Reanudar (quitar `suspendido`) permite avanzar sub-estados normalmente
- [ ] El Wizard CPH muestra el historial de rondas desiertas con todos sus datos
- [ ] Los concursos migrados desde `desierto` aparecen como `activo + suspendido` en el listado
- [ ] `designarConcursoCphService` y `suspenderConcursoCphService` no bloquean por `estado === desierto`
- [ ] Sin regresiones en el flujo normal de concursos CPH

---

## Notas

- **`dispoDesierta` y `fechaDispoDesierta` en `concursos_cph`** se conservan como referencia
  al último desierto. El historial completo vive en `concursos_cph_desiertos`.
- **El flujo de relanzamiento** no requiere un endpoint propio — alcanza con que el operador
  quite el `suspendido` (endpoint existente `POST /:id/suspender` con `suspendido: false`)
  y cargue la nueva `disposicion`. El sub-estado avanza automáticamente por `calcConcursoCph`.
- **CEETPS no tiene este problema** — su enum `EstadoConcursoCeetps` no tiene `desierto`.
  Si en el futuro se necesita, se modela igual.
- **El partial unique index** de `concursos_cph` (que impide dos concursos CPH abiertos para
  el mismo cargo) filtra por `estado NOT IN ('finalizado', 'desierto')`. Al eliminar `desierto`
  del enum, la condición pasa a `estado NOT IN ('finalizado')` — hay que actualizar la
  migración SQL de ese índice.
