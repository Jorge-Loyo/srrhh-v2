# SPRINT 22 — Dotaneitor resuelve contra el catálogo (Puesto/Especialidad)

**Estado:** 📋 Planificado
**Autores:** Jorge (backend Node + Python)
**Depende de:** Sprint 20 ✅ (catálogo `puestos_cargo`/`especialidades_puesto` consolidado, `Cargo.puestoCargoId`/`especialidadPuestoId`, política de "sin match" ya definida del lado Node en S20-6), Sprint 21 ✅ (consumidores secundarios migrados, no queda nada más leyendo texto libre como dato vivo)

---

## Objetivo

Que el microservicio Python `services/dotaneitor/` deje de producir únicamente texto libre (`LIT_PUESTO`, `ESPECIALIDAD` consolidados) y en vez de eso **resuelva directo contra el catálogo** (`puestos_cargo`/`especialidades_puesto`), devolviendo `puestoCargoId`/`especialidadPuestoId` en el `resultado_df` que ya consume Node. Esto cierra el último tramo del pipeline que sigue generando/consumiendo texto libre — hoy Node (`padron.service.ts`, S20-6) hace esa resolución él mismo después de recibir texto ya "consolidado" de Python; este sprint mueve la resolución final al lugar donde ya vive toda la lógica de normalización de texto, evitando dos motores de matching (uno en Python, otro en Node) haciendo lo mismo con reglas potencialmente distintas.

## Análisis previo (2026-09-21) — decisiones ya tomadas para este sprint

Investigación dedicada al pipeline confirmó lo siguiente (evita rediseñar desde cero):

- **Dotaneitor hoy solo LEE las tablas `Ref*`** (`ref_agrupadores`, `ref_unificadores_puesto`, `ref_especialidades_cuil`, `ref_correcciones_lit_puesto`, `ref_correcciones_especialidad`, `ref_especialidad_por_puesto`) como reglas de mapeo estáticas cargadas una vez al arrancar (`main.py:60-66`) — no escribe en ellas desde el pipeline HTTP normal (solo el script manual `scripts/seed_referencias.py` las puebla).
- El enfoque de "diccionario curado a mano contra los datos reales" en `consolidacion_lit_puesto.py`/`consolidacion_especialidades.py`/`especialidad_por_agrupador.py` es **deliberado**, documentado y con casos donde el usuario decidió explícitamente apartarse de la moda estadística por criterio clínico. **No se reemplaza este mecanismo** — sigue siendo el primer paso (limpieza/consolidación de texto). Lo que se agrega es un paso **posterior**: resolver ese texto ya consolidado contra el catálogo real.
- Dotaneitor ya tiene conexión propia a Postgres (SQLAlchemy, pool 2+2) — agregar una carga de `puestos_cargo`/`especialidades_puesto` es el mismo patrón que ya usa para las tablas `Ref*`, no una integración nueva.
- Riesgo identificado y a resolver en este sprint: una misma especialidad puede repetirse bajo distintos puestos (`especialidad_por_agrupador.py` línea 30, caso real: Odontología con subespecialidades distintas según el puesto) — `EspecialidadPuesto` tiene que cubrir esa diversidad real, hoy solo documentada en el diccionario estático `MAPEO_ESPECIALIDAD_POR_PUESTO`, o la resolución fallará para esos casos.
- `README.md` de Dotaneitor documenta endpoints `/diff` y `/guardar-bd` que **ya no existen** en el código (el diff lo calcula Node directo contra Postgres desde S2-19) — desactualizar en este sprint, ya que se va a tocar el servicio de todos modos.

## Tareas

| #     | Tarea                                                                                                                                                                                                 | Dev   | Est. | Prioridad | Estado |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- | --------- | ------ |
| S22-1 | Cargar `puestos_cargo`/`especialidades_puesto` en Dotaneitor: nueva función `_cargar_puestos_cargo(engine)` en `main.py`, mismo patrón que `_cargar_normalizador`/`_cargar_lit_puesto` (líneas 23-26, 60-66) | Jorge | 2h   | 🔴        | 📋     |
| S22-2 | Nuevo módulo `resolucion_catalogo.py`: función que, para cada fila ya con `LIT_PUESTO`/`ESPECIALIDAD` consolidados (post `consolidacion_lit_puesto.py`/`consolidacion_especialidades.py`/`especialidad_por_agrupador.py`), matchea `(escalafonId, LIT_PUESTO normalizado) → puestoCargoId` y `(puestoCargoId, ESPECIALIDAD normalizada) → especialidadPuestoId`, con `LOWER(TRIM())` en ambos lados | Jorge | 3h   | 🔴        | 📋     |
| S22-3 | Política "sin match" en Python: si no hay `puestoCargoId` para la combinación, **no inventar ni descartar la fila** — marcarla con un flag (`puesto_sin_catalogar: true`) y dejar `puestoCargoId` nulo, mismo criterio que Node ya usa en S20-6. Estas filas quedan visibles en el `/preview` para que Node las encole a revisión manual | Jorge | 2h   | 🔴        | 📋     |
| S22-4 | Curar `EspecialidadPuesto` para la diversidad real hoy documentada solo en `MAPEO_ESPECIALIDAD_POR_PUESTO`: recorrer el diccionario estático de `especialidad_por_agrupador.py` y dar de alta en el catálogo las combinaciones puesto+especialidad que falten (migración de seed, no script suelto) | Jorge | 4h   | 🔴        | 📋     |
| S22-5 | Agregar `puesto_cargo_id`/`especialidad_puesto_id`/`puesto_sin_catalogar` como columnas del `resultado_df` devuelto por `/preview`                                                                    | Jorge | 1.5h | 🔴        | 📋     |
| S22-6 | Backend: `padron.service.ts` consume `puesto_cargo_id`/`especialidad_puesto_id` directo del DataFrame en vez de re-resolver el texto él mismo (reemplaza la resolución agregada en Sprint 20 S20-6; esa lógica Node queda como *fallback* de validación, no como resolución primaria) | Jorge | 3h   | 🔴        | 📋     |
| S22-7 | Backend: filas con `puesto_sin_catalogar=true` se encolan igual que hoy (mismo mecanismo de revisión manual de S20-6), pero ahora con el motivo explícito visible en el diff que ve el usuario que aprueba el padrón                                                                | Jorge | 1.5h | 🟡        | 📋     |
| S22-8 | Actualizar `services/dotaneitor/README.md`: quitar la documentación de `/diff` y `/guardar-bd` (no existen), documentar el nuevo paso de resolución contra catálogo y las columnas nuevas del `resultado_df` | Jorge | 1h   | 🟢        | 📋     |
| S22-9 | Verificación e2e: correr un import de padrón completo contra datos reales de SIAL (o el fixture equivalente), confirmar que `puesto_cargo_id`/`especialidad_puesto_id` se resuelven para el grueso de las filas, y que un puesto nuevo/no catalogado cae correctamente en la cola de revisión manual sin romper el resto del import | Jorge | 2h   | 🔴        | 📋     |

**Total estimado:** ~20h

## Dependencias entre tareas

```
S22-1 ──► S22-2 ──┬─► S22-3
                    └─► S22-4

S22-2 + S22-3 + S22-4 ──► S22-5 ──► S22-6 ──► S22-7

S22-8 es independiente (documentación)
(S22-6 + S22-7) ──► S22-9
```

## Criterio de éxito

- [ ] El import semanal del padrón resuelve `puestoCargoId`/`especialidadPuestoId` en Python, no en Node — Node consume el resultado, no lo recalcula con su propia lógica de matching.
- [ ] Un `LIT_PUESTO`/`ESPECIALIDAD` sin equivalente en el catálogo no genera un `Cargo` silenciosamente mal etiquetado ni rompe el import — cae en la cola de revisión manual con motivo explícito.
- [ ] `EspecialidadPuesto` cubre la diversidad real que hoy solo vive en `MAPEO_ESPECIALIDAD_POR_PUESTO` (verificable corriendo el import y confirmando que el % de filas "sin catalogar" es bajo, no que sistemáticamente fallan los casos ya conocidos del diccionario estático).
- [ ] `README.md` de Dotaneitor refleja los endpoints y el flujo reales, sin `/diff`/`/guardar-bd` fantasma.
- [ ] Las tablas `Ref*` de corrección de texto (`RefCorreccionLitPuesto`, `RefCorreccionEspecialidad`, `RefEspecialidadPorPuesto`, `RefAgrupador`, `RefUnificadorPuesto`) siguen existiendo y siendo la primera pasada de limpieza de texto — no se eliminan en este sprint, solo se les agrega un paso posterior de resolución contra el catálogo.

## Notas

- Decisión explícita de diseño: se mantiene la capa `Ref*` de corrección texto→texto tal como está (opción "b" del análisis previo: capa de corrección previa + paso de resolución final nuevo), en vez de reemplazarla por un mapeo directo texto SIAL→ID. Motivo: reescribir las reglas curadas a mano de `consolidacion_lit_puesto.py`/`consolidacion_especialidades.py`/`especialidad_por_agrupador.py` como mapeos directos a ID es mucho más trabajo y mucho más riesgo de perder casos ya resueltos correctamente (varios con criterio clínico específico, no derivable de una regla genérica) — no se justifica frente al beneficio.
- `Cargo.agrupador`/`Cargo.unificadorPuesto` (texto libre, alimentados por `RefAgrupador`/`RefUnificadorPuesto`) **no se tocan en este sprint** — ya dejaron de ser fuente de lógica de negocio en Sprint 20 (S20-8 migró `codigoCargo.ts::prefijoDeCargo()` a usar `tipoPuesto`/`modalidad` del catálogo). Quedan como columnas de auditoría, igual que `literalPuesto`/`especialidadLegacy`. No hay necesidad de un sprint adicional solo para eliminarlos salvo que en el futuro se decida limpiar columnas legacy de una vez — evaluar entonces, no ahora.
- Con este sprint cerrado, el roadmap completo iniciado en Sprint 20 queda terminado: núcleo (20), consumidores secundarios + documentos exportables (21), pipeline de origen (22). No queda ningún punto conocido del inventario original sin resolver o sin decisión explícita documentada.
