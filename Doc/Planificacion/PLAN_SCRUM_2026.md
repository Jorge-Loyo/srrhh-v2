# PLAN SCRUM — SRRHH v2
# Sistema de Recursos Humanos — Gobierno de la Ciudad de Buenos Aires

> Documento de planificación ágil. Fuente de verdad para sprints, tareas y decisiones de alcance.
> Última actualización: 2026-09-10 (POST-SPRINT 12 — Auditoría especialidad_legacy + pg_trgm)
>
> 📋 **Gestión de tareas:** [Notion — SRRHH v2](https://app.notion.com/p/42d483af08924aef9d4fcb102fc72756?v=7f5beedb27ed4251a8c790a1d20c6841&source=copy_link)
>
> 📁 **Detalle de cada sprint:** `Doc/Planificacion/Sprints/`

---

## ESTADO ACTUAL

| Sprint | Estado | Tareas | Detalle |
| ------ | ------ | ------ | ------- |
| Sprint 0 — Infraestructura | ✅ Completado | S0-1 a S0-11 | `Sprints/SPRINT_00_infraestructura.md` |
| Sprint 1 — Autenticación | ✅ Completado | S1-1 a S1-10 | `Sprints/SPRINT_01_autenticacion.md` |
| Sprint 2 — Dotaneitor + Padrón | ✅ Completo — verificado end-to-end 2026-08-25 | S2-1 a S2-19 | `Sprints/SPRINT_02_dotaneitor_padron.md` |
| Sprint 3 — Personas y Cargos | ✅ Completo — verificado con browser real 2026-08-25 | S3-1 a S3-11 | `Sprints/SPRINT_03_personas_cargos.md` |
| Post-Sprint 3 — Mejoras UX padrón/personas | ✅ Completado — commit `f178819`, 2026-08-27 | — | `Sprints/SPRINT_03_personas_cargos.md` |
| Post-Sprint 3B — Cargos: códigos, estados, UX | ✅ Completado — 2026-09 | — | `Sprints/SPRINT_03_personas_cargos.md` |
| Post-Sprint 3C — Mejoras UX personas/cargos | ✅ Completado — 2026-08-28 | — | `Sprints/SPRINT_03_personas_cargos.md` |
| Post-Sprint 3D — Maquetas Alta/Baja/Alta por Baja | ✅ Completado — 2026-09 | — | `Sprints/SPRINT_03_personas_cargos.md` |
| Sprint 4 — Concursos CPH | ✅ Completo — verificado end-to-end 2026-08-26 | S4-1 a S4-11 | `Sprints/SPRINT_04_concursos_cph.md` |
| Sprint 5 — Concursos CEETPS + Bajas | ✅ Completo — mergeado a main 2026-09 | S5-1 a S5-10 | `Sprints/SPRINT_05_ceetps_bajas.md` |
| Sprint 6 — KPIs + Deploy | ✅ Completo — 2026-08-31, smoke test 21/21 OK | S6-0 a S6-8 | `Sprints/SPRINT_06_kpis_deploy.md` |
| Sprint 7 — Cargos: trazabilidad del alta manual | ✅ Completo — RF-11 a RF-15, historial persistente, PDF | S7-1 a S7-10 | `Sprints/SPRINT_07_trazabilidad_alta.md` |
| Sprint 8 — Estado `validacion_vacante` + Validación de Bajas | ✅ Completo — S8A y S8B, build limpio | S8A-1 a S8B-6 | `Sprints/SPRINT_08_validacion_vacante.md` |
| Sprint 8-C — Triangulación histórica | ✅ Completo — 2026-09-03, regla baja SIAL implementada | S8C-1 a S8C-3 | `Sprints/SPRINT_08_validacion_vacante.md` |
| Sprint 9 — Matriz de permisos + Landing/menú/guards | ✅ Completo — 2026-09-02 (S9-1 superado por RBAC dinámico) | S9-2 a S9-11 | `Sprints/SPRINT_09_permisos_landing.md` |
| Post-Sprint 9 — Normalización escalafones + deploy + Neon | ✅ Completo — 2026-09-03 | — | `Sprints/SPRINT_09_permisos_landing.md` |
| Sprint 10 — Notificaciones persistidas | ✅ Completo — 2026-09-04 | S10-1 a S10-5 | `Sprints/SPRINT_10_notificaciones.md` |
| Sprint 11 — Flujo concursal CPH con autorizaciones | ✅ Completo — 2026-09-03 | S11-1 a S11-7 | `Sprints/SPRINT_12_13_ux_bajas_autorizaciones.md` |
| Sprint 12 — UX bajas + wizard CPH + permisos UI | ✅ Completo — 2026-09-03 | S12-1 a S12-6 | `Sprints/SPRINT_12_13_ux_bajas_autorizaciones.md` |
| Post-Sprint 12 — Auditoría especialidad_legacy + pg_trgm | ✅ Completo — commit `af1c3f1` | — | `Sprints/POST_SPRINT_12_especialidad_legacy.md` |
| Sprint 13 — Panel de autorizaciones + jerarquía de roles | 📋 Planificado | S13-1 a S13-9 | `Sprints/SPRINT_12_13_ux_bajas_autorizaciones.md` |
| Sprint 14 — Concurso desde Alta de Cargo | 📋 Planificado | S14-1 a S14-10 | `Sprints/SPRINT_14_concurso_desde_alta.md` |

---

## 1. CONTEXTO DEL EQUIPO

| Parámetro | Valor |
| --------- | ----- |
| Equipo | Jorge (Dev 1 — Backend) + Agustin (Dev 2 — Frontend) |
| Capacidad | 30h/semana por dev = 60h/semana totales |
| Duración de sprint | 1–2 semanas según complejidad |
| Ceremonia | Review + Retro semanal |
| Herramienta | Notion |
| Sin daily | Comunicación asíncrona |
| Deadline MVP | Sin fecha fija — prioridad: calidad por etapa |

### Definición de Done (DoD)

Un ítem está terminado cuando:

- [ ] Funcionalidad implementada y probada manualmente
- [ ] Sin regresiones en módulos existentes
- [ ] Documentación actualizada (este doc + archivos Doc/)
- [ ] Avisado por Notion/chat antes de tocar un módulo que otro dev pueda estar trabajando en paralelo

> El DoD original decía "PR aprobado" pero el equipo nunca usó PRs. Se reemplaza por la regla que sí se cumple: avisar antes de tocar un módulo compartido (ver choque Sprint 3).

---

## 2. ARQUITECTURA DEL SISTEMA

```
SRRHH-Legacy/ (monorepo pnpm + Turborepo)
├── apps/api/          ← Fastify + Prisma + PostgreSQL
├── apps/web/          ← React + Vite + Tailwind (tokens Obelisco GCBA)
├── packages/types/    ← DTOs y enums compartidos
├── packages/utils/    ← Helpers compartidos
├── prisma/            ← Schema + migraciones (fuente de verdad BD)
├── services/
│   └── dotaneitor/    ← Microservicio Python (análisis Sprint 0)
└── docker-compose.yml ← PostgreSQL + API + Web + Dotaneitor
```

### Stack definitivo

| Capa | Tecnología |
| ---- | ---------- |
| Base de datos | PostgreSQL 16 (Docker) |
| ORM | Prisma 5.x |
| Backend | Node 20 + TypeScript + Fastify 4 |
| Frontend | React 18 + Vite 5 + Tailwind CSS |
| Design system | Tokens Obelisco GCBA sobre shadcn/ui |
| Estado servidor | TanStack Query v5 |
| Estado cliente | Zustand |
| Formularios | React Hook Form + Zod |
| Routing | React Router v7 |
| Microservicio padrón | Python + FastAPI (Dotaneitor) |
| Monorepo | pnpm workspaces + Turborepo |
| Contenedores | Docker + docker-compose |

---

## 3. ALCANCE MVP

### Dentro del alcance

- Infraestructura base: Docker, PostgreSQL, API, Web
- Dotaneitor integrado: procesamiento semanal del padrón Excel
- Padrón semanal: carga, diff, validación y aprobación
- Personas y cargos: visualización y búsqueda
- Seguimiento concursos CPH (Ley 6.035)
- Seguimiento concursos CEETPS — ENF, TEC, EG
- Bajas consolidadas conectadas al flujo concursal
- Tablero de KPIs de dotación y concursales
- Autenticación con roles

### Fuera del alcance (primera etapa)

- Portal Postulante
- Integración API TAD (manual)
- Firma digital
- Integración Hacienda (manual)
- Integración con otros sistemas GCBA

### Actores del sistema

| Actor | Rol | Ejemplos |
| ----- | --- | -------- |
| admin | Configuración, usuarios, carga masiva | Agus, Jorge |
| editor | Lectura + escritura en todos los módulos | Lucas y equipo |
| director y usuarios | Solo lectura de su nicho | Autoridades Superiores |
| concursales_cph | Lectura total + escritura concursos CPH y bajas | Alexis, Rijana e equipo |
| concursales_ceetps | Lectura total + escritura concursos CEETPS y bajas | Alexi, Laura e Equipo |

---

## 4. BACKLOG — Fuera de sprints actuales

| # | Tarea | Motivo de postergación |
| - | ----- | ---------------------- |
| B-1 | Portal Postulante | Sistema separado, fuera de alcance |
| B-2 | Integración API TAD | No disponible en primera etapa |
| B-3 | Firma digital real | No disponible en primera etapa |
| B-4 | Integración Hacienda | No disponible en primera etapa |
| B-5 | Redis cache para KPIs pesados | No necesario en arranque |
| B-6 | Módulo de recorridas | No urgente para MVP |
| B-7 | Notificaciones por email | Segunda fase |
| B-8 | App mobile nativa | Segunda fase |
| B-9 | Multi-tab refresh token coordination (`BroadcastChannel`) | Trade-off aceptado con localStorage |
| B-10 | Migrar refresh token a cookie httpOnly + endpoint `/me` | Mejora de seguridad XSS — no priorizado para MVP |
| B-12 | Identidad del cargo en padrón SIAL por clave estructural en vez de `id_sial` | Planificado en `Concursos-CPH.md` como S8-1, no implementado en Sprint 8 |
| B-13 | `fechaHasta` / supresión de cargo con acto administrativo de baja | Flujo de bajas, no de altas |
| B-14 | Vincular expediente de alta con expediente de baja (contrapartida) | Requiere modelado de actos administrativos como entidad propia |

---

## 5. FLUJO DE DEPLOY

```
Desarrollo local
  → git push origin feature/xxx
  → PR a develop
  → Review + merge

Staging:
  → Servidor propio (VPS)
  → docker-compose up -d
  → prisma migrate deploy

Producción:
  → docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
  → prisma migrate deploy
  → Caddy: TLS automático (Let's Encrypt)
```

Ver `Doc/DEPLOY_PRODUCCION.md` para el detalle completo.

---

## 6. REGISTRO DE DECISIONES

| Fecha | Decisión | Motivo |
| ----- | --------- | ------ |
| 2026-09 | Sin deadline fijo — calidad por etapa | Prioridad en corrección, no en velocidad |
| 2026-09 | Dotaneitor: analizar y optimizar, no reescribir | Ya funciona, Python es el lenguaje correcto |
| 2026-09 | PostgreSQL sobre MySQL | Particionado, full-text search, window functions |
| 2026-09 | shadcn/ui + Tailwind con tokens Obelisco | Stack moderno + identidad institucional GCBA |
| 2026-09 | Zustand para estado de auth | TanStack Query para servidor, Zustand para cliente |
| 2026-09 | Docker desde el día 1 | Entorno local = producción, deploy trivial |
| 2026-09 | UUID como PK en todas las tablas | Sin autoincremental, distribuible |
| 2026-09 | Soft delete en todas las tablas | Histórico inmutable, nunca DELETE en producción |
| 2026-08-26 | Estimados de horas son referenciales, no compromisos | Cada sprint genera trabajo de verificación/corrección no planificado |
| 2026-08-26 | DoD actualizado: "PR aprobado" → "avisar antes de tocar módulo compartido" | El equipo nunca usó PRs; la regla que sí se cumple es la coordinación previa |
| 2026-08-26 | `PadronHistorico` necesita `cuil` desnormalizado + `@@index([cargoId])` + `unificadorPuesto` antes de KPIs | Sin `cuil` no se pueden contar personas únicas por período sin join |
| 2026-09-02 | `escalafon_codigos_registro` como fuente de verdad para normalizar escalafones del padrón | Los escalafones se creaban on-the-fly con texto libre del Excel, generando duplicados |
| 2026-09-02 | Migraciones sin UUIDs hardcodeados — usar `nombre`/`slug`/`id_sial`/`cuil` | Los UUIDs difieren entre local y Neon; cualquier migración con UUID hardcodeado falla en el otro entorno |
| 2026-09-02 | `export enum` → `export const X = {...} as const` + `export type` en `packages/types` | Node 22 (Render) usa strip-only mode y no transpila `enum` TypeScript |
| 2026-09-02 | Sincronización Neon por CSV + SQL portable, no por dump/restore | Los UUIDs difieren entre entornos; un dump restauraría UUIDs locales rompiendo las FKs de Neon |
| 2026-09-03 | `EvolucionDotacionChart` rediseñado como dashboard ejecutivo con small multiples | Un solo gráfico de línea con 14 series era ilegible |
| 2026-09-10 | Columna `especialidad` renombrada a `especialidad_legacy` en `cargos`; patrón de fallback `especialidadLegacy ?? especialidad` en todo el frontend | Migración `20260910000001_especialidades_fk`; `especialidad` en tipo `Cargo` marcado `@deprecated` |
| 2026-09-10 | pg_trgm instalado; threshold `> 0.4` para búsqueda fuzzy de especialidades | Cubre variantes morfológicas (cardiologo → Cardiologia) |

---

## 7. MÉTRICAS OBJETIVO

| Métrica | Objetivo |
| ------- | -------- |
| Tiempo de procesamiento padrón semanal | < 60 segundos para 48k registros |
| Tiempo de carga del tablero | < 3 segundos |
| Búsqueda de personas | < 500ms con full-text search |
| Errores en producción post-deploy | 0 críticos |
| Cobertura de flujo concursal CPH | 100% de sub-estados implementados |
| Cobertura de flujo concursal CEETPS | 100% de estados implementados |
