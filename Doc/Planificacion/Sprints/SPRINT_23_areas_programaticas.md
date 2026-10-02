# SPRINT 23 — Catálogo oficial de Áreas Programáticas y CeSACs

**Estado:** 📋 Planificado
**Autores:** Jorge (backend) + Agustín (frontend)
**Depende de:** nada bloqueante de S20/S21/S22 — usa `hospitales` y `cargos` tal como están hoy. Puede arrancar en paralelo.

---

## Objetivo

Reemplazar la noción heurística que hoy tiene el sistema de "Área Programática" y "CeSAC" (texto libre en `cargos.descripcion_repa`/`codigo_repa`, agrupado por prefijo de código en el módulo Organigrama) por un catálogo oficial y explícito, sacado directo del decreto vigente, que permita:

1. Saber a qué Área Programática (AP) corresponde cada hospital, y viceversa.
2. Saber qué CeSACs integran cada AP, con su dirección, barrio y nivel jerárquico.
3. Navegar la jerarquía real en cualquier sentido: Hospital → AP → CeSACs → cargos/personas, y CeSAC → AP → Hospital.

## Fuentes (contexto — 2026-09-29)

- **Anexo III (IF-2026-33586335-GCABA-MSGC)** — `Contexto/AP y CeSACs.pdf`: tabla oficial de 13 Áreas Programáticas (nombradas por su hospital de referencia: Álvarez, Argerich, Durand, Fernández, Grierson, Penna, Piñero, Pirovano, Ramos Mejía, Santojanni, Tornú, Vélez Sarsfield, Zubizarreta) con ~90 CeSACs distribuidos entre ellas — dirección, barrio, nivel (UNIDAD / UNIDAD con Jefatura Sección subordinada).
- **Decreto 306-26, Anexo XI/XII Ministerio de Salud** — `Contexto/DECRETO 306-26 - Nivel Central.pdf`: estructura orgánico-funcional completa. Sección 5.5 confirma la jerarquía genérica: `Subsecretaría APAyC → Departamento Área Programática de Salud (13 cargos, uno por AP) → División Programas y Centros de Salud (13 cargos, una por AP) → Unidad CeSAC (plantilla repetida por cada CeSAC) → Sección CeSAC (solo en los marcados "UNIDAD*")`, más una Sección Salud Escolar fija por AP.
- **Precisión sobre el límite de la fuente (2026-09-29):** el decreto no asigna CEMAR I–IV, los Centros Odontológicos Infantiles N°1/N°2 ni la Red de Odontología a ninguna AP puntual — pero sí los nombra individualmente, con su nivel (División para CEMAR, Unidad para los COI, Fuera de Nivel para la Red de Odontología). "Sin AP asignada" no es lo mismo que "no existen": entran al catálogo como **estructura fija de la Subsecretaría**, con `areaProgramaticaId` nulo. Los **Centros de Cuidados Integrales (CCI)**, en cambio, no tienen ni nombre ni cantidad enumerada en el decreto (solo se menciona que existen, supervisados por la Sección CeSAC) — esos sí quedan fuera de este sprint, porque no hay ningún dato concreto que cargar.

## Validación previa — qué hay hoy en el sistema

Antes de escribir tareas se audita el estado real del código (no supuestos):

- `Cargo.descripcionRepa`/`codigoRepa` es donde hoy vive "CESAC Nº 9" como texto libre del padrón SIAL semanal, sin FK a nada.
- Ya existe un árbol `Organigrama` (módulo "Árbol", cargado por Excel) que **infiere** esta jerarquía heurísticamente por prefijo de texto. Es aproximado, no tiene dirección/barrio/nivel de CeSAC ni distingue la jerarquía oficial Departamento/División/Unidad/Sección.
- **Corregido 2026-10-02 — el bucket `Hospital.universoTotalizador = 'APS'` NO existe así en la práctica** (verificado contra la BD local, catálogo de 50 hospitales: ninguno tiene `'APS'`, los únicos valores con datos son `'Nivel Central'`/`'Bienestar'`/`'Hospitales'`; los 13 hospitales de referencia del Anexo III — Álvarez=HGATA, Argerich=HGACA, Durand=HGACD, Fernández=HGAJAF, Grierson=HGACG, Penna=HGAP, Piñero=HGAPP, Pirovano=HGAIP, Ramos Mejía=HGARM, Santojanni=HGADS, Tornú=HGAT, Vélez Sarsfield=HGAVS, Zubizarreta=HGAZ — están todos cargados con sigla real pero `universoTotalizador` vacío). El valor real es **`'ATENCION PRIMARIA'`** (no `'APS'`) y vive únicamente en **`organigramas.universo_totalizador`** (poblado por la carga de Excel del módulo Árbol, no por `hospitales` ni por el seed desde `cargos`) — ver el propio fix de Jorge en `organigrama.schema.ts` (`SECCION_UNIVERSOS`, corregido 2026-09-11 porque `'APS'` "no matcheaba ningún valor real... que es 'ATENCION PRIMARIA', 103 filas en el Excel"). **Conclusión: `scripts/seed_organigrama_desde_cargos.sql` tiene una rama `UPPER(h.universo_totalizador) IN (..., 'APS', ...)` que hoy es código muerto** — ningún hospital matchea, así que esa rama nunca aportó nodos APS vía ese camino; los ~103 nodos APS reales que sí existen (en ambientes con el Excel cargado) entraron por el upload directo al módulo Árbol, no por este script.
- **Implicancia para S23-1/S23-4 (abierto, a resolver con datos reales, local o Neon):** hay dos fuentes candidatas para el backfill, no necesariamente consistentes entre sí — (a) `cargos.descripcionRepa`/`codigoRepa` vía padrón SIAL (lo que ya asumía el plan original), y (b) los nodos ya existentes en `organigramas` con `universoTotalizador='ATENCION PRIMARIA'` (tipo `DEPT`, `descRep ILIKE 'CESAC%'`), que ya traen `sigla` y `codigoReparticion` (único en toda la tabla, sin duplicados al importar — ver comentario en `organigrama.service.ts`). Si `organigramas.codigoReparticion` matchea 1:1 contra `cargos.codigoRepa` (hipótesis a verificar en S23-1), backfillear `Cargo.cesacId` cruzando por ese código puede ser más confiable que parsear texto de `descripcionRepa` a mano — y da de yapa la `sigla` del hospital de referencia de cada CeSAC sin tener que inferirla. No se asume: es la primera pregunta concreta que S23-1 tiene que contestar contra datos reales.
- No se sabe todavía si cada AP comparte el mismo `Hospital.sigla` que su hospital de referencia (ej. cargos del CeSAC Nº9 con `hospitalId` = Argerich) o si existe alguna sigla propia por AP en `cargos`/`organigramas` — se resuelve auditando datos reales, no se asume.
- **Actualizado 2026-10-02 — el módulo Organigrama no es solo el script estático:** además de `scripts/seed_organigrama_desde_cargos.sql` (backfill puntual), hay un pipeline vivo de carga por Excel (`organigrama.service.ts`) con inferencia heurística de `universoTotalizador`/`regimenEmpleo` por historial — Jorge lo parcheó el 2026-10-01 (`canonUniverso()`: unifica APS/"ATENCION PRIMARIA"/variantes para que la inferencia de régimen no corte la carga pidiendo datos a mano en CEMAR IV y CeSAC 51/53, justo las entidades que este sprint formaliza). Es un módulo activamente mantenido, no legacy congelado — pesa más en la "Decisión pendiente" de abajo (extender Organigrama vs. módulo nuevo).
- **Actualizado 2026-10-02 — merge con la reescritura de `/dotacion` (S21/S22, Jorge):** `dotacion.service.ts` ya no tiene un `buildConditions` plano — ahora compila `DimensionesDotacion` vía `condicionesDimensiones()`, combinables en uniones OR por "grupos" (`query.grupos`, ver `dotacion.schema.ts`). `BASE_FROM` y `buildConditions` se exportaron recién (branch `agustin`) para que `reportes.service.ts` los reutilice tal cual — ese sigue siendo un buen ejemplo de consumidor simple (solo AND, sin grupos). S23-6 abajo se corrigió para apuntar al patrón real.

## Tareas

| #     | Tarea                                                                                                                                                                                                                                                                                                       | Dev             | Est. | Prioridad | Estado |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---- | --------- | ------ |
| S23-1 | Auditoría de datos reales (BD con padrón+Excel de Árbol cargados — local vacía hoy, usar Neon o subir padrón+Excel primero): 1) confirmar si `organigramas.codigoReparticion` (nodos `universoTotalizador='ATENCION PRIMARIA'`, `descRep ILIKE 'CESAC%'`) matchea 1:1 contra `cargos.codigoRepa` — si sí, el backfill de S23-4 cruza por código en vez de parsear texto; 2) de no ser así (o como fallback), confirmar relación `cargos.hospitalId` vs. hospital de referencia vía `descripcionRepa`/`codigoRepa`. Define el diseño del backfill de S23-4                                                | Jorge           | 3h   | 🔴        | 📋     |
| S23-2 | Prisma: model `AreaProgramatica` (`nombre`, `hospitalId` FK → `Hospital`, único) + model `Cesac` (`numero`, `nombre`, `direccion`, `barrio`, `nivel` enum `unidad`\|`unidad_con_seccion`, `areaProgramaticaId` FK) + model `UnidadFijaApayC` (`nombre`, `tipo` enum `cemar`\|`centro_odontologico_infantil`\|`red_odontologia`, `nivelOrganico` enum `division`\|`unidad`\|`fuera_de_nivel`, sin FK a `AreaProgramatica`). Migración `sprint23_areas_programaticas`                            | Jorge           | 3.5h | 🔴        | 📋     |
| S23-3 | Seed: cargar las 13 AP (vinculadas por nombre de hospital contra `hospitales.nombre`/`sigla`), los ~90 CeSACs del Anexo III, y las 7 unidades fijas (CEMAR I/II/III/IV, Centro Odontológico Infantil N°1/N°2, Red de Odontología) del Decreto 306-26 — re-ejecutable como `scripts/seed_organigrama_desde_cargos.sql`                                                                                  | Jorge           | 2.5h | 🔴        | 📋     |
| S23-4 | Backfill: `Cargo.cesacId` (opcional, FK → `Cesac`) y `Cargo.unidadFijaId` (opcional, FK → `UnidadFijaApayC`) poblados por matching de `descripcion_repa`/`codigo_repa` contra ambos catálogos, con reporte de cobertura (% de cargos tipo CeSAC/CEMAR/COI/Red de Odontología que matchearon) y listado de no-matcheados para revisión manual — criterio de matching definido en S23-1                    | Jorge           | 4.5h | 🔴        | 📋     |
| S23-5 | Backend: módulo `areas-programaticas/` — `GET /api/v1/areas-programaticas` (listado con hospital y conteo de CeSACs/cargos), `GET /api/v1/areas-programaticas/:id` (detalle: hospital, CeSACs, cargos agregados), `GET /api/v1/cesacs/:id` (detalle: cargos y personas vigentes ahí), `GET /api/v1/unidades-fijas` (listado de CEMAR/COI/Red de Odontología con sus cargos, sin AP), `GET /api/v1/unidades-fijas/:id` (detalle: cargos y personas vigentes en esa unidad — quién está adentro de cada CEMAR, mismo patrón que `/cesacs/:id`)         | Jorge           | 5.5h | 🔴        | 📋     |
| S23-6 | Backend: agregar `areaProgramaticaId`/`cesacId`/`unidadFijaId` como nuevas dimensiones de `/api/v1/dotacion` — campo en `DimensionesDotacion` + rama en `condicionesDimensiones()` (`dotacion.service.ts`) y en `dotacionQuerySchema` **y** `grupoDotacionSchema` (`dotacion.schema.ts`), mismo patrón que `puestoNombre`/`especialidadNombre` del S21 — participan de las uniones OR igual que el resto, no es un filtro plano aislado                                                                                                                | Jorge           | 2.5h | 🟡        | 📋     |
| S23-7 | Frontend: sección **Área Programática** — listado de las 13 AP + pestaña/sección aparte **Estructura fija** (CEMAR, COI, Red de Odontología, marcados "sin AP asignada") y vista de detalle jerárquica navegable (Hospital → AP → CeSACs → cargos), más **detalle de una unidad fija** (click en un CEMAR → tabla de personal vigente ahí, igual que "Personal en CeSAC Nº9" del boceto), según el boceto interactivo del Artifact adjunto a este sprint                                | Agustín         | 13h  | 🔴        | 📋     |
| S23-8 | Frontend: filtro por Área Programática / CeSAC / unidad fija en Dotación (combobox contra el catálogo nuevo, mismo patrón que los demás filtros de esa pantalla)                                                                                                                                                                                                                                           | Agustín         | 3h   | 🟡        | 📋     |
| S23-9 | Verificación e2e: correr seed + backfill, confirmar % de cobertura del matching (CeSACs y unidades fijas), navegar Hospital → AP → CeSAC → cargos y el camino inverso en la UI, filtrar Dotación por AP, por CeSAC y por unidad fija                                                                                                                                                                       | Jorge + Agustín | 2.5h | 🔴        | 📋     |
| S23-10 | Backend: exponer `jefe` (nombre, cargo, cuil) en `/cesacs/:id` y `/unidades-fijas/:id` — **no es dato del decreto, se resuelve en runtime contra quién ocupa hoy el cargo de conducción**, reutilizando el patrón ya existente en `cadena-mando.service.ts` (`LEFT JOIN LATERAL` contra `ocupaciones` activas con `codigo_jefaturas` o escalafón de conducción, por `codigo_repa`) en vez de reimplementarlo. Requiere que CeSAC/unidad fija tengan su propio `codigo_reparticion` para poder cruzar contra `organigramas`/`cargos` con la misma lógica | Jorge           | 3h   | 🔴        | 📋     |
| S23-11 | Frontend: mostrar el **Jefe** de forma prominente en el detalle de cada CeSAC y de cada unidad fija (es a quién acudir en cualquier caso) — columna "Jefe" en la tabla de CeSACs de una AP, y callout destacado en el header del detalle de CeSAC/CEMAR/COI/Red de Odontología. Las filas de esa tabla de CeSACs pasan a ser clickeables, cada una abre el detalle de ese CeSAC puntual (no solo el genérico de ejemplo) | Agustín         | 4h   | 🔴        | 📋     |

**Total estimado:** ~44.5h

## Dependencias entre tareas

```
S23-1 ──► S23-2 ──► S23-3 ──► S23-4 ──┬─► S23-5 ──┬─► S23-7
                                       └─► S23-6   └─► S23-8
                                       └─► S23-10 ──► S23-11

(S23-5..S23-8, S23-10, S23-11) ──► S23-9
```

## Decisión pendiente (no bloquea el arranque)

Dónde vive la UI de navegación jerárquica: **extender el módulo Organigrama/Árbol existente** (reemplazando su rama heurística de APS por el catálogo oficial) vs. **módulo nuevo dedicado** "Áreas Programáticas". Se decide más adelante, antes de S23-7 — no cambia el trabajo de backend (S23-1 a S23-6).

## Criterio de éxito

- [ ] Cada una de las 13 Áreas Programáticas tiene su hospital de referencia correcto y la lista completa de sus CeSACs con dirección/barrio/nivel, igual que el Anexo III.
- [ ] Un cargo real del sistema, dado que su `descripcion_repa` indica un CeSAC, queda vinculado (`cesacId`) a ese CeSAC concreto — con reporte de cobertura conocido, no oculto.
- [ ] Desde un Hospital se puede ver su AP, sus CeSACs, y los cargos/personas de cada CeSAC — y a la inversa, desde un CeSAC se puede subir hasta su Hospital.
- [ ] Dotación permite filtrar por Área Programática, por CeSAC o por unidad fija (CEMAR/COI/Red de Odontología) igual que filtra hoy por hospital.
- [ ] CEMAR I–IV, Centro Odontológico Infantil N°1/N°2 y Red de Odontología están cargados como catálogo, nombrados igual que en el decreto, visibles en la UI como estructura fija de la Subsecretaría (sin AP asignada, porque el decreto no la define).
- [ ] Desde una unidad fija (ej. CEMAR I) se puede ver qué personas/cargos tiene vinculados hoy, igual que se puede ver el personal de un CeSAC concreto.
- [ ] Cada CeSAC y cada unidad fija muestra quién es su jefe vigente hoy (a quién acudir), resuelto en runtime — no un dato cargado a mano que se desactualiza.

## Fuera de alcance (registrado, no es un olvido)

- **Centros de Cuidados Integrales (CCI):** el decreto los menciona como supervisados por la Sección CeSAC, pero no los nombra individualmente ni dice cuántos son — no hay catálogo real que cargar, a diferencia de CEMAR/COI/Red de Odontología.
- Reemplazo completo del módulo Organigrama heurístico para `NIVEL CENTRAL`/`SAME`: este sprint toca únicamente la rama de Atención Primaria.
