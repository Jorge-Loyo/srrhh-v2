# SPRINT 14 — Concurso desde Alta de Cargo

**Estado:** 📋 Planificado
**Fecha estimada:** Post-Sprint 13
**Autor:** Por definir
**Rama:** deploy

---

## Objetivo

Conectar el flujo de alta de cargo con el inicio de concurso. Al crear un cargo en `/cargos/alta`, el sistema pregunta al usuario si desea enviarlo a concurso. Si acepta, lo deriva automáticamente al módulo correcto (CPH o CEETPS según la carrera del cargo) y notifica a los usuarios con rol `SDRAVS` para que vean el inicio del concurso. En la vista de concursos, una columna indica el **motivo del concurso**: `Alta por baja` o `Nuevo cargo`.

---

## Contexto y reglas de negocio

### Derivación por carrera

| Carrera del cargo | Módulo destino       | Ruta frontend              |
| ----------------- | -------------------- | -------------------------- |
| CPH               | Concursos CPH        | `/concursos/cph`           |
| ENF / TEC / EG    | Concursos CEETPS     | `/concursos/ceetps`        |

La carrera se determina desde el prefijo del `Cargo.codigo` (ej. `CPH-POF-*` → CPH, `ENF-*` → CEETPS).

### Motivo del concurso

| Motivo         | Cuándo aplica                                                                 |
| -------------- | ----------------------------------------------------------------------------- |
| `nuevo_cargo`  | El cargo fue creado manualmente vía `/cargos/alta` (sin baja previa)          |
| `alta_por_baja`| El cargo se crea como reemplazo de una baja (flujo `/cargos/baja/nueva`)      |

El campo `motivoConcurso` se agrega al modelo `Concurso` (tabla compartida entre CPH y CEETPS).

### Notificación a SDRAVS

- Al crear el concurso desde el alta, se genera una `Notificacion` de tipo `concurso_iniciado` para todos los usuarios con rol `sdravs` (o el rol que corresponda según RBAC).
- La notificación incluye link directo al concurso creado.

---

## Tareas

| #      | Tarea                                                                                                                                                                   | Dev     | Est. | Prioridad  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | ---------- |
| S14-1  | Migración Prisma: campo `motivoConcurso` enum (`nuevo_cargo`, `alta_por_baja`) nullable en tabla `concursos`. Aplicar en BD real                                        | Jorge   | 2h   | 🔴 Crítico |
| S14-2  | `createConcursoTx`: aceptar `motivoConcurso` como parámetro opcional y persistirlo                                                                                      | Jorge   | 2h   | 🔴 Crítico |
| S14-3  | `createCargoService`: al finalizar la creación, devolver en la respuesta un flag `puedeIniciarConcurso: true` + datos mínimos del cargo (id, codigo, carrera derivada)  | Jorge   | 3h   | 🔴 Crítico |
| S14-4  | Nuevo tipo `TipoNotificacion.concurso_iniciado`; helper `notificarConcursoIniciado(concursoId, tipoConcurso)` que crea notificación para rol `sdravs`                    | Jorge   | 3h   | 🟡 Medio   |
| S14-5  | Integrar `notificarConcursoIniciado` en `createConcursoTx` cuando `motivoConcurso` está presente                                                                        | Jorge   | 1h   | 🟡 Medio   |
| S14-6  | `listConcursosCphService` y `listConcursosCeetpsService`: incluir `motivoConcurso` en la respuesta                                                                      | Jorge   | 1h   | 🟡 Medio   |
| S14-7  | Frontend `AltaCargosPage`: modal de confirmación post-alta — "¿Desea enviar este cargo a concurso?" con botones Sí / No. Si Sí: llama a `POST /api/v1/concursos` con `motivoConcurso: 'nuevo_cargo'` y redirige al concurso creado | Agustin | 6h   | 🔴 Crítico |
| S14-8  | Frontend `ConcursosCphPage` y `ConcursosCeetpsPage`: columna **Motivo** con badge `Nuevo cargo` (azul) / `Alta por baja` (naranja) / vacío si no tiene                  | Agustin | 3h   | 🔴 Crítico |
| S14-9  | Frontend: badge de notificación en header para rol `sdravs` cuando hay concursos iniciados no leídos (reutiliza infraestructura Sprint 10)                              | Agustin | 2h   | 🟡 Medio   |
| S14-10 | Verificación end-to-end: alta de cargo CPH → modal → confirmar concurso → aparece en `/concursos/cph` con motivo "Nuevo cargo" → notificación visible para `sdravs`     | Jorge + Agustin | 3h | 🔴 Crítico |

---

## Dependencias

```
S14-1 (migración) ──► S14-2 (createConcursoTx) ──► S14-3 (createCargoService)
                                                 └──► S14-5 (notificación)
S14-4 (tipo notif) ──► S14-5
S14-2 ──► S14-6 (listados)
S14-3 ──► S14-7 (frontend modal)
S14-6 ──► S14-8 (columna motivo)
S14-4 ──► S14-9 (badge sdravs)
Todo ──► S14-10 (verificación)
```

---

## Criterio de éxito

- [ ] Al crear un cargo, el usuario puede optar por iniciar concurso sin salir de la pantalla
- [ ] El concurso se crea en el módulo correcto según la carrera (CPH o CEETPS) automáticamente
- [ ] La columna "Motivo" en las listas de concursos muestra `Nuevo cargo` o `Alta por baja`
- [ ] Los usuarios con rol `sdravs` reciben notificación al iniciarse un concurso
- [ ] El flujo existente de baja → concurso no se rompe (regresión)

---

## Archivos a modificar (estimado)

| Archivo | Cambio |
| ------- | ------ |
| `prisma/schema.prisma` | Enum `MotivoConcurso` + campo en `Concurso` |
| `prisma/migrations/...` | Migración nueva |
| `packages/types/src/index.ts` | `MotivoConcurso`, `Concurso.motivoConcurso` |
| `apps/api/src/modules/concursos/concursos.service.ts` | `createConcursoTx` acepta `motivoConcurso` |
| `apps/api/src/modules/cargos/cargos.service.ts` | `createCargoService` devuelve `puedeIniciarConcurso` |
| `apps/api/src/modules/notificaciones/notificaciones.service.ts` | Nuevo tipo + helper |
| `apps/api/src/modules/concursos-cph/concursos-cph.service.ts` | Incluir `motivoConcurso` en listado |
| `apps/api/src/modules/concursos-ceetps/concursos-ceetps.service.ts` | Ídem |
| `apps/web/src/modules/cargos/pages/AltaCargosPage.tsx` | Modal post-alta |
| `apps/web/src/modules/concursos-cph/pages/ConcursosCphPage.tsx` | Columna Motivo |
| `apps/web/src/modules/concursos-ceetps/pages/ConcursosCeetpsPage.tsx` | Columna Motivo |

---

## Notas de diseño

- El modal de confirmación es **no bloqueante**: si el usuario cierra sin responder, el cargo queda creado sin concurso. Puede iniciarlo manualmente desde el flujo habitual.
- `CEETPS` incluye las carreras ENF, TEC y EG. La derivación usa el prefijo del `Cargo.codigo` para determinar el `escalafonId` correcto al crear el `ConcursoCeetps`.
- El rol `sdravs` debe existir en la tabla `roles` antes de implementar S14-4. Si no existe, crearlo en la migración o en el seed.
- La columna Motivo en los listados es opcional visualmente (muchos concursos existentes no tendrán el campo) — mostrar vacío o un guión, no romper el layout.
