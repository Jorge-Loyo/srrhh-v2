# SPRINT 11 — Flujo concursal CPH con autorizaciones

**Estado:** ✅ Completo — 2026-09-03
**Autor:** Jorge + Claude

## Objetivo

Flujo de autorización en el wizard CPH: cambios sensibles (sigla/código de registro) requieren aprobación antes de avanzar. Flujo en dos pasos: Director autoriza primero si hay cambio de sigla/CR, luego SGRASV confirma. Sin cambio de sigla/CR: solo SGRASV.

## Tareas

| #     | Tarea | Estado |
| ----- | ----- | ------ |
| S11-1 | BD: `pendiente_autorizacion` + `sigla_solicitada` + `aprobado_director` en `concursos_cph`; `carga_horaria` en `bajas` | ✅ |
| S11-2 | API: detectar cambios sensibles en PATCH, notificar director, `aprobarAutorizacionCphService` | ✅ |
| S11-3 | API: `POST /:id/autorizar` — flujo director → SGRASV o SGRASV directo | ✅ |
| S11-4 | Frontend: wizard bloquea campos y avance mientras hay autorización pendiente | ✅ |
| S11-5 | `cargaHoraria` persistido en bajas (BD + API + frontend) | ✅ |
| S11-6 | Flujo director → SGRASV: guard en backend, banner dinámico en frontend según estado | ✅ |
| S11-7 | Documentos de exportación movidos al panel lateral del wizard | ✅ |
