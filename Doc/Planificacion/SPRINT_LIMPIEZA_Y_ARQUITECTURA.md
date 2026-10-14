# Sprint de Limpieza y Arquitectura (backlog acumulado)

> **Propósito:** acumular, poco a poco, el código muerto, las tablas huérfanas, los
> seeds obsoletos y la deuda de arquitectura que se detectan durante el trabajo normal,
> para resolverlos todos juntos en un sprint dedicado. **No se borra nada acá sobre la
> marcha** — este documento es la lista de "qué hay que limpiar cuando toque".
>
> Regla de oro: quitar algo de la UI es reversible (bajo riesgo). Dropear tablas, borrar
> datos o eliminar código legacy es destructivo e irreversible → solo en el sprint de
> limpieza, con verificación previa y, de ser posible, backup.
>
> Última actualización: 2026-10-13

---

## 1. Dotaneitor — flujo legacy muerto

**Contexto:** el Dotaneitor se reescribió en el Sprint 22 (pipeline lineal `POST /procesar-padron`).
El cliente Node hace **una sola** llamada a ese endpoint (`apps/api/src/modules/padron/padron.service.ts:514`).
Los endpoints viejos (`/procesar`, `/cruzar`, `/normalizar`, `/session`, `/preview`, `/historial`,
`/guardar-bd`, `/ultima-actualizacion`) **ya no se consumen desde ningún lado**. Confirmado por el
usuario: _"está muerto ese proceso, ya no se usa"_ (2026-10-13). Investigación completa en
`Doc/../.agents/tasks/referencias-vs-dotaneitor-2026-10-13.md`.

### 1.1 Código legacy a eliminar

| Ítem                                              | Ubicación                                                                                                   | Nota                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Endpoints legacy del Dotaneitor                   | `services/dotaneitor/main.py` (`/procesar`, `/cruzar`, y helpers `_cruzar_especialidades`, etc.)            | El README (`services/dotaneitor/README.md:40-41`) ya prevé eliminarlos "una vez validado el pipeline lineal". Ya está validado. |
| `DotacionAutomation.procesar()` (flujo viejo)     | `services/dotaneitor/Dotaneitor.py`                                                                         | Usa `agrupador_df` / `unificador_df` que el v2 no usa (pasos 6/7 eliminados).                                                   |
| `ConsolidadorEspecialidades` (variante BD legacy) | `services/dotaneitor/especialidades.py`, `consolidacion_especialidades.py`, `especialidad_por_agrupador.py` | Solo los usa `/cruzar`. En v2 la especialidad se deriva por nombre (`derivar_especialidad.py`).                                 |

### 1.2 Tablas `ref_*` huérfanas (candidatas a DROP)

El Dotaneitor v2 usa solo 5 de las 10 tablas de referencia. Estas 5 **ya no las lee el pipeline vivo**
(solo el flujo legacy muerto):

| Tabla                           | Modelo Prisma               | Por qué quedó huérfana                                                       |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `ref_agrupadores`               | `RefAgrupador`              | Paso "agrupador" eliminado en v2 (`pipeline.py:215`).                        |
| `ref_unificadores_puesto`       | `RefUnificadorPuesto`       | Paso "unificador" eliminado en v2.                                           |
| `ref_especialidades_cuil`       | `RefEspecialidadCuil`       | ~49k filas. Cruce por CUIL reemplazado por catálogo + derivación por nombre. |
| `ref_correcciones_especialidad` | `RefCorreccionEspecialidad` | Solo `/cruzar` (legacy).                                                     |
| `ref_especialidad_por_puesto`   | `RefEspecialidadPorPuesto`  | Solo `/cruzar` (legacy).                                                     |

> **Antes de dropear:** confirmar que el flujo legacy quedó eliminado del código (ítem 1.1) en la
> misma tanda. Hacer backup de las tablas (sobre todo `ref_especialidades_cuil`, ~49k filas) por si
> hiciera falta rollback. Mientras tanto, en la UI estas 5 tablas se mueven a una sección "Legacy"
> etiquetada (reversible), no se borran.

### 1.3 Seeds obsoletos

| Seed                                              | Qué puebla                                                                                                                                  | Acción futura                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/dotaneitor/scripts/seed_referencias.py` | Sigue recargando (TRUNCATE+INSERT) `ref_agrupadores`, `ref_unificadores_puesto`, `ref_especialidades_cuil` (las 3 huérfanas) + `hospitales` | Deprecar la parte de las 3 tablas huérfanas cuando se dropeen. Decisión del usuario (2026-10-13): dejarlo por ahora, limpiarlo en este sprint. |
| `scripts/migrar_ref_dotacion.py`                  | Script gemelo del anterior para las mismas 3 tablas huérfanas                                                                               | Redundante con `seed_referencias.py` (lo dice el propio archivo, `:30-35`). Evaluar eliminar junto con las tablas.                             |

### 1.4 Página `/configuracion/referencias` — texto a corregir

- El subtítulo/descripción de la página afirma que las 10 tablas "alimentan el cruce del Dotaneitor"
  (`apps/web/src/modules/configuracion/pages/ConfiguracionReferenciasPage.tsx:21-24` y `:422-427`).
  Solo es cierto para 5. **Esto se corrige ya** (no espera al sprint de limpieza) junto con el movimiento
  de las huérfanas a la sección "Legacy".

### 1.5 Catálogo de puestos de conducción — seed pendiente para la FK de jefatura (S22-12 Opción B)

**Contexto:** S22-12 Opción B agregó la FK real de jefatura
(`ocupaciones.cargo_jefatura_puesto_id` → `puestos_cargo.id`), que el Dotaneitor resuelve por
fila al procesar el padrón (`services/dotaneitor/catalogo.py:resolver_cargo_jefatura_id`). La FK
se resuelve **solo** contra puestos `tipo_puesto='conduccion'`. Hoy quedan dos huecos conocidos de
catálogo que hacen que la FK caiga a `null` (por diseño, sin frenar el padrón; se cuenta en
`reporte['jcat_sin_fk']`). Ambos se resuelven en una migración de seed futura
(`*_seed_puestos_jefatura`), tras lo cual el **siguiente** padrón resolverá la FK sin tocar código.

| Ítem                                                                               | Ubicación                                   | Nota                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sub-Director (03)` CPH cargado como `tipo_puesto='ejecucion'`                     | `puestos_cargo` (escalafón 22, familia P/G) | Debe corregirse a `conduccion` para que la jefatura `P61` resuelva su FK. Mientras tanto resuelve a `null` (no a un enlace incorrecto, porque la resolución filtra `tipo_puesto='conduccion'`). `UPDATE` acotado en la migración de seed; nunca mezclar con DDL.                        |
| Puestos de conducción de familia Z (no médicos, escalafones 83/85/87) no sembrados | `puestos_cargo`                             | "Jefe de Departamento/División/Sección" de familia Z **no existen** en el catálogo, así que su FK de jefatura queda `null`. Alta con `INSERT ... ON CONFLICT DO NOTHING` en la migración de seed futura (ver `Doc/Referencias/DOTANEITOR_DECISIONES.md` §2.2 — "requiere seed previo"). |

> Decisión de diseño (2026-10-13): **no** auto-crear estos puestos durante la carga del padrón
> (a diferencia del auto-alta de `resolver_puesto`), porque el puesto de conducción se _deriva_ del
> JCAT y no viene como literal de la fila; auto-crearlo metería puestos sin la revisión que
> `DOTANEITOR_DECISIONES.md` §2.2 exige. Null + log es reversible y no destructivo.

---

## 2. Deuda de arquitectura

| Ítem                                       | Ubicación                                                               | Nota                                                                                                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strict: true` en `apps/api/tsconfig.json` | `apps/api/tsconfig.json` (hoy `strict: false`, pisa el `true` del raíz) | Degrada la inferencia de tipos de Zod para campos requeridos. Activarlo probablemente destape errores en código existente de `apps/api`. Documentado en `POST_SPRINT_14_migracion_legacy_tablas_referencia.md`. |

---

## 3. Cómo usar este documento

- Cuando detectes código muerto / tabla huérfana / seed obsoleto durante el trabajo normal,
  **agregalo acá** (no lo borres en el momento salvo que sea trivial y reversible).
- Cuando se abra el sprint de limpieza, este archivo es el checklist de entrada.
- Antes de ejecutar cualquier DROP o borrado: verificar que el consumidor realmente murió,
  hacer backup, y hacerlo en la misma tanda que la eliminación del código que lo usaba.
