# PLAN SCRUM — SRRHH v2
# Sistema de Recursos Humanos — Gobierno de la Ciudad de Buenos Aires

> Documento maestro de planificación ágil. Estado general, decisiones transversales y backlog.
> El **detalle completo de cada sprint** (tareas, hallazgos, verificaciones) vive en `Sprints/`.
> Última actualización: 2026-09 (Post-Sprint 15 — Organigrama: personas en cargos, PersonaModal enriquecido, vínculos a persona/cargo)
>
> 📋 **Gestión de tareas:** [Notion — SRRHH v2](https://app.notion.com/p/42d483af08924aef9d4fcb102fc72756?v=7f5beedb27ed4251a8c790a1d20c6841&source=copy_link)
>
> 📁 **Detalle de cada sprint:** `Doc/Planificacion/Sprints/`
> 📐 **Contratos y especificaciones:** `Doc/` (ver § Vinculación de contratos)

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
| Sprint 11 — Flujo concursal CPH con autorizaciones | ✅ Completo — 2026-09-03 | S11-1 a S11-7 | `Sprints/SPRINT_11_autorizaciones_cph.md` |
| Sprint 12 — UX bajas + wizard CPH + permisos UI | ✅ Completo — 2026-09-03 | S12-1 a S12-6 | `Sprints/SPRINT_12_13_ux_bajas_autorizaciones.md` |
| Post-Sprint 12 — Auditoría especialidad_legacy + pg_trgm | ✅ Completo — commit `af1c3f1` | — | `Sprints/POST_SPRINT_12_especialidad_legacy.md` |
| Sprint 13 — Panel de autorizaciones + jerarquía de roles | ✅ Completo — backend 2026-09-11 (Jorge), frontend 2026-09-04 (Agustín) | S13-1 a S13-8, S13-A a S13-E | `Sprints/SPRINT_12_13_ux_bajas_autorizaciones.md` |
| Post-Sprint 13 — Validación de Bajas: triangulación SIAL + filtros | ✅ Completo — 2026-09 | — | `Sprints/POST_SPRINT_13_validacion_bajas_sial.md` |
| Sprint 14 — Concurso desde Alta de Cargo | ✅ Completado — commits `06a8b84`, `815f7f9`, `cfb6cd0` | S14-1 a S14-10 | `Sprints/SPRINT_14_concurso_desde_alta.md` |
| Post-Sprint 14 — Migración legacy organigrama | ✅ Completo — 2026-09-09 | — | `Sprints/POST_SPRINT_14_migracion_legacy_organigrama.md` |
| Post-Sprint 15 — Organigrama: personas en cargos + PersonaModal | ✅ Completo — commits `345bc28`…`0dc226a` | — | `Sprints/POST_SPRINT_14_migracion_legacy_organigrama.md` |
| Post-Sprint 14 — Personas/Cargos exportables | ✅ Completo — 2026-09-07 | — | `Sprints/POST_SPRINT_14_personas_cargos_exportables.md` |
| Sprint 15 — Autorización de Baja de Cargo | ✅ Completado — commit `b9d20de`, 2026-09 | S15-1 a S15-8 | `Sprints/SPRINT_15_baja_cargo_autorizacion.md` |
| Post-Sprint 15B — Pendientes menores | ✅ Completo — commits `1f0744a`, `3895916` | — | (ver abajo) |
| Sprint 16 — Flujo completo Vacante → Designación | 📋 Planificado | S16-1 a S16-9 | `Sprints/SPRINT_16_flujo_vacante_designacion.md` |
| Post-Sprint 16 — Corrección modelo Desierto CPH | 📋 Planificado | PS16D-1 a PS16D-8 | `Sprints/POST_SPRINT_16_desierto_cph.md` |

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
- [ ] Documentación actualizada (este doc + archivos Doc/ y Sprints/)
- [ ] Avisado por Notion/chat antes de tocar un módulo que otro dev pueda estar trabajando en paralelo

> El DoD original decía "PR aprobado" pero el equipo nunca usó PRs. Se reemplaza por la regla que sí se cumple: avisar antes de tocar un módulo compartido (ver choque Sprint 3 en `Sprints/SPRINT_03_personas_cargos.md`).

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
│   └── dotaneitor/    ← Microservicio Python (procesamiento Excel padrón)
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

> Detalle y justificación de cada elección: `Doc/Contrato_Tecnologias.md`

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
- Autenticación con roles + RBAC dinámico
- Notificaciones persistidas
- Autorizaciones (alta/baja de cargo, cambios CPH)
- Concurso desde alta de cargo

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

## 4. VINCULACIÓN DE CONTRATOS

Este proyecto se rige por **contratos** que son fuente de verdad en su dominio. Ninguna decisión de implementación puede contradecirlos sin actualizarlos primero.

| Contrato | Archivo | Dominio | Estado |
| -------- | ------- | ------- | ------ |
| **Contrato de Datos** | `Doc/Contrato_Datos.md` | Modelo de datos, tablas, relaciones, invariantes, flujo del padrón semanal | VIGENTE |
| **Contrato de Backend** | `Doc/Contrato_Back.md` | Arquitectura API, endpoints, RBAC, módulos, reglas de negocio backend | VIGENTE |
| **Contrato de Frontend** | `Doc/Contrato_front.md` | Arquitectura React, TanStack Query, routing, componentes, convenciones | VIGENTE |
| **Contrato de Diseño** | `Doc/Contrato_Diseño.md` | Tokens Obelisco GCBA, paleta, tipografía, componentes UX, accesibilidad | VIGENTE |
| **Contrato de Tecnologías** | `Doc/Contrato_Tecnologias.md` | Stack definitivo, decisiones técnicas justificadas, lo que NO se usa | APROBADO |
| **Contrato de Lógica de Cargo** | `Doc/Contrato_logica-cargo.md` | Ciclo de vida del cargo, estados, transiciones, identidad estructural | VIGENTE |
| **Contrato de Repositorios** | `Doc/CONTRATO_REPOSITORIOS.md` | Remotes git, ramas, flujo de deploy, entornos | VIGENTE |
| **Contratos de Página** | `Doc/Contratos_Paginas/` | Especificación detallada por página (actualmente: `cargos_alta.md`) | VIGENTE |

### Regla de vinculación

- Antes de modificar el **schema de BD** → actualizar `Contrato_Datos.md`
- Antes de agregar un **endpoint o módulo** → actualizar `Contrato_Back.md`
- Antes de agregar una **página o componente** → actualizar `Contrato_front.md` y `Contrato_Diseño.md`
- Antes de cambiar una **tecnología o librería** → actualizar `Contrato_Tecnologias.md`
- Antes de tocar la **lógica de cargos/ocupaciones** → verificar `Contrato_logica-cargo.md`
- Antes de hacer **push/deploy** → verificar `CONTRATO_REPOSITORIOS.md`

---

## 5. BACKLOG — Fuera de sprints actuales

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
| B-9 | Multi-tab refresh token coordination (`BroadcastChannel`) | Trade-off aceptado con localStorage — no priorizado |
| B-10 | Migrar refresh token a cookie httpOnly + endpoint `/me` | Mejora de seguridad XSS — no priorizado para MVP |
| B-11 | Export Excel consolidado de concursos/bajas (legacy `exportBajasToExcel` / `exportSeguimientoToExcel`) | Confirmado como gap real — planificar en sprint dedicado |
| B-12 | ~~Identidad del cargo en padrón SIAL por clave estructural~~ | ✅ Resuelto — commit `3895916` |
| B-13 | Acto administrativo de baja como entidad propia (expediente + resolución) | Incluido en Sprint 16 (GAP 3) |
| B-14 | Vincular expediente de alta con expediente de baja (contrapartida) | Incluido en Sprint 16 (GAP 3) |

---

## 6. FLUJO DE DEPLOY

```
Desarrollo local
  → git push origin feature/xxx
  → merge a develop
  → merge a main

Staging (testing manual):
  → git push deploy main  (remote Jorge-Loyo/srrhh-v2)
  → Redeploy automático en Vercel (frontend) + Render (API) + Neon (BD)

Producción:
  → docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
  → prisma migrate deploy
  → Caddy: TLS automático (Let's Encrypt)
```

Ver `Doc/DEPLOY_PRODUCCION.md` para el detalle completo y `Doc/CONTRATO_REPOSITORIOS.md` para la gestión de remotes.

---

## 7. REGISTRO DE DECISIONES

| Fecha | Decisión | Motivo | Contrato afectado |
| ----- | --------- | ------ | ----------------- |
| 2026-09 | Sin deadline fijo — calidad por etapa | Prioridad en corrección, no en velocidad | — |
| 2026-09 | Dotaneitor: analizar y optimizar, no reescribir | Ya funciona, Python es el lenguaje correcto | `Contrato_Tecnologias.md` |
| 2026-09 | PostgreSQL sobre MySQL | Particionado, full-text search, window functions | `Contrato_Tecnologias.md` |
| 2026-09 | shadcn/ui + Tailwind con tokens Obelisco | Stack moderno + identidad institucional GCBA | `Contrato_Diseño.md` |
| 2026-09 | Zustand para estado de auth | TanStack Query para servidor, Zustand para cliente | `Contrato_front.md` |
| 2026-09 | Docker desde el día 1 | Entorno local = producción, deploy trivial | `Contrato_Tecnologias.md` |
| 2026-09 | UUID como PK en todas las tablas | Sin autoincremental, distribuible | `Contrato_Datos.md` |
| 2026-09 | Soft delete en todas las tablas | Histórico inmutable, nunca DELETE en producción | `Contrato_Datos.md` |
| 2026-08-26 | Estimados de horas son referenciales, no compromisos | Cada sprint genera trabajo de verificación/corrección no planificado | — |
| 2026-08-26 | DoD actualizado: "PR aprobado" → "avisar antes de tocar módulo compartido" | El equipo nunca usó PRs; la regla que sí se cumple es la coordinación previa | — |
| 2026-08-26 | `PadronHistorico` necesita `cuil` desnormalizado + `@@index([cargoId])` + `unificadorPuesto` antes de KPIs | Sin `cuil` no se pueden contar personas únicas por período sin join | `Contrato_Datos.md` |
| 2026-09-02 | `codigos_registro` como fuente de verdad para normalizar escalafones del padrón | Los escalafones se creaban on-the-fly con texto libre del Excel, generando duplicados | `Contrato_Datos.md` |
| 2026-09-02 | Migraciones sin UUIDs hardcodeados — usar `nombre`/`slug`/`id_sial`/`cuil` | Los UUIDs difieren entre local y Neon; cualquier migración con UUID hardcodeado falla en el otro entorno | — |
| 2026-09-02 | `export enum` → `export const X = {...} as const` + `export type` en `packages/types` | Node 22 (Render) usa strip-only mode y no transpila `enum` TypeScript | `Contrato_Tecnologias.md` |
| 2026-09-02 | Sincronización Neon por CSV + SQL portable, no por dump/restore | Los UUIDs difieren entre entornos; un dump restauraría UUIDs locales rompiendo las FKs de Neon | — |
| 2026-09-03 | `EvolucionDotacionChart` rediseñado como dashboard ejecutivo con small multiples | Un solo gráfico de línea con 14 series era ilegible | `Contrato_Diseño.md` |
| 2026-09-10 | Columna `especialidad` renombrada a `especialidad_legacy` en `cargos`; patrón de fallback `especialidadLegacy ?? especialidad` en todo el frontend | Migración `20260910000001_especialidades_fk`; `especialidad` en tipo `Cargo` marcado `@deprecated` | `Contrato_Datos.md`, `Contrato_Back.md` |
| 2026-09-10 | pg_trgm instalado; threshold `> 0.4` para búsqueda fuzzy de especialidades | Cubre variantes morfológicas (cardiologo → Cardiologia) | `Contrato_Datos.md` |
| 2026-09 | B-12 resuelto: lookup por clave estructural `(hospital, escalafon, codigo_repa, literal_puesto)` antes de crear cargo nuevo al aprobar diffs del padrón | Evita duplicar cargos cuando SIAL asigna nuevo `id_sial` al mismo puesto estructural | `Contrato_logica-cargo.md` |

---

## 8. MÉTRICAS OBJETIVO

| Métrica | Objetivo |
| ------- | -------- |
| Tiempo de procesamiento padrón semanal | < 60 segundos para 48k registros |
| Tiempo de carga del tablero | < 3 segundos |
| Búsqueda de personas | < 500ms con full-text search |
| Errores en producción post-deploy | 0 críticos |
| Cobertura de flujo concursal CPH | 100% de sub-estados implementados |
| Cobertura de flujo concursal CEETPS | 100% de estados implementados |
