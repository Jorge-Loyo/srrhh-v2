# PLAN SCRUM — SRRHH v2

# Sistema de Recursos Humanos — Gobierno de la Ciudad de Buenos Aires

> Documento de planificación ágil. Fuente de verdad para sprints, tareas y decisiones de alcance.
> Última actualización: 2026-09
>
> 📋 **Gestión de tareas:** [Notion — SRRHH v2](https://app.notion.com/p/42d483af08924aef9d4fcb102fc72756?v=7f5beedb27ed4251a8c790a1d20c6841&source=copy_link)

---

## ESTADO ACTUAL

| Sprint                              | Estado        | Completado                   |
| ----------------------------------- | ------------- | ---------------------------- |
| Sprint 0 — Infraestructura          | ✅ Completado | S0-1, S0-2, S0-3, S0-8, S0-9 |
| Sprint 1 — Autenticación            | 🔄 En curso   | —                            |
| Sprint 2 — Dotaneitor + Padrón      | ⏳ Pendiente  | —                            |
| Sprint 3 — Personas y Cargos        | ⏳ Pendiente  | —                            |
| Sprint 4 — Concursos CPH            | ⏳ Pendiente  | —                            |
| Sprint 5 — Concursos CEETPS + Bajas | ⏳ Pendiente  | —                            |
| Sprint 6 — KPIs + Deploy            | ⏳ Pendiente  | —                            |

---

## 1. CONTEXTO DEL EQUIPO

| Parámetro          | Valor                                                |
| ------------------ | ---------------------------------------------------- |
| Equipo             | Jorge (Dev 1 — Backend) + Agustin (Dev 2 — Frontend) |
| Capacidad          | 30h/semana por dev = 60h/semana totales              |
| Duración de sprint | 1–2 semanas según complejidad                        |
| Ceremonia          | Review + Retro semanal                               |
| Herramienta        | Notion                                               |
| Sin daily          | Comunicación asíncrona                               |
| Deadline MVP       | Sin fecha fija — prioridad: calidad por etapa        |

### Definición de Done (DoD)

Un ítem está terminado cuando:

- [ ] Funcionalidad implementada y probada manualmente
- [ ] Sin regresiones en módulos existentes
- [ ] Documentación actualizada (este doc + archivos Doc/)
- [ ] Código en rama `develop` con PR aprobado

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

| Capa                 | Tecnología                           |
| -------------------- | ------------------------------------ |
| Base de datos        | PostgreSQL 16 (Docker)               |
| ORM                  | Prisma 5.x                           |
| Backend              | Node 20 + TypeScript + Fastify 4     |
| Frontend             | React 18 + Vite 5 + Tailwind CSS     |
| Design system        | Tokens Obelisco GCBA sobre shadcn/ui |
| Estado servidor      | TanStack Query v5                    |
| Estado cliente       | Zustand                              |
| Formularios          | React Hook Form + Zod                |
| Routing              | React Router v7                      |
| Microservicio padrón | Python + FastAPI (Dotaneitor)        |
| Monorepo             | pnpm workspaces + Turborepo          |
| Contenedores         | Docker + docker-compose              |

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

| Actor               | Rol                                                | Ejemplos                 |
| ------------------- | -------------------------------------------------- | ------------------------ |
| admin               | Configuración, usuarios, carga masiva              | Agus, Jorge              |
| editor              | Lectura + escritura en todos los módulos           | Lucas y equipo           |
| director y usuarios | Solo lectura de su de nicho                        | Autoridades Superiores   |
| concursales_cph     | Lectura total + escritura concursos CPH y bajas    | Alexis, Rijana e eequipo |
| concursales_ceetps  | Lectura total + escritura concursos CEETPS y bajas | Alexi, Laura e Equipo    |

---

## 4. SPRINTS

---

### SPRINT 0 — Infraestructura base + análisis Dotaneitor

**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Entorno de desarrollo 100% funcional y Dotaneitor documentado.

| #     | Tarea                                                                  | Dev     | Est. | Prioridad  |
| ----- | ---------------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S0-1  | Levantar PostgreSQL con Docker (WSL), verificar conexión               | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S0-2  | Ejecutar `prisma migrate dev` — primera migración                      | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S0-3  | Verificar que API arranca y responde `/health`                         | Jorge   | 1h   | 🔴 Crítico | ✅  |
| S0-4  | Verificar que Web arranca y muestra LoginPage                          | Agustin | 1h   | 🔴 Crítico | ⏳  |
| S0-5  | Leer y documentar código Dotaneitor: endpoints, lógica, inputs/outputs | Agustin | 8h   | 🔴 Crítico | ⏳  |
| S0-6  | Mapear columnas del Excel de padrón → campos del schema Prisma         | Agustin | 4h   | 🔴 Crítico | ⏳  |
| S0-7  | Identificar deuda técnica y optimizaciones del Dotaneitor              | Agustin | 4h   | 🟡 Medio   | ⏳  |
| S0-8  | Crear `services/dotaneitor/` con Dockerfile y README                   | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S0-9  | Seed de datos de prueba: hospitales, escalafones, usuario admin        | Jorge   | 4h   | 🟡 Medio   | ✅  |
| S0-10 | Documentar hallazgos Dotaneitor en `Doc/Dotaneitor_Analisis.md`        | Agustin | 3h   | 🟡 Medio   | ⏳  |
| S0-11 | Configurar GitHub Actions: lint + build en PR                          | Jorge   | 3h   | 🟢 Bajo    | ✅  |

**Criterio de éxito:**

- `docker-compose up` levanta PostgreSQL, API y Web sin errores
- `GET /health` responde `{ status: 'ok' }`
- LoginPage visible en `http://localhost:5173`
- Dotaneitor documentado: sabemos exactamente qué hace, qué recibe y qué devuelve
- Documento `Doc/Dotaneitor_Analisis.md` completo

---

### SPRINT 1 — Autenticación + usuarios + seed real

**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Login funcional con roles, usuarios reales en BD.
**Estado:** 🔄 En curso

> **Nota:** S1-8 (seed hospitales/escalafones/admin) fue adelantado y completado en Sprint 0 como S0-9.

| #     | Tarea                                                         | Dev     | Est. | Prioridad  |
| ----- | ------------------------------------------------------------- | ------- | ---- | ---------- |
| S1-1  | Completar `auth.service.ts`: login con bcrypt + JWT           | Jorge   | 4h   | 🔴 Crítico |
| S1-2  | Refresh token: rotación + detección de reutilización          | Jorge   | 6h   | 🔴 Crítico |
| S1-3  | Endpoint `POST /api/v1/auth/logout` — revocar token           | Jorge   | 2h   | 🔴 Crítico |
| S1-4  | Middleware `authenticate` + `requireRole` integrados en rutas | Jorge   | 3h   | 🔴 Crítico |
| S1-5  | CRUD usuarios: listar, crear, activar/desactivar (solo admin) | Agustin | 6h   | 🔴 Crítico |
| S1-6  | LoginPage: conectar con API real, manejo de errores           | Agustin | 3h   | 🔴 Crítico |
| S1-7  | ProtectedRoute: redirigir a /login si no autenticado          | Agustin | 2h   | 🔴 Crítico |
| S1-8  | Seed: hospitales reales + escalafones + usuario admin inicial | Jorge   | 4h   | 🟡 Medio   |
| S1-9  | Página Admin/Usuarios: tabla + formulario crear usuario       | Agustin | 6h   | 🟡 Medio   |
| S1-10 | Audit log: middleware registra toda escritura automáticamente | Jorge   | 3h   | 🟡 Medio   |

**Criterio de éxito:**

- Login con usuario/contraseña real funciona end-to-end
- Refresh token rota correctamente
- Admin puede crear usuarios con roles
- Toda escritura queda en `audit_logs`

---

### SPRINT 2 — Dotaneitor optimizado + integración padrón

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Dotaneitor optimizado y conectado al flujo de padrón de SRRHH v2.

| #     | Tarea                                                                     | Dev     | Est. | Prioridad  |
| ----- | ------------------------------------------------------------------------- | ------- | ---- | ---------- |
| S2-1  | Aplicar optimizaciones identificadas en Sprint 0 al Dotaneitor            | Agustin | 12h  | 🔴 Crítico |
| S2-2  | Endpoint `POST /api/v1/padron/upload`: recibe Excel, crea snapshot        | Jorge   | 6h   | 🔴 Crítico |
| S2-3  | Integración Node → Python: enviar archivo, recibir diff                   | Jorge   | 8h   | 🔴 Crítico |
| S2-4  | Guardar `padron_diff` en BD con resultado del Dotaneitor                  | Jorge   | 4h   | 🔴 Crítico |
| S2-5  | Endpoint `GET /api/v1/padron/snapshots/:id/diff` paginado                 | Jorge   | 4h   | 🔴 Crítico |
| S2-6  | Endpoint `POST /api/v1/padron/snapshots/:id/aprobar`                      | Jorge   | 8h   | 🔴 Crítico |
| S2-7  | Lógica de aprobación: actualizar ocupaciones, personas, cargos, historico | Jorge   | 10h  | 🔴 Crítico |
| S2-8  | Endpoint `POST /api/v1/padron/snapshots/:id/rechazar`                     | Jorge   | 2h   | 🔴 Crítico |
| S2-9  | PadronPage: subir archivo + ver estado del job                            | Agustin | 8h   | 🔴 Crítico |
| S2-10 | PadronDiffPage: tabs Nuevos / Modificados / Eliminados                    | Agustin | 10h  | 🔴 Crítico |
| S2-11 | Badge en header cuando hay snapshot pendiente                             | Agustin | 2h   | 🟡 Medio   |
| S2-12 | Bloqueo: no se puede subir nuevo archivo con snapshot pendiente           | Jorge   | 2h   | 🔴 Crítico |

**Criterio de éxito:**

- Flujo completo: subir Excel → ver diff → aprobar → datos en BD
- Dotaneitor optimizado y documentado
- `padron_historico` se popula correctamente al aprobar
- Bloqueo de doble carga funciona

---

### SPRINT 3 — Personas y Cargos

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulos de personas y cargos completamente funcionales.

| #     | Tarea                                                           | Dev     | Est. | Prioridad  |
| ----- | --------------------------------------------------------------- | ------- | ---- | ---------- |
| S3-1  | `GET /api/v1/personas` paginado con full-text search PostgreSQL | Jorge   | 6h   | 🔴 Crítico |
| S3-2  | `GET /api/v1/personas/:id` con ocupaciones activas              | Jorge   | 3h   | 🔴 Crítico |
| S3-3  | Filtros personas: hospital, escalafón, activo, búsqueda libre   | Jorge   | 4h   | 🟡 Medio   |
| S3-4  | `GET /api/v1/cargos` paginado con filtros                       | Jorge   | 4h   | 🔴 Crítico |
| S3-5  | `GET /api/v1/cargos/:id` con ocupación actual                   | Jorge   | 3h   | 🔴 Crítico |
| S3-6  | PersonasPage: tabla con búsqueda debounce 300ms                 | Agustin | 8h   | 🔴 Crítico |
| S3-7  | PersonaDetailPanel: panel lateral con datos + ocupaciones       | Agustin | 8h   | 🔴 Crítico |
| S3-8  | CargosPage: tabla con filtros por hospital y escalafón          | Agustin | 8h   | 🔴 Crítico |
| S3-9  | CargoDetailPanel: panel lateral con cargo + persona actual      | Agustin | 6h   | 🟡 Medio   |
| S3-10 | Exportar a Excel desde PersonasPage y CargosPage                | Agustin | 4h   | 🟢 Bajo    |
| S3-11 | Índice GIN tsvector en `personas.apellido_nombre` (migración)   | Jorge   | 3h   | 🟡 Medio   |

**Criterio de éxito:**

- Búsqueda de personas por nombre/CUIL/DNI funciona con full-text search
- Filtros por hospital y escalafón funcionan
- Panel de detalle muestra ocupaciones activas
- Exportación a Excel disponible

---

### SPRINT 4 — Concursos CPH

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulo de seguimiento CPH completamente funcional.

| #     | Tarea                                                         | Dev     | Est. | Prioridad  |
| ----- | ------------------------------------------------------------- | ------- | ---- | ---------- |
| S4-1  | `GET /api/v1/concursos-cph` paginado con filtros              | Jorge   | 5h   | 🔴 Crítico |
| S4-2  | `GET /api/v1/concursos-cph/:id` detalle completo              | Jorge   | 3h   | 🔴 Crítico |
| S4-3  | `PATCH /api/v1/concursos-cph/:id` actualizar campos por fase  | Jorge   | 6h   | 🔴 Crítico |
| S4-4  | Lógica `calcSubEstado`: 18 niveles calculados automáticamente | Jorge   | 8h   | 🔴 Crítico |
| S4-5  | `POST /api/v1/concursos-cph/:id/suspender`                    | Jorge   | 2h   | 🟡 Medio   |
| S4-6  | `POST /api/v1/concursos` crear concurso desde baja            | Jorge   | 4h   | 🔴 Crítico |
| S4-7  | ConcursosCphPage: tabla con sub-estado, filtros, alertas      | Agustin | 10h  | 🔴 Crítico |
| S4-8  | ConcursoCphDetail: formulario completo por fases              | Agustin | 12h  | 🔴 Crítico |
| S4-9  | Timeline visual del sub-estado (barra de progreso)            | Agustin | 6h   | 🟡 Medio   |
| S4-10 | Alertas: concursos sin movimiento > 30/60/90 días             | Agustin | 4h   | 🟡 Medio   |
| S4-11 | `GET /api/v1/kpis/concursos-cph` para tablero                 | Jorge   | 4h   | 🟡 Medio   |

**Criterio de éxito:**

- Sub-estado calculado automáticamente, no editable manualmente
- Alexis/CPH puede ver y actualizar todos sus concursos
- Alertas visibles para concursos estancados
- KPIs disponibles para el tablero

---

### SPRINT 5 — Concursos CEETPS + Bajas

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulo CEETPS y flujo baja → concurso funcional.

| #    | Tarea                                                              | Dev     | Est. | Prioridad  |
| ---- | ------------------------------------------------------------------ | ------- | ---- | ---------- |
| S5-1 | `GET/PATCH /api/v1/concursos-ceetps` con filtros                   | Jorge   | 6h   | 🔴 Crítico |
| S5-2 | ConcursosCeetpsPage: tabla con estado, escalafón, filtros          | Agustin | 10h  | 🔴 Crítico |
| S5-3 | ConcursoCeetpsDetail: formulario por fases ENF/TEC/EG              | Agustin | 10h  | 🔴 Crítico |
| S5-4 | Módulo Bajas: `POST /api/v1/concursos` con origen baja             | Jorge   | 6h   | 🔴 Crítico |
| S5-5 | Lógica: baja con `genera_concurso` → crea seguimiento automático   | Jorge   | 6h   | 🔴 Crítico |
| S5-6 | BajasPage: tabla + formulario nueva baja                           | Agustin | 8h   | 🔴 Crítico |
| S5-7 | Conexión baja → cargo: marcar cargo `no_vigente` al registrar baja | Jorge   | 4h   | 🔴 Crítico |
| S5-8 | `GET /api/v1/kpis/concursos-ceetps` para tablero                   | Jorge   | 3h   | 🟡 Medio   |
| S5-9 | Alertas CEETPS: concursos sin movimiento                           | Agustin | 3h   | 🟡 Medio   |

**Criterio de éxito:**

- Rijana puede gestionar concursos CEETPS desde la app
- Una baja genera automáticamente el seguimiento correspondiente
- El cargo se marca `no_vigente` al registrar la baja

---

### SPRINT 6 — Tablero KPIs + cierre MVP

**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Dashboard operativo con KPIs reales y sistema listo para producción.

| #    | Tarea                                                                           | Dev             | Est. | Prioridad  |
| ---- | ------------------------------------------------------------------------------- | --------------- | ---- | ---------- |
| S6-1 | `GET /api/v1/kpis/dotacion`: total vigentes, vacantes, por carrera, por efector | Jorge           | 6h   | 🔴 Crítico |
| S6-2 | KpisPage: cards con borde amarillo, skeleton loading                            | Agustin         | 6h   | 🔴 Crítico |
| S6-3 | KPIs concursales: por sub-estado, tiempo promedio por etapa                     | Jorge           | 6h   | 🔴 Crítico |
| S6-4 | Filtro por hospital en todo el tablero                                          | Agustin         | 4h   | 🟡 Medio   |
| S6-5 | Gráfico evolución dotación histórica (padron_historico)                         | Agustin         | 6h   | 🟡 Medio   |
| S6-6 | Alertas activas: concursos vencidos, bajas sin concurso                         | Jorge           | 4h   | 🟡 Medio   |
| S6-7 | Preparar docker-compose de producción                                           | Jorge           | 4h   | 🔴 Crítico |
| S6-8 | Smoke test completo del sistema                                                 | Jorge + Agustin | 4h   | 🔴 Crítico |

**Criterio de éxito:**

- Tablero carga en < 3 segundos
- KPIs reflejan datos reales del padrón aprobado
- Sistema listo para deploy en servidor propio

---

## 5. BACKLOG — Fuera de sprints actuales

| #   | Tarea                         | Motivo de postergación             |
| --- | ----------------------------- | ---------------------------------- |
| B-1 | Portal Postulante             | Sistema separado, fuera de alcance |
| B-2 | Integración API TAD           | No disponible en primera etapa     |
| B-3 | Firma digital real            | No disponible en primera etapa     |
| B-4 | Integración Hacienda          | No disponible en primera etapa     |
| B-5 | Redis cache para KPIs pesados | No necesario en arranque           |
| B-6 | Módulo de recorridas          | No urgente para MVP                |
| B-7 | Notificaciones por email      | Segunda fase                       |
| B-8 | App mobile nativa             | Segunda fase                       |

---

## 6. FLUJO DE DEPLOY

```
Desarrollo local
  → git push origin feature/xxx
  → PR a develop
  → Review + merge

Staging (a definir):
  → Servidor propio (VPS)
  → docker-compose up -d
  → prisma migrate deploy

Producción:
  → Servidor propio
  → Infraestructura a definir en Sprint 6
```

---

## 7. REGISTRO DE DECISIONES

| Fecha   | Decisión                                        | Motivo                                                |
| ------- | ----------------------------------------------- | ----------------------------------------------------- |
| 2026-09 | Sin deadline fijo — calidad por etapa           | Prioridad en corrección, no en velocidad              |
| 2026-09 | Dotaneitor: analizar y optimizar, no reescribir | Ya funciona, Python es el lenguaje correcto para esto |
| 2026-09 | PostgreSQL sobre MySQL                          | Particionado, full-text search, window functions      |
| 2026-09 | shadcn/ui + Tailwind con tokens Obelisco        | Stack moderno + identidad institucional GCBA          |
| 2026-09 | Zustand para estado de auth                     | TanStack Query para servidor, Zustand para cliente    |
| 2026-09 | Docker desde el día 1                           | Entorno local = producción, deploy trivial            |
| 2026-09 | UUID como PK en todas las tablas                | Sin autoincremental, distribuible                     |
| 2026-09 | Soft delete en todas las tablas                 | Histórico inmutable, nunca DELETE en producción       |
| 2026-09 | Producción en servidor propio                   | A definir en Sprint 6                                 |

---

## 8. MÉTRICAS DE ÉXITO DEL MVP

| Métrica                                | Objetivo                          |
| -------------------------------------- | --------------------------------- |
| Tiempo de procesamiento padrón semanal | < 60 segundos para 48k registros  |
| Tiempo de carga del tablero            | < 3 segundos                      |
| Búsqueda de personas                   | < 500ms con full-text search      |
| Errores en producción post-deploy      | 0 críticos                        |
| Cobertura de flujo concursal CPH       | 100% de sub-estados implementados |
| Cobertura de flujo concursal CEETPS    | 100% de estados implementados     |
