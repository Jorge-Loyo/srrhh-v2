# SPRINT 7 — Cargos: trazabilidad del alta manual

**Estado:** ✅ Completo — RF-11 a RF-15 implementados, historial persistente, PDF, filtrado escalafones
**Duración:** 1 semana | **Capacidad:** 60h | **Estimado:** 56h
**Objetivo:** Cerrar los gaps de trazabilidad del alta manual de cargos (RF-11 a RF-15 de `Doc/Contratos_Paginas/cargos_alta.md`).

## Contexto

El frontend de `/cargos/alta` enviaba `expediente` y `desde` al backend, pero `createCargoService` los descartaba silenciosamente — el acto administrativo que respalda el alta se perdía.

**Orígenes de alta de cargo:** Ejecución POF, Ejecución POU, Estructura (manuales) y Padrón semanal SIAL (automática). La "alta con contrapartida de baja" **no es un origen de cargo**.

## Tareas

| #     | Tarea                                                                                                                                                                                                            | Dev             | Est. | Prioridad  | RF          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | ---------- | ----------- |
| S7-1  | Migración Prisma: `expediente` (VARCHAR 100, nullable), `fechaDesde` (DATE, nullable) y `createdById` (UUID FK → Usuario, nullable) en `cargos`                                                                  | Jorge           | 4h   | 🔴 Crítico | RF-11/12/13 |
| S7-2  | `createCargoService`: persistir `expediente`, `fechaDesde` y `createdById` en cada cargo creado del lote                                                                                                         | Jorge           | 4h   | 🔴 Crítico | RF-11/12/13 |
| S7-3  | Backfill doc: cargos manuales existentes (`idSial LIKE 'MANUAL-%'`) quedan con `expediente`/`fechaDesde` NULL — documentar decisión                                                                              | Jorge           | 2h   | 🟡 Medio   | RF-11/12    |
| S7-4  | `GET /api/v1/cargos/altas?expediente=&desde=&hasta=`: lista altas manuales con filtro por expediente y rango de fechas                                                                                           | Jorge           | 6h   | 🟡 Medio   | RF-14       |
| S7-5  | Validación de duplicado estructural en `createCargoService`: buscar cargo vigente con mismo `(hospitalId, escalafonId, codigoRegistroId, literalPuesto)`. Responder `409` con el cargo existente                 | Jorge           | 6h   | 🟢 Bajo    | RF-15       |
| S7-6  | `createCargoSchema` (Zod): `expediente` y `desde` pasan de opcionales-descartados a persistidos                                                                                                                  | Jorge           | 4h   | 🔴 Crítico | RF-11/12    |
| S7-7  | Frontend: modal de advertencia con el cargo existente (código, puesto, hospital) y botones "Crear de todos modos" / "Cancelar"                                                                                   | Agustin         | 8h   | 🟢 Bajo    | RF-15       |
| S7-8  | Frontend: reemplazar historial de sesión por historial persistente (`GET /api/v1/cargos/altas`) con buscador por expediente                                                                                      | Agustin         | 10h  | 🟡 Medio   | RF-14       |
| S7-9  | Frontend: mostrar `expediente` y `fechaDesde` en el detalle del cargo (`CargoDetailPanel`)                                                                                                                       | Agustin         | 4h   | 🟡 Medio   | RF-11/12    |
| S7-10 | Verificación end-to-end + actualizar `cargos_alta.md` (RF-11 a RF-15 → ✅)                                                                                                                                       | Jorge + Agustin | 4h   | 🔴 Crítico | Todos       |

## Criterio de éxito

- Un cargo dado de alta manualmente guarda su expediente/decreto en BD y sobrevive a un reload ✅
- La fecha "desde" queda persistida como fecha de inicio de vigencia ✅
- Cada alta manual registra qué usuario la hizo ✅
- Se puede consultar el historial de altas por expediente sin depender de la sesión ✅
- Intentar crear un cargo duplicado estructural muestra advertencia antes de crear ✅
- Contrato `cargos_alta.md` actualizado: RF-11 a RF-15 en estado ✅ ✅

## Post-Sprint 7 — Mejoras UX y datos (Jorge, 2026-08-10)

- **Filtrado escalafones por tipo de alta**: `filtrarEscalafones()` con sets `ESC_POF`/`ESC_POU`/`ESC_ESTRUCTURA`
- **Puestos Anexo 2 completados**: 11 puestos insertados en BD (Camillero, Conductor de Furgon, etc.)
- **Historial reemplazado**: tabla agrupada por expediente, modal de detalle, botón "Descargar PDF" con `jspdf` + `jspdf-autotable`
- **Limpieza escalafones**: escalafón `CPH` duplicado eliminado. `Médicos` renombrado a `Carrera Profesional Hospitalaria`
- **26 puestos nuevos**: para 7 escalafones sin puestos normalizados (Residentes, Docentes, Carrera Gerencial, etc.)
- **Menú lateral reorganizado**: orden definitivo — Tablero KPIs / Personas / Cargos▼ / Bajas / ── / Concursos CPH / Concursos CEETPS / ── / Padrón Semanal / Bajas Consolidadas / Administración
- **Limpieza BD**: 5 bajas de prueba + 4 concursos asociados eliminados. Tablas `bajas` y `concursos` en 0 registros
