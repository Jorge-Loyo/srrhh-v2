# ACCEPTANCE — Rediseño de la grilla de permisos (`/configuracion/permisos`)

Rama: `ui-grilla-permisos`. Cambios **solo de UI** en la grilla de permisos por rol.

## Qué cambió

- La grilla pasó de una **tabla plana con `rowspan`** (módulos en orden alfabético del catálogo) a un **acordeón en cascada**: cada botón del sidebar es un grupo colapsable con sus acciones anidadas.
- Los grupos salen en el **mismo orden que el menú lateral** (`AppShell.tsx`): Inicio, Reportes, Tablero KPIs, Dotación, Organigrama, POU, Personas, Cargos, Bajas, Retenciones, Concursos CPH, Concursos CEETPS, Importación, Configuración, y al final **Sistema / Transversales** (autorizaciones, notificaciones, solicitudes-alta).
- **Organigrama** y **POU** se muestran como grupos **informativos**: badge "Acceso abierto — sin control por rol", sin checkboxes ni contador.
- **Importación** agrupa dos sub-módulos (Padrón Semanal + Bajas Consolidadas) con sub-encabezados.
- Botones **"Expandir todo" / "Colapsar todo"**; inicio colapsado.
- Labels nuevos: `reportes`, `retenciones` (módulos); `autorizar`, `resolver` (acciones).
- Robustez: la grilla se arma siempre desde el catálogo real (`usePermisosCatalogo`); módulos del catálogo no listados caen al final (catch-all); secciones del orden ausentes del catálogo se omiten sin romper (salvo las informativas, que siempre salen).

No se tocó: `onTogglePermiso`, `useSetRolePermisos`, el bypass visual de admin, el conteo global `otorgados / totalPermisos`, el CRUD de roles, ni la BD.

Archivos:
- `apps/web/src/modules/configuracion/lib/grilla-permisos.ts` (nuevo — lógica pura).
- `apps/web/src/modules/configuracion/pages/ConfiguracionPermisosPage.tsx` (render acordeón).

## Verificación automatizada ya ejecutada

- **Gate de código:** `pnpm --filter @srrhh/web build` (= `tsc && vite build`) → **OK** (exit 0, sin errores de tipo ni de build). No hay script de lint ni de test en `apps/web` (confirmado en `package.json`).
- **Verificación de lógica (función pura `construirGrupos`):** se corrió un script de aserciones contra el catálogo real de Neon (15 módulos + `reportes`). Resultados (14/14 OK):
  - orden de grupos == orden del sidebar + sección Sistema al final;
  - Importación agrupa `padron` + `bajas-sial` con dos sub-encabezados;
  - Bajas = 1 sub-módulo, header "Bajas";
  - Organigrama/POU informativos, sin permisos;
  - Sistema agrupa `autorizaciones, notificaciones, solicitudes-alta` en ese orden;
  - **Reportes → Ver presente**;
  - "Ver" ordenada primero; `concursos-cph` incluye `autorizar`;
  - catch-all para módulo desconocido; sección-botón ausente del catálogo omitida; ningún módulo del catálogo perdido.
  - (El script era temporal y se eliminó tras correrlo; no queda en el árbol.)

## Verificación visual — NO ejecutada automáticamente (hacerla manual)

La verificación visual en navegador **no se pudo automatizar en este entorno**: no hay navegador/headless disponible para el agente, la página requiere API (`/api` → :3000) + BD + sesión autenticada, y está prohibido tocar el stack :5180 del usuario o la BD. La verificación de datos de arriba cubre la capa que arma el render; los pasos de abajo confirman la presentación en el navegador y debe hacerlos el usuario.

Levantar el entorno habitual del usuario (`http://localhost:5180/`) o el dev server del worktree en un puerto propio (`vite --port 5199`, con el API corriendo) y entrar a:

### http://localhost:5180/configuracion/permisos

1. **Orden del sidebar.** Los grupos salen en este orden de arriba a abajo: Inicio, Reportes, Tablero KPIs, Dotación, Organigrama, POU, Personas, Cargos, Bajas, Retenciones, Concursos CPH, Concursos CEETPS, Importación, Configuración, Sistema / Transversales.
2. **Cascada colapsable.** Cada grupo es un botón con chevron; al hacer click expande/colapsa sus acciones. "Expandir todo" / "Colapsar todo" funcionan. Importación muestra sub-encabezados "Padrón Semanal" y "Bajas Consolidadas".
3. **Organigrama y POU informativos.** Muestran el badge "Acceso abierto — sin control por rol", sin checkboxes ni contador numérico.
4. **Rol admin.** Seleccionar el rol **administrador**: todos los checkboxes salen **tildados y deshabilitados**, y el contador por grupo muestra total/total (p. ej. `1 / 1`, `8 / 8`).
5. **Rol no-admin.** Seleccionar un rol común (p. ej. editor/supervisor):
   - los checkboxes se pueden **tildar/destildar** y el cambio persiste (toggle guardado);
   - **Reportes → Ver** aparece en el grupo Reportes y **se puede tildar** para otorgar el permiso al rol.

Si algún punto no se cumple, anotarlo antes de aprobar.
