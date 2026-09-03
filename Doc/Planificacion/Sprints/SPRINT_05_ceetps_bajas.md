# SPRINT 5 — Concursos CEETPS + Bajas

**Estado:** ✅ Completo — verificado end-to-end, mergeado a main 2026-09
**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulo CEETPS y flujo baja → concurso funcional.

## Tareas

| #     | Tarea                                                                                                                            | Dev     | Est. | Prioridad  |     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S5-1  | `GET/PATCH /api/v1/concursos-ceetps` con filtros                                                                                 | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S5-2  | ConcursosCeetpsPage: tabla con estado, escalafón, filtros                                                                        | Agustin | 10h  | 🔴 Crítico | ✅  |
| S5-3  | ConcursoCeetpsDetail: formulario por fases ENF/TEC/EG                                                                            | Agustin | 10h  | 🔴 Crítico | ✅  |
| S5-4  | Módulo Bajas: `POST /api/v1/bajas` — modelo `Baja` nuevo en schema, endpoint de creación                                         | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S5-5  | Lógica: baja con `genera_concurso` → crea seguimiento automático                                                                 | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S5-6  | BajasPage: tabla + formulario nueva baja                                                                                         | Agustin | 8h   | 🔴 Crítico | ✅  |
| S5-7  | Conexión baja → cargo: marcar cargo `no_vigente` al registrar baja                                                               | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S5-8  | `GET /api/v1/kpis/concursos-ceetps` para tablero                                                                                 | Jorge   | 3h   | 🟡 Medio   | ✅  |
| S5-9  | Alertas CEETPS: concursos sin movimiento                                                                                         | Agustin | 3h   | 🟡 Medio   | ✅  |
| S5-10 | **Alta de Cargo manual** (B-11 promovido): crear cargo nuevo a mano con generación de `Cargo.codigo` según nomenclatura heredada | Jorge   | —    | 🔴 Crítico | ✅  |

## Criterio de éxito

- Rijana puede gestionar concursos CEETPS desde la app ✅
- Una baja genera automáticamente el seguimiento correspondiente ✅
- El cargo se marca `no_vigente` al registrar la baja ✅
- Alta de Cargo manual funciona con generación de código según nomenclatura heredada ✅

## Notas de implementación

- `createConcursoTx(tx, body, usuarioId, bajaId?)` extraída como función pública — permite que la transacción de baja (crear baja → marcar cargo `no_vigente` → crear concurso) sea atómica sin anidar transacciones Prisma.
- `tipoBaja` y `tipificadorOrigen` opcionales (97% vacío en datos reales del CSV de Alexis).
- `bajaId` nullable en `Concurso` — hay concursos por ampliación sin baja previa.
- S5-10: `POST /api/v1/cargos` con `requireRole([ADMIN, EDITOR])`. `cantidad=2` generó `CPH-POF-024445` y `CPH-POF-024446` correctamente.

## Merges

- `jorge → main`: commits S5-1/S5-4/S5-7 (merge `4470b4c`), luego S5-5/S5-8/S5-10 (merge `215e810`)
- `Agustin → develop → main`: S5-2/S5-3/S5-6/S5-9 (merge `9d39069`)
