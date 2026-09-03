# SPRINT 0 — Infraestructura base + análisis Dotaneitor

**Estado:** ✅ Completado
**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Entorno de desarrollo 100% funcional y Dotaneitor documentado.

## Tareas

| #     | Tarea                                                                  | Dev     | Est. | Prioridad  |     |
| ----- | ---------------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S0-1  | Levantar PostgreSQL con Docker (WSL), verificar conexión               | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S0-2  | Ejecutar `prisma migrate dev` — primera migración                      | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S0-3  | Verificar que API arranca y responde `/health`                         | Jorge   | 1h   | 🔴 Crítico | ✅  |
| S0-4  | Verificar que Web arranca y muestra LoginPage                          | Agustin | 1h   | 🔴 Crítico | ✅  |
| S0-5  | Leer y documentar código Dotaneitor: endpoints, lógica, inputs/outputs | Agustin | 8h   | 🔴 Crítico | ✅  |
| S0-6  | Mapear columnas del Excel de padrón → campos del schema Prisma         | Agustin | 4h   | 🔴 Crítico | ✅  |
| S0-7  | Identificar deuda técnica y optimizaciones del Dotaneitor              | Agustin | 4h   | 🟡 Medio   | ✅  |
| S0-8  | Crear `services/dotaneitor/` con Dockerfile y README                   | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S0-9  | Seed de datos de prueba: hospitales, escalafones, usuario admin        | Jorge   | 4h   | 🟡 Medio   | ✅  |
| S0-10 | Documentar hallazgos Dotaneitor en `Doc/Dotaneitor_Analisis.md`        | Agustin | 3h   | 🟡 Medio   | ✅  |
| S0-11 | Configurar GitHub Actions: lint + build en PR                          | Jorge   | 3h   | 🟢 Bajo    | ✅  |

## Criterio de éxito

- `docker-compose up` levanta PostgreSQL, API y Web sin errores ✅
- `GET /health` responde `{ status: 'ok' }` ✅
- LoginPage visible en `http://localhost:5173` ✅
- Dotaneitor documentado: sabemos exactamente qué hace, qué recibe y qué devuelve ✅
- Documento `Doc/Dotaneitor_Analisis.md` completo ✅
