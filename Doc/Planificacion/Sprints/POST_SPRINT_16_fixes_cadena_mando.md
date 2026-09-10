# POST-SPRINT 16 — Fixes varios + Módulo Cadena de Mando

**Estado:** ✅ Completado
**Fecha:** 2026-09
**Autor:** Agustín
**Rama:** `main`

---

## 1. Rutas 404 faltantes en el router

`/configuracion/jerarquia` y `/configuracion/permisos` no estaban registradas en `router.tsx` — daban 404 al navegar directamente por URL.

**Fix:** agregadas bajo sus respectivos guards en `apps/web/src/app/router.tsx`:

```typescript
{
  element: <RequirePermiso permiso={{ modulo: 'configuracion', accion: 'gestionar_usuarios' }} />,
  children: [{ path: 'configuracion/jerarquia', element: <ConfiguracionJerarquiaPage /> }],
},
{
  element: <RequirePermiso permiso={{ modulo: 'configuracion', accion: 'gestionar_permisos' }} />,
  children: [{ path: 'configuracion/permisos', element: <ConfiguracionPermisosPage /> }],
},
```

---

## 2. Limpieza catálogo de permisos

### Permisos zombie eliminados

Los siguientes permisos existían en la BD pero no correspondían a ningún módulo/acción real del sistema:

| Permiso eliminado | Motivo |
|---|---|
| `autorizaciones.resolver` | Acción inexistente — el flujo usa `autorizaciones.ver` |
| `concursos-cph.autorizar` | Acción inexistente — el flujo usa `concursos-cph.crear` |
| `configuracion.ver` | Módulo sin acción `ver` — se accede por `gestionar_*` |
| `bajas.ver` | Eliminado del flujo — bajas se ven con `bajas.crear` |
| `bajas-sial.ver` | Reemplazado por `bajas-sial.aprobar` |

### Permisos nuevos agregados

| Permiso | Módulo | Acción |
|---|---|---|
| `etiquetas.crear` | `etiquetas` | `crear` |
| `ordenes_merito.crear` | `ordenes_merito` | `crear` |
| `postulantes.crear` | `postulantes` | `crear` |

### Labels actualizados en `ConfiguracionPermisosPage.tsx`

`MODULO_LABEL` ampliado con: `dotacion`, `solicitudes-alta`, `etiquetas`, `ordenes_merito`, `postulantes`.

`ACCION_LABEL` actualizado con labels correctos. Eliminados `autorizar` y `resolver` (ya no existen como acciones).

### Guards corregidos en `AppShell.tsx`

- Bajas y Validación de Bajas: corregidos de permisos eliminados a `bajas.crear`
- Bajas Consolidadas: corregido a `bajas-sial.aprobar`

---

## 3. Permiso `inicio.ver` + página de inicio condicional

### Problema

La ruta `/` mostraba `InicioPage` a todos los usuarios sin distinción. Se necesitaba que usuarios sin permiso `inicio.ver` fueran redirigidos directamente a `/kpis`.

### Solución

**BD:** permiso `inicio.ver` agregado al catálogo y asignado a los roles que corresponde.

**Router (`router.tsx`):** componente `RequireInicio` que verifica `can(user, 'inicio', 'ver')`:
- Si tiene el permiso → renderiza `InicioPage`
- Si no → `<Navigate to="/kpis" replace />`

**Sidebar (`AppShell.tsx`):** ítem "Inicio" condicionado con `can(user, 'inicio', 'ver')` — no aparece en el menú para usuarios sin ese permiso.

---

## 4. Fix `reemplazarOrganigramaService` — transacción con timeout

### Problema

`reemplazarOrganigramaService` ejecutaba `deleteMany` + `createMany` como operaciones separadas sin transacción. Con 4.374 filas (archivo `Arbol_Salud_20260906.xlsx`, 78 siglas), el `createMany` excedía el timeout default de Prisma (5s) y hacía rollback parcial — dejando la tabla de organigrama vacía o incompleta.

### Fix

Reescrito para usar `$transaction` con `timeout: 120_000`:

```typescript
await prisma.$transaction(
  async (tx) => {
    await tx.organigrama.deleteMany()
    await tx.organigrama.createMany({ data: filas })
  },
  { timeout: 120_000 }
)
```

**Archivo:** `apps/api/src/modules/organigrama/organigrama.service.ts`

---

## 5. Fix bug vacante IRPS — nodo `40250020`

### Problema

El nodo `40250020` mostraba `EG-004719` (CAMILLERO) como vacante cuando en realidad estaba ocupado. El cargo aparecía como vacante porque `cargosVacantesRaw` no incluía `codigoRegistro` en el `select`, y el bloque alternativo de `esCargoDeConduccion` ignoraba el código de registro al evaluar si un cargo era de conducción.

### Fix

1. `codigoRegistro` agregado al `select` de `cargosVacantesRaw`
2. Eliminado el bloque alternativo que ignoraba `codigoRegistro` — `esCargoDeConduccion` ahora usa siempre el código de registro con los valores correctos (`'25','60','37','83','85','87'`)

**Archivo:** `apps/api/src/modules/organigrama/organigrama.service.ts`

Requirió rebuild del contenedor Docker: `docker compose build api && docker compose up -d api`.

---

## 6. Módulo Cadena de Mando

### Objetivo

Mostrar la cadena jerárquica de una persona o unidad organizativa: desde el nodo actual hasta el Ministro, pasando por cada nivel del organigrama.

### Backend

**Archivo nuevo:** `apps/api/src/modules/cadena-mando/cadena-mando.service.ts`

- Query recursiva CTE en PostgreSQL
- Acepta `personaId` (busca el `codigoRepa` de su cargo activo) o `codigoRepa` directo
- `LATERAL JOIN` para obtener un conductor por nodo (filtra por `codigoRegistro IN ('25','60','37','83','85','87')` y jefatura)
- Devuelve array de `NodoCadena` ordenado desde el nodo actual hasta la cima

**Archivo nuevo:** `apps/api/src/modules/cadena-mando/cadena-mando.routes.ts`

- `GET /` con query params `personaId` o `codigoRepa`

**`apps/api/src/app.ts`:** registrado `cadenaMandoRoutes` en `/api/v1/cadena-mando`

### Frontend

**Archivo nuevo:** `apps/web/src/modules/cadena-mando/useCadenaMando.ts`

Hook con `apiClient` (axios). Interface `NodoCadena`:

```typescript
interface NodoCadena {
  nivel: number
  codigoReparticion: string
  descRep: string
  tipo: string
  conductor: string | null
  cargoLiteral: string | null
  codigoCargo: string | null
}
```

**Archivo nuevo:** `apps/web/src/modules/cadena-mando/CadenaMandoPanel.tsx`

Componente colapsable con:
- Línea de tiempo vertical
- Badges de tipo con colores por nivel jerárquico
- Dot azul en el nodo actual
- "Vacante" en amarillo cuando no hay conductor
- Sin label "Organigrama" encima (título propio del panel)

### Integración

**`PersonaDetailPanel.tsx`:** `CadenaMandoPanel` con `personaId` insertado después de "Detalle de cargos", antes de "Historial de roles SIAL".

Orden final:
```
Datos personales → Detalle de cargos → Cadena de mando → Historial de roles SIAL → Concursos CPH → Historial padrón
```

**`CargoDetailPanel.tsx`:** `CadenaMandoPanel` con `codigoRepa` insertado después de "Persona actual".

Orden final:
```
Encabezado → Persona actual → Cadena de mando → Proceso concursal → Concursos CPH → Concursos CEETPS → Historial
```

### Datos verificados

Cadena de mando confirmada con datos reales:
```
Adamo, Claudia → Perazzo (SUB-DIRECTOR) → Perez (DIRECTOR) → Auger (DG) → Cordero (SUBSECRETARIO) → Gonzalez Bernaldo (MINISTRO)
```

`codigoReparticion` identifica la unidad organizativa (no el puesto individual). Un hospital puede tener 1.660 cargos con el mismo `codigoRepa`. El identificador del puesto individual es `Cargo.idSial`.

---

## 7. Reordenamiento menú lateral

### Cambio

Orden anterior: KPIs → Personas → Dotación → Organigrama → POU → [divisor] → Cargos

Orden nuevo: KPIs → Dotación → Organigrama → POU → [divisor] → **Personas** → **Cargos**

**Archivo:** `apps/web/src/shared/components/layout/AppShell.tsx`

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `apps/web/src/app/router.tsx` | Rutas `/configuracion/jerarquia` y `/configuracion/permisos`; componente `RequireInicio` |
| `apps/web/src/shared/components/layout/AppShell.tsx` | Ítem Inicio condicional; guards Bajas corregidos; reordenamiento menú |
| `apps/web/src/modules/configuracion/pages/ConfiguracionPermisosPage.tsx` | `MODULO_LABEL` y `ACCION_LABEL` actualizados |
| `apps/api/src/modules/organigrama/organigrama.service.ts` | `$transaction` con timeout; fix `codigoRegistro` en vacantes |
| `apps/api/src/modules/cadena-mando/cadena-mando.service.ts` | Nuevo — CTE recursiva |
| `apps/api/src/modules/cadena-mando/cadena-mando.routes.ts` | Nuevo — `GET /` |
| `apps/api/src/app.ts` | Registro `cadenaMandoRoutes` |
| `apps/web/src/modules/cadena-mando/useCadenaMando.ts` | Nuevo — hook |
| `apps/web/src/modules/cadena-mando/CadenaMandoPanel.tsx` | Nuevo — componente |
| `apps/web/src/modules/personas/pages/PersonaDetailPanel.tsx` | `CadenaMandoPanel` integrado |
| `apps/web/src/modules/cargos/pages/CargoDetailPanel.tsx` | `CadenaMandoPanel` integrado |
