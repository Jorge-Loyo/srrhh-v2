# SPRINT 6 — Tablero KPIs + cierre MVP

**Estado:** ✅ Completo — 2026-08-31, smoke test 21/21 OK
**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Dashboard operativo con KPIs reales y sistema listo para producción.

## Tareas

| #    | Tarea                                                                                         | Dev             | Est. | Prioridad  | Estado |
| ---- | --------------------------------------------------------------------------------------------- | --------------- | ---- | ---------- | ------ |
| S6-0 | _(no planificada)_ Prerequisito `PadronHistorico`: `cuil`/`unificadorPuesto`/índice `cargoId` | Jorge           | —    | 🔴 Crítico | ✅     |
| S6-1 | `GET /api/v1/kpis/dotacion`: total vigentes, vacantes, por carrera, por efector               | Jorge           | 6h   | 🔴 Crítico | ✅     |
| S6-2 | KpisPage: cards con borde amarillo, skeleton loading                                          | Agustin         | 6h   | 🔴 Crítico | ✅     |
| S6-3 | KPIs concursales: por sub-estado, tiempo promedio por etapa                                   | Jorge           | 6h   | 🔴 Crítico | ✅     |
| S6-4 | Filtro por hospital en todo el tablero                                                        | Agustin         | 4h   | 🟡 Medio   | ✅     |
| S6-5 | Gráfico evolución dotación histórica (padron_historico)                                       | Agustin         | 6h   | 🟡 Medio   | ✅     |
| S6-6 | Alertas activas: concursos vencidos, bajas sin concurso                                       | Jorge           | 4h   | 🟡 Medio   | ✅     |
| S6-7 | Preparar docker-compose de producción                                                         | Jorge           | 4h   | 🔴 Crítico | ✅     |
| S6-8 | Smoke test completo del sistema                                                               | Jorge + Agustin | 4h   | 🔴 Crítico | ✅     |

## Criterio de éxito

- Tablero carga en < 3 segundos ✅
- KPIs reflejan datos reales del padrón aprobado ✅
- Sistema listo para deploy en servidor propio ✅

## Notas de implementación

- S6-0: migración `20260831140000_padron_historico_kpis_prereq` — `cuil`/`unificador_puesto` (nullable) + `@@index([cargoId])` + `@@index([cuil])`. Backfill 46.889/46.889 filas.
- S6-4 resuelto sin código adicional: el único `hospitalId` de `KpisPage` ya se pasa a los 3 hooks con la misma firma `(hospitalId?: string)`.
- S6-5: `EvolucionDotacionChart` — línea a mano (sin librería de charts), `count(DISTINCT cuil)` para personas únicas. Rediseñado en Post-Sprint 9 como dashboard ejecutivo con small multiples por macro-grupo.
- S6-7: `docker-compose.prod.yml` + `apps/api/Dockerfile.prod` + `apps/web/Dockerfile.prod` + `Caddyfile`. Ver `Doc/DEPLOY_PRODUCCION.md`.
- S6-8: `scripts/smoke-test.mjs` — 21 checks: health, login, 9 módulos de rutas, 6 endpoints KPIs, 1 verificación negativa (401 sin token). **21/21 OK**.
