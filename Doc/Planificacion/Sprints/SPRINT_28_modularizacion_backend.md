# SPRINT 28 — Modularización del backend

**Estado:** 📋 Planificado
**Prerrequisito:** Sprint 27 (modularización frontend) completo
**Duración estimada:** 1 semana | **Capacidad:** 30h | **Estimado:** ~24h

---

## Objetivo

Reorganizar `apps/api/src/modules/` de 30+ módulos planos a dominios agrupados por lógica
de negocio, espejando la estructura del frontend (`modules/[dominio]/`). Sin cambios de
comportamiento ni de contratos de API.

> **Regla de oro:** ningún endpoint cambia su ruta ni su contrato. Solo se mueven archivos
> y se actualizan imports. Cada bloque se valida con `tsc --noEmit` limpio antes de avanzar.

---

## Estructura objetivo

```
apps/api/src/modules/
│
├── cargos/                          ← dominio central (ya existe, se expande)
│   ├── cargos.routes.ts
│   ├── cargos.schema.ts
│   ├── cargos.service.ts
│   ├── nuevos-cargos.service.ts
│   ├── subEstado.repo.ts
│   ├── subEstado.ts
│   ├── concursoActivo.regla.ts
│   ├── retenciones/                 ← MOVER desde modules/retenciones/
│   │   ├── retenciones.routes.ts
│   │   ├── retenciones.schema.ts
│   │   └── retenciones.service.ts
│   ├── autorizaciones/              ← MOVER desde modules/autorizaciones/
│   │   ├── autorizaciones.routes.ts
│   │   ├── autorizaciones.schema.ts
│   │   └── autorizaciones.service.ts
│   └── solicitudes-alta/            ← MOVER desde modules/solicitudes-alta/
│       ├── solicitudes-alta.routes.ts
│       ├── solicitudes-alta.schema.ts
│       ├── solicitudes-alta.service.ts
│       └── solicitudes-alta.pdf.ts
│
├── personas/                        ← dominio central (ya existe, se expande)
│   ├── personas.routes.ts
│   ├── personas.schema.ts
│   ├── personas.service.ts
│   ├── bajas/                       ← MOVER desde modules/bajas/
│   │   ├── bajas.routes.ts
│   │   ├── bajas.schema.ts
│   │   ├── bajas.service.ts
│   │   ├── bajas.validacion.helpers.ts
│   │   └── bajas.validacion.helpers.test.ts
│   ├── bajas-sial/                  ← MOVER desde modules/bajas-sial/
│   │   ├── bajas-sial.routes.ts
│   │   ├── bajas-sial.schema.ts
│   │   └── bajas-sial.service.ts
│   └── perfil/                      ← MOVER desde modules/perfil/
│       ├── perfil.routes.ts
│       ├── perfil.schema.ts
│       └── perfil.service.ts
│
├── padron/                          ← ya existe, queda igual
│   ├── padron.routes.ts
│   ├── padron.schema.ts
│   ├── padron.service.ts
│   ├── derivarCodigoRegistro.ts
│   ├── derivarEspecialidadPuesto.ts
│   ├── derivarRegimen.ts
│   ├── padron.diff.helpers.ts
│   ├── padron.especialidad.helpers.ts
│   ├── padron.historico.helpers.ts
│   ├── reconciliarConduccion.ts
│   └── resolverPuestoCargo.ts
│
├── concursos/                       ← agrupar los 3 módulos de concursos
│   ├── concursos/                   ← MOVER desde modules/concursos/
│   │   ├── concursos.routes.ts
│   │   ├── concursos.schema.ts
│   │   ├── concursos.service.ts
│   │   ├── bandeja.service.ts
│   │   ├── bandeja-gestion.service.ts
│   │   ├── corregirTipo.schema.ts
│   │   └── corregirTipo.service.ts
│   ├── concursos-cph/               ← MOVER desde modules/concursos-cph/
│   │   ├── concursos-cph.routes.ts
│   │   ├── concursos-cph.schema.ts
│   │   ├── concursos-cph.service.ts
│   │   ├── concursosCph.calc.ts
│   │   ├── autorizacionNuevoCargo.ts
│   │   ├── bloqueoEtapa2.ts
│   │   ├── omElegibilidad.ts
│   │   ├── omSalto.service.ts
│   │   ├── omSaltoRevertir.ts
│   │   ├── recalcularCph.ts
│   │   ├── sorteoJurado.service.ts
│   │   ├── inscriptos.schema.ts
│   │   └── inscriptos.service.ts
│   └── concursos-ceetps/            ← MOVER desde modules/concursos-ceetps/
│       ├── concursos-ceetps.routes.ts
│       ├── concursos-ceetps.schema.ts
│       ├── concursos-ceetps.service.ts
│       ├── concursosCeetps.calc.ts
│       ├── autorizacionNuevoCargo.ts
│       └── recalcularCeetps.ts
│
├── dotacion/                        ← ya existe, queda igual
│   ├── dotacion.routes.ts
│   ├── dotacion.schema.ts
│   └── dotacion.service.ts
│
├── kpis/                            ← ya existe, queda igual
│   ├── kpis.routes.ts
│   ├── kpis.schema.ts
│   ├── kpis.service.ts
│   ├── cargos-indicadores.clasificacion.ts
│   ├── cargos-indicadores.schema.ts
│   ├── cargos-indicadores.service.ts
│   └── distribucion-cargos.service.ts
│
├── organigrama/                     ← ya existe, queda igual
│   ├── organigrama.routes.ts
│   ├── organigrama.schema.ts
│   └── organigrama.service.ts
│
├── pou/                             ← ya existe, queda igual
│   ├── pou.routes.ts
│   ├── pou.schema.ts
│   └── pou.service.ts
│
├── incidencias/                     ← ya existe, queda igual
│   ├── incidencias.routes.ts
│   ├── incidencias.schema.ts
│   ├── incidencias.service.ts
│   ├── incidencias.clasificacion.ts
│   ├── incidencias.gestionable.ts
│   ├── incidencias.persistidas.ts
│   ├── incidencias.tipos.ts
│   ├── incidencias.paso12.ts
│   ├── incidencias.bloqueados.ts
│   └── incidencias.baja-sin-concurso.ts
│
├── referencias/                     ← catálogos de referencia (agrupar)
│   ├── referencias/                 ← MOVER desde modules/referencias/
│   │   ├── referencias.routes.ts
│   │   ├── referencias.schema.ts
│   │   └── referencias.service.ts
│   ├── escalafones/                 ← MOVER desde modules/escalafones/
│   │   └── escalafones.routes.ts
│   ├── hospitales/                  ← MOVER desde modules/hospitales/
│   │   └── hospitales.routes.ts
│   ├── puestos/                     ← MOVER desde modules/puestos/
│   │   └── puestos.routes.ts
│   ├── puestos-cargo/               ← MOVER desde modules/puestos-cargo/
│   │   └── puestos-cargo.routes.ts
│   ├── codigos-registro/            ← MOVER desde modules/codigos-registro/
│   │   └── codigos-registro.routes.ts
│   └── etiquetas/                   ← MOVER desde modules/etiquetas/
│       ├── etiquetas.routes.ts
│       ├── etiquetas.schema.ts
│       └── etiquetas.service.ts
│
├── notificaciones/                  ← ya existe, queda igual
│   ├── notificaciones.routes.ts
│   ├── notificaciones.schema.ts
│   ├── notificaciones.service.ts
│   └── notificarSgrasv.ts
│
├── areas-programaticas/             ← ya existe, queda igual
│   ├── areas-programaticas.routes.ts
│   ├── areas-programaticas.service.ts
│   ├── cesacs.routes.ts
│   └── unidades-fijas.routes.ts
│
├── cadena-mando/                    ← ya existe, queda igual
│   ├── cadena-mando.routes.ts
│   └── cadena-mando.service.ts
│
├── comisiones/                      ← ya existe, queda igual
│   ├── comisiones.routes.ts
│   ├── comisiones.schema.ts
│   └── comisiones.service.ts
│
├── ordenes-merito/                  ← ya existe, queda igual
│   ├── ordenes-merito.routes.ts
│   ├── ordenes-merito.schema.ts
│   └── ordenes-merito.service.ts
│
├── jornadas-sorteo/                 ← ya existe, queda igual
│   ├── jornadas-sorteo.routes.ts
│   ├── jornadas-sorteo.schema.ts
│   └── jornadas-sorteo.service.ts
│
└── admin/                           ← gestión interna (agrupar)
    ├── usuarios/                    ← MOVER desde modules/usuarios/
    │   ├── usuarios.routes.ts
    │   ├── usuarios.schema.ts
    │   └── usuarios.service.ts
    ├── roles/                       ← MOVER desde modules/roles/
    │   ├── roles.routes.ts
    │   ├── roles.schema.ts
    │   └── roles.service.ts
    ├── permisos/                    ← MOVER desde modules/permisos/
    │   ├── permisos.routes.ts
    │   └── permisos.service.ts
    ├── tokens/                      ← MOVER desde modules/tokens/
    │   ├── tokens.routes.ts
    │   ├── tokens.schema.ts
    │   └── tokens.service.ts
    ├── auditoria/                   ← MOVER desde modules/auditoria/
    │   ├── auditoria.routes.ts
    │   ├── auditoria.schema.ts
    │   └── auditoria.service.ts
    └── tareas/                      ← MOVER desde modules/tareas/
        ├── tareas.routes.ts
        ├── tareas.schema.ts
        └── tareas.service.ts
```

---

## Dominios y su justificación

| Dominio | Módulos que agrupa | Justificación |
|---|---|---|
| `cargos/` | retenciones, autorizaciones, solicitudes-alta | Todo gira alrededor del ciclo de vida del cargo |
| `personas/` | bajas, bajas-sial, perfil | Todo gira alrededor de la persona y su historial |
| `concursos/` | concursos, concursos-cph, concursos-ceetps | Tres variantes del mismo proceso de concurso |
| `referencias/` | referencias, escalafones, hospitales, puestos, puestos-cargo, codigos-registro, etiquetas | Catálogos de referencia sin lógica de negocio propia |
| `admin/` | usuarios, roles, permisos, tokens, auditoria, tareas | Gestión interna del sistema |

---

## Tareas

### Bloque A — Dominio `cargos/`

| # | Tarea | Est. | Estado |
|---|-------|------|--------|
| S28-A1 | Mover `retenciones/` dentro de `cargos/`. Actualizar imports en `app.ts` y en cualquier módulo que importe desde `retenciones/`. | 1h | 📋 |
| S28-A2 | Mover `autorizaciones/` dentro de `cargos/`. Ídem imports. | 1h | 📋 |
| S28-A3 | Mover `solicitudes-alta/` dentro de `cargos/`. Ídem imports. | 1h | 📋 |

### Bloque B — Dominio `personas/`

| # | Tarea | Est. | Estado |
|---|-------|------|--------|
| S28-B1 | Mover `bajas/` y `bajas-sial/` dentro de `personas/`. Actualizar imports. | 1h | 📋 |
| S28-B2 | Mover `perfil/` dentro de `personas/`. Actualizar imports. | 30m | 📋 |

### Bloque C — Dominio `concursos/`

| # | Tarea | Est. | Estado |
|---|-------|------|--------|
| S28-C1 | Crear `concursos/` como directorio padre. Mover `concursos/`, `concursos-cph/`, `concursos-ceetps/` adentro. Actualizar imports. | 2h | 📋 |

### Bloque D — Dominio `referencias/`

| # | Tarea | Est. | Estado |
|---|-------|------|--------|
| S28-D1 | Crear `referencias/` como directorio padre. Mover `escalafones/`, `hospitales/`, `puestos/`, `puestos-cargo/`, `codigos-registro/`, `etiquetas/` adentro. Actualizar imports. | 1.5h | 📋 |

### Bloque E — Dominio `admin/`

| # | Tarea | Est. | Estado |
|---|-------|------|--------|
| S28-E1 | Crear `admin/` como directorio padre. Mover `usuarios/`, `roles/`, `permisos/`, `tokens/`, `auditoria/`, `tareas/` adentro. Actualizar imports. | 1.5h | 📋 |

### Bloque F — Verificación

| # | Tarea | Est. | Estado |
|---|-------|------|--------|
| S28-F1 | `tsc --noEmit` limpio en `apps/api`. | 30m | 📋 |
| S28-F2 | Smoke test: login, listado de cargos, listado de personas, un snapshot de padrón, un concurso. | 1h | 📋 |
| S28-F3 | Actualizar `app.ts` con las nuevas rutas de import. | 30m | 📋 |

---

## Módulos que NO se mueven

Estos módulos quedan en su lugar actual — ya tienen el nivel correcto de granularidad
o tienen dependencias cruzadas que hacen costoso moverlos en este sprint:

| Módulo | Motivo |
|---|---|
| `padron/` | Dominio propio con muchos helpers internos — queda en raíz |
| `dotacion/` | Dominio propio — queda en raíz |
| `kpis/` | Dominio propio — queda en raíz |
| `organigrama/` | Dominio propio — queda en raíz |
| `pou/` | Dominio propio — queda en raíz |
| `incidencias/` | Dominio propio con lógica compleja — queda en raíz |
| `notificaciones/` | Dominio propio — queda en raíz |
| `areas-programaticas/` | Dominio propio — queda en raíz |
| `cadena-mando/` | Módulo pequeño, dependencia de `organigrama/` — queda en raíz |
| `comisiones/` | Módulo pequeño — queda en raíz |
| `ordenes-merito/` | Módulo pequeño — queda en raíz |
| `jornadas-sorteo/` | Módulo pequeño — queda en raíz |
| `auth/` | Módulo de infraestructura — queda en raíz |

---

## Reglas de ejecución

1. **Un bloque por commit** — si algo falla, el rollback es un `git revert` limpio.
2. **`tsc --noEmit` después de cada bloque** — no avanzar con errores de tipo.
3. **No cambiar contratos de API** — ninguna ruta cambia, ningún tipo en `packages/types` cambia.
4. **Re-exportar si hay imports externos** — si un módulo de otro dominio importa desde el módulo
   que se mueve, agregar un barrel `index.ts` en la ubicación vieja que re-exporte desde la nueva.
   Eliminar el barrel en el sprint siguiente una vez confirmado que no hay más referencias.
5. **`app.ts` se actualiza al final de cada bloque** — es el único archivo que registra todas las rutas.

---

## Criterio de éxito

- [ ] `tsc --noEmit` limpio en `apps/api`
- [ ] Smoke test sin errores
- [ ] `modules/` tiene como máximo 15 entradas en raíz (hoy tiene 30+)
- [ ] Cada dominio agrupa módulos con la misma lógica de negocio
- [ ] Ningún contrato de API cambió

---

## Referencias

- `Doc/Planificacion/Sprints/SPRINT_27_modularizacion_frontend.md` — sprint anterior (frontend)
- `apps/api/src/app.ts` — registro de todas las rutas (punto de entrada del refactor)
- `Doc/Contratos/Contrato_Back.md` — contratos del backend
