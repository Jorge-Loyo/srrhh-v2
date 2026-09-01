# PLAN SCRUM — Módulo Cargos (Sprint 7)

> Planificación ágil del módulo de gestión de cargos.
> Última actualización: 2026-09 (Pre-Sprint 7 — listo para iniciar desarrollo)
>
> Contrato de página: [`Doc/Contratos_Paginas/cargos_alta.md`](../Contratos_Paginas/cargos_alta.md)
> Lógica de cargo: [`Doc/Contrato_logica-cargo.md`](../Contrato_logica-cargo.md)

---

## 1. CONTEXTO

| Parámetro           | Valor                                                      |
| ------------------- | ---------------------------------------------------------- |
| Equipo              | Jorge (Dev 1 — Backend) + Agustin (Dev 2 — Frontend)       |
| Capacidad           | 30h/semana por dev = 60h/semana totales                    |
| Duración del sprint | 1 semana                                                   |
| Ceremonia           | Review + Retro semanal (sin daily, comunicación asíncrona) |
| Coordinación        | Avisar antes de tocar un módulo compartido (regla del DoD) |

### Definición de Done (DoD)

- [ ] Funcionalidad implementada y probada manualmente end-to-end
- [ ] Sin regresiones en módulos existentes
- [ ] Migración de Prisma aplicada y verificada contra BD real
- [ ] Documentación actualizada (`cargos_alta.md` + este plan)
- [ ] Avisado antes de tocar un módulo que el otro dev pueda estar trabajando

---

## 2. ESTADO ACTUAL DEL MÓDULO

### Lo que ya funciona (no tocar)

| Funcionalidad                                               | Estado          | Notas                                                                         |
| ----------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| Alta manual de cargos (`POST /api/v1/cargos`)               | ✅ Implementado | Genera código correlativo, crea N cargos en lote                              |
| Filtrado de escalafones con puestos (`?paraNuevaAlta=true`) | ✅ Implementado | Filtra por `puestosCargo: { some: { activo: true } }` — muestra 6 escalafones |
| Filtrado inteligente de puestos por modalidad               | ✅ Implementado | CPH POF/POU usa puestos propios; CEETPS usa `ambos`                           |
| Formulario multi-cargo con panel de pendientes              | ✅ Implementado | Botones siempre habilitados, panel lateral condicional                        |
| Historial de sesión con buscador                            | ✅ Implementado | Solo persiste en memoria del navegador                                        |
| Generación de código correlativo                            | ✅ Implementado | `prefijoDeCargo()` + `siguienteCodigoCargo()` en transacción                  |
| Alias visual "Médicos" → "CPH"                              | ✅ Implementado | Solo en frontend, BD mantiene "Médicos"                                       |

### El problema central de este sprint

El frontend envía `expediente` y `desde` al backend, pero `createCargoService` los descarta silenciosamente porque el modelo `Cargo` no tiene esas columnas. El acto administrativo que respalda el alta se pierde — solo vive en el historial de sesión del frontend, que se borra al recargar.

```
Frontend envía:  { expediente: "EX-2026-...", desde: "2026-09-01", ... }
Backend recibe:  ✓ (pasa validación Zod)
Backend persiste: ✗ (createCargoService ignora ambos campos)
BD guarda:       solo hospitalId, escalafonId, literalPuesto, codigo, etc.
```

---

## 3. OBJETIVO DEL SPRINT

Cerrar los gaps de trazabilidad del alta manual de cargos (RF-11 a RF-15 del contrato), de modo que **todo alta de cargo quede respaldada por su acto administrativo en BD** y sea auditable.

---

## 4. ALCANCE

### Dentro del alcance

- Persistencia de `expediente`/`decreto` y `fechaDesde` en la tabla `cargos` (RF-11, RF-12)
- Auditoría del alta: usuario que registró cada cargo (RF-13)
- Historial persistente de altas consultable por expediente (RF-14)
- Validación de duplicado estructural con advertencia (RF-15)

### Fuera del alcance

- Origen automático (Padrón SIAL) — tiene su propio flujo
- Movimientos de ocupación (bajas, designaciones) — no son altas de cargo
- Cambios en la generación de códigos de cargo (ya funciona)
- El filtrado de escalafones y puestos (ya resuelto en sprint anterior)

---

## 5. TAREAS

**Capacidad total:** 60h | **Estimado:** 56h

| #    | Tarea                                                                                                                                                                                                                                                    | Dev             | Est. | Prioridad  | RF          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | ---------- | ----------- |
| S7-1 | Migración Prisma: agregar `expediente` (VARCHAR 100, nullable), `fecha_desde` (DATE, nullable) y `created_by_id` (UUID FK → usuarios, nullable) a `cargos`. Aplicar en BD real.                                                                          | Jorge           | 4h   | 🔴 Crítico | RF-11/12/13 |
| S7-2 | Actualizar `createCargoService`: persistir `expediente`, `fechaDesde` y `createdById` (del token JWT) en cada cargo creado del lote. Actualizar `createCargoSchema` (Zod) para que `expediente` y `desde` pasen de opcionales-descartados a persistidos. | Jorge           | 6h   | 🔴 Crítico | RF-11/12/13 |
| S7-3 | Backfill: cargos manuales existentes (`idSial LIKE 'MANUAL-%'`) quedan con `expediente`/`fechaDesde`/`createdById` NULL — documentar decisión (dato nunca persistido, no recuperable retroactivamente).                                                  | Jorge           | 1h   | 🟡 Medio   | RF-11/12    |
| S7-4 | Endpoint `GET /api/v1/cargos/altas?expediente=&desde=&hasta=`: lista altas manuales (`idSial LIKE 'MANUAL-%'`) con filtro por expediente y rango de fechas. Incluye usuario que registró y códigos generados.                                            | Jorge           | 6h   | 🟡 Medio   | RF-14       |
| S7-5 | Validación de duplicado estructural en `createCargoService`: antes de crear, buscar cargo vigente con mismo `(hospitalId, escalafonId, literalPuesto)`. Si existe, responder `409` con el cargo existente (código, puesto, hospital).                    | Jorge           | 6h   | 🟢 Bajo    | RF-15       |
| S7-6 | Frontend: manejar respuesta `409` de duplicado — modal de advertencia con el cargo existente y botones "Crear de todos modos" / "Cancelar".                                                                                                              | Agustin         | 8h   | 🟢 Bajo    | RF-15       |
| S7-7 | Frontend: reemplazar historial de sesión por historial persistente — consumir `GET /api/v1/cargos/altas` con buscador por expediente. Mantener fallback de sesión mientras carga.                                                                        | Agustin         | 10h  | 🟡 Medio   | RF-14       |
| S7-8 | Frontend: mostrar `expediente` y `fechaDesde` en el detalle del cargo (`CargoDetailPanel`) para que el dato persistido sea visible.                                                                                                                      | Agustin         | 4h   | 🟡 Medio   | RF-11/12    |
| S7-9 | Verificación end-to-end: alta POF/POU/Estructura con expediente → recargar página → el expediente sigue visible en el historial y en el detalle del cargo. Actualizar `cargos_alta.md` (RF-11 a RF-15 → ✅).                                             | Jorge + Agustin | 4h   | 🔴 Crítico | Todos       |

### Dependencias entre tareas

```
S7-1 (migración) ──► S7-2 (service + schema) ──► S7-3 (backfill/doc)
                                               └─► S7-4 (endpoint altas) ──► S7-7 (frontend historial)
                                               └─► S7-5 (duplicados)     ──► S7-6 (frontend modal 409)
                                               └─► S7-8 (detalle cargo)
Todo ──► S7-9 (verificación + docs)
```

> **División sugerida:** Jorge arranca con S7-1 → S7-2 (bloquean todo lo demás). Agustin puede adelantar S7-8 (solo lectura de campos nuevos, maquetado con datos mock) y el modal de S7-6 con datos hardcodeados mientras Jorge termina el backend.

---

## 6. CRITERIO DE ÉXITO DEL SPRINT

- [ ] Un cargo dado de alta manualmente guarda su expediente/decreto en BD y sobrevive a un reload
- [ ] La fecha "desde" queda persistida como fecha de inicio de vigencia
- [ ] Cada alta manual registra qué usuario la hizo
- [ ] Se puede consultar el historial de altas por expediente sin depender de la sesión
- [ ] Intentar crear un cargo duplicado estructural muestra advertencia antes de crear
- [ ] Contrato `cargos_alta.md` actualizado: RF-11 a RF-15 en estado ✅

---

## 7. REGISTRO DE DECISIONES

| Fecha   | Decisión                                                                              | Motivo                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09 | El alta con contrapartida de baja **no es un origen de cargo**                        | El cargo estructural y su historia persisten; solo se reemplaza la persona que lo ocupa. Es un movimiento de ocupación (flujo de bajas), no un alta.                                                      |
| 2026-09 | RF-11/RF-12 como P1 (crítico)                                                         | El acto administrativo que respalda un alta no puede vivir solo en memoria del navegador — es un dato de auditoría obligatorio.                                                                           |
| 2026-09 | Cargos manuales preexistentes quedan con `expediente`/`fechaDesde`/`createdById` NULL | El dato nunca se persistió; no hay forma de recuperarlo retroactivamente. Se documenta en lugar de inventar valores.                                                                                      |
| 2026-09 | Duplicado estructural = advertencia (409 + override), no bloqueo duro                 | Puede haber casos legítimos de cargos gemelos (misma estructura, distinto financiamiento). El usuario decide.                                                                                             |
| 2026-09 | Historial persistente usa `GET /api/v1/cargos/altas` (endpoint dedicado)              | Más claro que filtrar el listado general de cargos por `idSial LIKE 'MANUAL-%'`; permite agregar filtros específicos de alta (expediente, rango de fechas, usuario) sin contaminar el endpoint de cargos. |
| 2026-09 | Filtrado de escalafones (`?paraNuevaAlta=true`) y puestos por modalidad ya resueltos  | Implementados en el sprint anterior. No son parte del alcance de S7.                                                                                                                                      |

---

## 8. BACKLOG DEL MÓDULO (fuera de este sprint)

| #    | Tarea                                                                                                                                                                           | Motivo de postergación                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| BC-1 | Corregir identidad del cargo en padrón SIAL: key por clave estructural `(hospital, escalafon, codigo_repa, literal_puesto)` en vez de `id_sial` (bug C-1 de `Concursos-CPH.md`) | Pertenece al módulo Padrón, no al alta manual                  |
| BC-2 | `fechaHasta` / supresión de cargo con acto administrativo de baja                                                                                                               | Flujo de bajas, no de altas                                    |
| BC-3 | Vincular expediente de alta con expediente de baja (contrapartida)                                                                                                              | Requiere modelado de actos administrativos como entidad propia |
| BC-4 | Filtrado por `createdById` en el historial de altas (ver altas propias vs. todas)                                                                                               | Mejora UX, no bloqueante para el MVP                           |
