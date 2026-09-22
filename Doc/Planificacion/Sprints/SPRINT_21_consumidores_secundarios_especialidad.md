# SPRINT 21 — Consumidores secundarios de puesto/especialidad + documentos exportables

**Estado:** 📋 Planificado
**Autores:** Jorge (backend) + Agustín (frontend)
**Depende de:** Sprint 20 — Consolidación catálogo Puesto/Escalafón/Especialidad ✅ (`puestoCargoId`/`especialidadPuestoId` en `Cargo`, endpoints core migrados)

---

## Objetivo

Migrar a `puestos_cargo`/`especialidades_puesto` los consumidores de puesto/especialidad que Sprint 20 dejó fuera de alcance por ser secundarios, **excepto** los que un análisis dedicado (ver "Validación previa" abajo) confirmó que son snapshots históricos legítimos y deben quedar como están. El pipeline Dotaneitor y las tablas `Ref*` quedan para Sprint 22 — es un bloque de trabajo propio, no entra acá.

## Validación previa (2026-09-21) — qué es dato vivo y qué es snapshot legítimo

Antes de escribir este sprint se auditó código real (no supuestos) de cada consumidor. Resultado:

**Queda como está — snapshot histórico legítimo, NO se toca en este sprint:**
- `MiembroJuradoSorteado.puesto`/`.especialidad`/`.cumpleEspecialidad` — snapshot explícito del acta de sorteo, documentado como tal en el propio schema ("el padrón cambia semanalmente; el acta debe reflejar el estado del día del sorteo"). Matiz encontrado: `SorteoJurado.confirmado` es reversible (`revertirConfirmacionService`, `sorteoJurado.service.ts:543-557`), no es inmutable a nivel de BD — se deja anotado como nota, no como tarea de este sprint.
- `Pou.especialidad` — foto mensual explícita, reemplaza la tabla entera en cada carga de Excel, fuente totalmente independiente del resto del sistema.
- `PadronHistorico.especialidad`/`.literalPuesto` — mismo criterio, snapshot histórico por diseño.

**Se migra en este sprint — texto libre sin FK que se trata como dato vivo:**
- `OrdenMerito.especialidad`/`.puesto`, `OrdenMeritoIntegrante.especialidad` — se cargan a mano al crear el registro, sin vínculo a ningún cargo/catálogo. El índice `@@index([especialidad, estado])` alimenta la alerta de negocio real "hay una OM vigente de la misma especialidad" (`ordenes-merito.service.ts:35-41,162-165`) vía `contains`/`insensitive` — dos OM de la misma especialidad tipeada distinto ("Clínica Médica" vs "Clinica Medica") hoy **no se detectan como coincidentes**, que es un bug de negocio real, no solo estético.
- `Postulante.especialidad` — mismo patrón, texto libre cargado al inscribir, sin FK.
- `Persona.especialidadPrincipal` — **hallazgo del análisis, no solo una migración cosmética**: el campo se escribe una sola vez al alta de la persona (`padron.service.ts:1677`) y **nunca se vuelve a actualizar** en padrones posteriores (confirmado por grep, a diferencia de `especialidadCph` que sí se resincroniza cada semana). Sin embargo Sprint 18 — Designación CPH asume lo contrario: su nota final dice explícitamente que se prefiere `especialidadCph` sobre `especialidadPrincipal` "porque `especialidadPrincipal` es la del cargo actual del padrón y puede ser diferente" — es decir, el sprint 18 la trata como si reflejara el cargo actual en tiempo real, cuando el código no la mantiene así. Esto es una desincronización silenciosa ya en producción de diseño, no algo que este sprint introduzca — hay que corregirla.
- Los 4 puntos de generación de documentos legales en `apps/web/src/shared/lib/exportConcursoDocs.ts` que leen `cargo?.especialidadLegacy` (líneas 94-95, 253-255, 624-627, 718: Autorización/Validación de concurso CPH, Acta de Sorteo de Jurado, Acta de Orden de Mérito). **Motivo de incluirlos explícitamente**: `especialidadLegacy` es justo la columna que Sprint 20 marca como "deja de ser fuente de lectura de cualquier lógica de negocio" — si estos 4 exports no se migran en el mismo sprint que se deja de mantener esa columna al día, se repite el incidente ya documentado de la migración `especialidades_fk` (creada y dropeada 15 días después "por no usada en ninguna query activa", cuando en realidad esta pantalla de exportación sí la necesitaba y nadie la había revisado).

## Tareas

| #     | Tarea                                                                                                                                                                                                 | Dev             | Est. | Prioridad | Estado |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | --------- | ------ |
| S21-1 | Schema: `OrdenMerito.especialidadPuestoId` (FK obligatoria → `EspecialidadPuesto`) + `puestoCargoId` opcional; `OrdenMeritoIntegrante.especialidadPuestoId`; `Postulante.especialidadPuestoId`. Reemplazan los campos de texto (se puede dropear directo, no hay datos de producción) | Jorge           | 2h   | 🔴        | 📋     |
| S21-2 | Backend: `ordenes-merito.service.ts` — filtro/alerta de "OM vigente de la misma especialidad" pasa de `contains`/`insensitive` a comparación por `especialidadPuestoId` (elimina el bug de variantes de tipeo)                                                                        | Jorge           | 2h   | 🔴        | 📋     |
| S21-3 | Backend: `postulantes.service.ts` — alta/listado/filtro de postulante usa `especialidadPuestoId`                                                                                                     | Jorge           | 1.5h | 🟡        | 📋     |
| S21-4 | Frontend: formularios de alta de Orden de Mérito y Postulante — combobox contra el catálogo en vez de input libre                                                                                    | Agustín         | 3h   | 🔴        | 📋     |
| S21-5 | Decisión + implementación: `Persona.especialidadPrincipal` deja de ser una columna que se escribe una vez y queda vieja — se resuelve **en runtime** desde el `Cargo` vigente de la persona (join ya existente vía `Ocupacion`, mismo patrón `LEFT JOIN LATERAL` de `personas.service.ts`) usando `puestoCargoId`/`especialidadPuestoId`. Se elimina la columna una vez migrados los lectores (S21-6, S21-7) | Jorge           | 4h   | 🔴        | 📋     |
| S21-6 | Backend: `sorteoJurado.service.ts:181` — el fallback `p.especialidadCph ?? p.especialidadPrincipal` pasa a usar la especialidad derivada en runtime de S21-5 en vez de la columna vieja              | Jorge           | 1h   | 🔴        | 📋     |
| S21-7 | Backend: revisar todo otro lector de `especialidadPrincipal` detectado en el análisis (listados/filtros de `personas.service.ts`) y migrarlo al valor derivado                                       | Jorge           | 2h   | 🟡        | 📋     |
| S21-8 | Backend: exponer en las respuestas de API que alimentan `exportConcursoDocs.ts` (autorización CPH, sorteo de jurado, orden de mérito) el nombre de especialidad resuelto desde `especialidadPuestoId` en vez de `especialidadLegacy`, preservando el mismo shape de campo que ya consume el frontend | Jorge           | 2h   | 🔴        | 📋     |
| S21-9 | Frontend: `exportConcursoDocs.ts` — actualizar las 4 lecturas (`getCasoCph` x2, `exportJuradoPdf`, `exportOrdenMeritoPdf`) para leer el campo nuevo de S21-8 en vez de `cargo?.especialidadLegacy`, con test manual de que los 4 documentos generados (PDF/Word) siguen mostrando la especialidad correctamente | Agustín         | 2h   | 🔴        | 📋     |
| S21-10| Corregir la nota de Sprint 18 — Designación CPH que asume que `especialidadPrincipal` refleja el cargo actual en tiempo real (no lo hacía antes de S21-5); confirmar que el badge de validación de ese sprint sigue funcionando igual ahora que el dato es derivado en runtime en vez de una columna vieja | Jorge + Agustín | 1h   | 🟡        | 📋     |
| S21-11| Verificación e2e: crear Orden de Mérito con especialidad repetida en distinto casing (confirmar que ahora sí alerta), inscribir Postulante, generar los 4 documentos exportables y confirmar que muestran la especialidad correcta, sorteo de jurado con badge de especialidad | Jorge + Agustín | 2h   | 🔴        | 📋     |

**Total estimado:** ~22.5h

## Dependencias entre tareas

```
S21-1 ──┬─► S21-2 ──► S21-4
         └─► S21-3 ──► S21-4

S21-5 ──┬─► S21-6
         ├─► S21-7
         └─► S21-10

S21-8 ──► S21-9

(S21-1..S21-4) + (S21-5..S21-7) + (S21-8..S21-9) ──► S21-11
```

## Criterio de éxito

- [ ] Dos Órdenes de Mérito con la misma especialidad tipeada distinto se detectan como coincidentes (bug de negocio real resuelto, no solo cosmético).
- [ ] `Persona.especialidadPrincipal` como columna fija-al-alta deja de existir; el valor "especialidad del cargo actual" se resuelve siempre en runtime contra el `Cargo` vigente.
- [ ] Los 4 documentos legales exportables (Autorización/Validación CPH, Acta de Sorteo de Jurado, Acta de Orden de Mérito) siguen mostrando la especialidad correctamente, ahora leída del catálogo en vez de `especialidadLegacy`.
- [ ] `MiembroJuradoSorteado`, `Pou`, `PadronHistorico` quedan sin tocar — confirmado que ningún cambio de este sprint los afecta.

## Notas

- **Dotaneitor y las 6 tablas `Ref*` (`RefAgrupador`, `RefUnificadorPuesto`, `RefEspecialidadCuil`, `RefCorreccionLitPuesto`, `RefCorreccionEspecialidad`, `RefEspecialidadPorPuesto`) quedan explícitamente fuera de este sprint.** Análisis dedicado (2026-09-21) confirmó que es técnicamente viable evolucionar el microservicio Python para resolver `puestoCargoId`/`especialidadPuestoId` directo (ya tiene conexión a Postgres propia y el patrón de "cargar tabla de referencia en runtime + matching normalizado" establecido), pero requiere decidir primero: (a) qué pasa con las 6 tablas `Ref*` (¿se reemplazan por un mapeo directo a IDs, o se mantienen como capa de corrección previa a una resolución final contra el catálogo?), (b) la política de "sin match" en Python (mismo problema que Sprint 20 S20-6 resuelve del lado Node), y (c) curar `EspecialidadPuesto` para cubrir la granularidad real que hoy vive en el diccionario estático `MAPEO_ESPECIALIDAD_POR_PUESTO` (una misma especialidad puede repetirse bajo distintos puestos — no es 1:1). Esto amerita un **Sprint 22** propio.
- Se detectó (no corresponde a este sprint, dejar registrado): `README.md` de `services/dotaneitor/` documenta endpoints `/diff` y `/guardar-bd` que **ya no existen** en el código — el diff hoy lo calcula Node directo contra Postgres. Actualizar esa documentación cuando se toque el servicio en Sprint 22.
- Precedente que este sprint existe para no repetir: la migración `20260910000001_especialidades_fk` se dropeó 15 días después por "no usada en ninguna query activa" — en ese momento nadie había revisado que `exportConcursoDocs.ts` sí la necesitaba. S21-8/S21-9 existen puntualmente para no repetir ese error.
