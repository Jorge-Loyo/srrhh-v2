# Sincronización de cargos con el Excel MSGC: diseño de las Fases 2 a 6

Estado: documento de diseño. Nada de lo descrito acá está implementado. La Fase 1 (simulación dry-run, solo lectura) vive en `apps/api/scripts/sync-cargos-msgc/` y su runbook en el `README.md` de ese directorio.

Fuente de verdad del requerimiento: las decisiones de Jorge (`.agents/tasks/sync-cargos-msgc/decisiones-jorge.md`, fuera de git). Este documento no cambia ninguna de ellas. Lo que Jorge no decidió figura como pregunta en la sección "Preguntas para Jorge".

## Principios que rigen todas las fases

- El Excel (hoja `NOMINAL DE CARGOS`, 53.064 filas en el corte 2026-11-01) es la ley. Al final, `estado IN ('vigente','validacion_vacante') AND deleted_at IS NULL` debe dar la cantidad de filas del Excel. Es el número a vigilar.
- No se crean estados nuevos. Lo que sobra pasa a `no_vigente` (enum `EstadoCargo` en `prisma/schema.prisma:21`).
- El proceso es semanal e idempotente: dos corridas con el mismo Excel dan el mismo resultado y la segunda no cambia nada.
- Siempre se simula primero. Recién con el OK de Jorge se escribe, primero en una base que no sea la de producción, después en Neon.
- Datos personales: ni CUIL, ni nombres, ni `id_sial_rol` salen a reportes, logs, tests ni documentos. `id_sial_rol` solo se usa como clave de cruce en memoria.
- La numeración del Excel (`CPH-P-00001`) no se importa: se renumera en cada corte. El número del código es el del sistema (6 dígitos).

## Lo que mostró la Fase 1 (cifras del corte 2026-11-01)

Cifras sacadas del Excel real y de una corrida con snapshot del sistema vacío. No hubo corrida contra Neon (ver "Qué no está verificado").

- 53.064 filas; todas con acrónimo resuelto por `acronimoMsgc` (53.064/53.064 contra la columna de acrónimo del Excel, sin excepciones).
- Con sistema vacío, el cruce reparte las filas así: c = 49.238 (ocupados a crear), d = 1.380 (segunda fila de un par de jefatura), e = 2.446 (sin ocupante: Concurso 1.656, Nunca levantado 744, Sin designar 46). Suma 53.064.
- Jefaturas: el Excel tiene 1.572 filas `-J` (ENF-J 906, TEC-J 287, EG-J 379), pero solo 1.380 son segunda fila de un par con el mismo ID SIAL Rol. Las otras 192 tienen un ID SIAL Rol único y no está resuelto cómo se vinculan a su cargo base (pregunta 3).
- "En validación" en el Excel: 790 filas, todas sin ocupante (Nunca levantado 744 + Sin designar 46).
- Los acrónimos que el Excel usa para jefaturas de CPH son `CPH-J-POF` y `CPH-J-POU`, no `CPH-J`. Cambian de prefijo `CPH-POF` a `CPH-P`, `CPH-POU` a `CPH-G`, `TEC-POF`/`TEC-POU` a `TEC`, `TEC-J-*` a `TEC-J` y los auxiliares de la carrera 85 a `ENF`. No cambian `CPH-J-POF`, `CPH-J-POU`, `CPH-D`, `CPH-SD`, `EG`, `EG-J`, `ENF`, `DOC` ni `SG`.
- Puestos sin destino definido (se reportan en la categoría j): carrera 87 `enfermeria` y `tecnico de la salud`; carrera 85 `tecnico`, `enfermeria`, `tecnico de la salud` y puesto vacío.
- Cifras que solo salen de la corrida contra la base real y hoy no se conocen: cantidad de colisiones de código, vacantes con vínculos (concursos, bajas, etc.), cargos del sistema que no están en el Excel (g), siglas fuera del maestro presentes en `organigramas.sigla`. Cada fase que dependa de ellas lo dice.

---

## Fase 2. Recodificación de códigos y generador

### Objetivo

Que el acrónimo del Excel reemplace el prefijo del código conservando el número del sistema (`CPH-POF-000123` pasa a `CPH-P-000123`; `CPH-POU-R-000123` pasa a `R-CPH-G-000123`), tanto en los cargos existentes como en los que se creen desde ahora. Al terminar no debe haber ningún cargo con prefijo `CPH-POF` ni `CPH-POU` (ni otro prefijo viejo que el Excel reemplace).

### Cambios concretos

1. Generador. `prefijoDeCargo()` (`apps/api/src/shared/codigoCargo.ts:61`) pasa a devolver el acrónimo del Excel. Hay que mover `acronimoMsgc` y `recodificarCodigo` (hoy en `apps/api/scripts/sync-cargos-msgc/`) a `apps/api/src/shared/` y que `prefijoDeCargo()` los use. Sus llamadores crean códigos nuevos: `autorizaciones.service.ts:595`, `cargos.service.ts:635`, `padron.service.ts:76`, `retenciones.service.ts:39` y `shared/derivarCargosConduccion.ts:219`.
2. Reemplazantes. `prefijoRemplazante()` (`codigoCargo.ts:250`) hoy arma `<prefijo>-R` o `<prefijo>-TTR`. Debe anteponer `R-` (decisión de Jorge). Consumidores: `concursos.service.ts:87` (además, el guard de `concursos.service.ts:85` usa la regex `/-(R|TTR)-\d{6}$/` para no recodificar dos veces: tiene que reconocer también el formato `R-…`) y `retenciones.service.ts:101`.
3. Detección de conducción. `PREFIJOS_CONDUCCION` (`codigoCargo.ts:220`) y `esConduccionPorPrefijo` (`codigoCargo.ts:230`) identifican jefaturas por prefijo, incluidos `AS-MIN`, `AS-SS`, `AS-DG` y `AS-DGA`. Con "AS" único (todo CR 25) esos cuatro prefijos desaparecen y el nivel (MIN/SS/DG/DGA) tiene que vivir en otro dato (pregunta 5). Con el prefijo `R-` adelante, `esConduccionPorPrefijo` debe sacar el `R-` antes de comparar. Hay que revisar todos los consumidores de prefijos hardcodeados:
   - `apps/api/src/modules/concursos-cph/concursos-cph.service.ts:226` (regex `^(CPH-J-|CPH-J$|CPH-D|…)`).
   - `apps/api/src/modules/organigrama/organigrama.service.ts:126`, `:192`, `:472`, `:508` (usan `esConduccionPorPrefijo` / `PREFIJOS_CONDUCCION`) y `:1378`, `:1398`, `:1405` (SQL con regex `^(AS|CPH-D|…)` y `LIKE 'AS-%'`).
   - `apps/api/src/modules/kpis/kpis.service.ts:1272` (ordena con `LIKE 'SG-%'`).
   - `apps/api/src/modules/cargos/cargos.service.ts:237-267` (filtros "solo jefes" / "sin jefes" con `PREFIJOS_CONDUCCION`).
   - `apps/api/src/modules/concursos-cph/sorteoJurado.service.ts:458` y `apps/api/src/modules/jornadas-sorteo/jornadas-sorteo.service.ts:30` (`esConduccionPorPrefijo`); `jornadas-sorteo.service.ts:41` (`cod.startsWith('CPH')` para `esMedico`).
   - `apps/api/src/shared/cargosOcultos.ts:34` (regex de conducción duplicada, que el propio archivo dice que debe mantenerse coherente con `PREFIJOS_CONDUCCION`).
   - Hay que buscar también en `apps/web` y en `services/` (Dotaneitor): esa búsqueda no se hizo para este documento.
4. Columna de reversa. Migración Prisma idempotente que agrega `cargos.codigo_legacy` (nullable). Hoy no existe en el esquema ni en el código. La recodificación guarda ahí el código viejo antes de pisar `codigo`. Esto es un cambio de esquema: sigue el flujo de `DEPLOY_PRODUCCION.md` §7 (ver Fase 6).
5. Colisiones. `cargos.codigo` es único (`prisma/schema.prisma:431`, `VarChar(30)`). Casos esperados: `TEC-POF-000005` y `TEC-POU-000005` apuntan ambos a `TEC-000005`; los auxiliares de la carrera 85 (hoy `TEC-POF`) pasan a `ENF-…` donde ya puede existir ese número. La Fase 1 lista cada colisión en la categoría i. La resolución no está decidida por Jorge (pregunta 1). La opción que conserva más de su decisión es asignar el siguiente secuencial libre del acrónimo nuevo al cargo que pierde, guardando el código viejo en `codigo_legacy`. El precedente es la recodificación `SG` a `RES` (`.agents/tasks/ajuste-res-codigo-tipo/INFORME.md`), que usó secuencial nuevo y un script Node transaccional con `maxSecuencialCargo`. Allí el usuario aceptó perder el número viejo; acá Jorge pidió conservarlo. Por eso es una pregunta, no una decisión de este documento.
6. Script de recodificación de los existentes: Node transaccional que reutiliza `codigoCargo.ts` (mismo enfoque del precedente `SG` a `RES`), con modo simulación por defecto.

### Riesgos

- Los códigos viejos están impresos en PDFs, expedientes y planillas. Después de recodificar no se encuentran por el código viejo; `codigo_legacy` permite buscarlos, pero la búsqueda de la UI tendría que usarlo.
- Los filtros por regex de prefijo (lista de arriba) pueden dejar de reconocer jefaturas y mostrar mal "solo jefes", el sorteo de jurado y el orden del organigrama. Es el riesgo más alto de esta fase.
- Los límites de `VarChar(30)` alcanzan: el código más largo, `R-CPH-J-POF-000123`, tiene 18 caracteres.
- Una recodificación a medias deja dos formatos conviviendo.

### Verificación

- Tests unitarios de `prefijoDeCargo` con los 23 acrónimos y de `prefijoRemplazante` con `R-` adelante.
- La simulación de la Fase 1 (colisiones y recodificación propuesta) sin colisiones sin resolver.
- Contra una base de pruebas: `SELECT count(*) FROM cargos WHERE codigo ~ '^(R-)?(CPH-POF|CPH-POU)-'` da 0, y lo mismo para los demás prefijos viejos que el Excel reemplaza. Suite completa de vitest sin fallas nuevas.

### Rollback

- Backup previo de `cargos` (precedente: `.agents/tasks/ajuste-res-codigo-tipo/backup_pre_recod_2026-10-28.dump`).
- Transacción única para la recodificación.
- `UPDATE cargos SET codigo = codigo_legacy WHERE codigo_legacy IS NOT NULL` revierte los códigos (la columna se conserva hasta que Jorge dé por cerrada la etapa de pruebas).

---

## Fase 3. Catálogos

### Objetivo

Que los catálogos del sistema resuelvan todas las filas del Excel (categoría j de la Fase 1 en cero, salvo lo que Jorge decida dejar afuera).

### Cambios concretos

1. Siglas. Crear las 19 siglas fuera del maestro (DGAH*, SSAME, SSSAME, UAIEAIT; `ssapac` se resuelve por equivalencia a `SSAPAC`). Jorge pidió verificar si están en el organigrama: la categoría j de la corrida contra la base indica para cada sigla si existe en `organigramas.sigla`. Si no están, se crean igual y se informa. Los datos de hospital que no vienen en el Excel (nombre, área) quedan pendientes (pregunta 6).
2. Alias de puestos. Resolver con equivalencias en el sistema, no en el Excel (decisión de Jorge): `ENFERMERIA`/`Enfermeria`, `Tecnico de la Salud` en CR 87, `chofer de ambulancias` a `chofer de ambulancia`, abreviaturas de la carrera 85. Faltan los destinos de los puestos sin destino definido (lista arriba): pregunta 7.
3. Anexo II de la 83. `ANEXO_II_83` (`apps/api/src/modules/padron/derivarRegimen.ts:51`) hoy tiene 9 literales, entre ellos `radioperador`, `chofer de funcionario` y `capellan`. Pasa a: agregar `radio operador` y `radio operador de emergencias` (hoy solo está `radioperador`, sin espacio; el Excel lo escribe con espacio) y sacar `capellan` y `chofer de funcionario`. `chofer de ambulancia` ya está; el `Chofer de ambulancias` del Excel entra por la equivalencia de puestos. Jorge aclaró que "son Anexo II, solo que hoy no tenemos cargos que lo ocupan". Después hay que recalcular `regimen_id` de las ocupaciones afectadas: cambia qué cargos de la 83 generan concurso.
4. Especialidad. Lo que diga `enfermeria` pasa a `Enfermeros ATC`. Jorge indicará después cuáles son ATP, y esos se editan aparte.
5. Residencias. Separar `RB`, `RPB` y `RES-J` según el literal del puesto (regla ya implementada en `acronimoMsgc`). El año de residencia no se deriva: sale del literal.
6. Autoridades superiores. Todo código de registro 25 queda como `AS` (ver Fase 2, punto 3, por el nivel).

### Riesgos

- Crear siglas sin datos completos de hospital puede dejar registros a medio cargar que después aparecen en listados.
- Cambiar `ANEXO_II_83` cambia el régimen de personas ya cargadas, y con eso qué cargos generan concurso. Es un cambio con efecto visible.
- Un alias mal definido manda cargos al puesto equivocado y se arrastra a las semanas siguientes.

### Verificación

- Corrida de simulación: la categoría j baja a cero salvo excepciones listadas.
- Tests de `derivarRegimen` con los literales nuevos y sin `capellan`/`chofer de funcionario`.
- Conteo de personas cuyo `regimen_id` cambia, revisado por Jorge antes de aplicar.

### Rollback

- Las siglas y los alias son inserciones: se revierten borrando lo creado en la corrida (se registran sus ids).
- El recálculo de `regimen_id` se revierte desde el backup previo de `ocupaciones` (se guarda la tabla antes de recalcular).
- `ANEXO_II_83` es código: se revierte con git.

---

## Fase 4. Jefaturas automáticas (ENF-J, TEC-J, EG-J)

### Objetivo

Crear las jefaturas como cargo aparte, vinculadas al cargo base de la misma persona, y que el sistema lo haga solo al dar de alta una jefatura. Jorge: "en cargo de jefe de enfermería adentro debe de tener un cargo de enfermería", y "tiene que estar en el árbol" para `CPH-J`.

### Cambios concretos

1. Modelo del vínculo jefatura a cargo base. Hoy `cargo_base_id` y `cargo_retenido_id` (`prisma/schema.prisma:481` y `:484`) significan cadena de retención de reemplazantes (relaciones `CargoRemplazante` y `CadenaCargo`, `:535` y `:537`). Reusarlas mezclaría dos significados. Recomendación: una auto-FK nullable nueva (por ejemplo `cargo_ejecucion_id`) con `ON DELETE SET NULL` e índice. Es un cambio de esquema; requiere decisión (pregunta 3).
2. Alta automática. Cuando se da de alta (o se sincroniza) una jefatura ENF-J/TEC-J/EG-J, el sistema crea o enlaza el cargo base ENF/TEC/EG. Hay que ubicar el punto único de alta de jefaturas (candidatos: `cargos.service.ts` y `shared/derivarCargosConduccion.ts`; no se abrió su flujo completo para este documento).
3. Condición de árbol. `CPH-J` solo si el cargo tiene línea en el organigrama (`origen = 'organigrama'`); sin línea es cargo de ejecución (`CPH-P`/`CPH-G`). El Excel usa la columna `tipo` (Conducción/Estructura) para eso; el sistema debe derivarlo del organigrama.
4. Casos de la sincronización: de las 1.572 filas `-J`, 1.380 vienen en par (jefatura más base con el mismo ID SIAL Rol) y 192 no. Para las 192 hay que definir cómo se encuentra el base (pregunta 3).
5. Que el "contiene" se vea en la UI (ficha del cargo y organigrama) queda fuera de este diseño.

### Riesgos

- Duplicar dotación: el ocupante figura en dos cargos. Los conteos de dotación y de KPIs deben contar el cargo base, no la jefatura, o el total no cierra con el Excel. Hay que decidir qué cuenta cada KPI (el Excel cuenta ambos).
- La migración de esquema debe seguir el flujo de `DEPLOY_PRODUCCION.md` §7.
- Una jefatura creada sin base disponible queda huérfana.

### Verificación

- Test: crear una jefatura ENF-J dispara la creación o el enlace del ENF base; repetir no duplica.
- Simulación: de las filas `-J`, cuántas encuentran base y cuántas quedan huérfanas.
- Consulta de consistencia: toda jefatura vigente tiene base vigente.

### Rollback

- Backup previo de `cargos`; la columna nueva es nullable, así que dejarla sin usar es inocuo.
- Las jefaturas creadas por la sincronización se identifican por origen (documento de origen "Mapeo MSGC") para poder pasarlas a `no_vigente` o borrarlas si no tienen vínculos.

---

## Fase 5. Modo escritura de la sincronización

### Objetivo

Aplicar a la base lo que la simulación reporta, de forma idempotente y repetible cada semana, dejando vigentes + validación igual a la cantidad de filas del Excel.

### Cambios concretos

1. Crear lo que falta: categorías c (ocupados), d (jefaturas) y e (cupos sin ocupante). Se crean todos los bloques, incluidos "Nunca levantado" (744) y "Sin designar" (46), con el estado del Excel. No generan concurso automático (carga de inventario, no alta): hay que confirmarlo (pregunta 8).
2. Reemplazo de vacantes. Jorge propone borrar las vacantes actuales y recrearlas desde el Excel. Los cargos tienen FKs RESTRICT desde `concursos`, `concursos_cph`, `concursos_ceetps`, `bajas`, `padron_historico` y `ocupaciones` (verificadas en el análisis de la Fase 1: `prisma/migrations/0_init/migration.sql` y `20261108000000_padron_incidencias`). Además `etiquetas_cargo` es CASCADE y `solicitudes_alta.cargos_creados_ids` es un arreglo sin FK. Consecuencia: el DELETE físico solo es posible para vacantes sin vínculos. La cifra "con vínculos" de la categoría f (sale de la corrida real) dice cuántas no se pueden borrar. Para esas, la propuesta es reusar el cargo (actualizar sus atributos para que coincida con una fila del Excel de la misma sigla, acrónimo, puesto y especialidad) o, si sobra, soft delete (`deleted_at`) y `no_vigente`. Es una pregunta para Jorge (pregunta 2).
3. Cargos del sistema que no están en el Excel (categoría g): `estado = 'no_vigente'`, `sub_estado = NULL`, `estado_desde` = fecha de la corrida. Sin estado nuevo.
4. "En validación": el Excel dice "plaza nunca cubierta"; en el sistema es un cargo de baja sin concurso iniciado en etapa 2 (decisión de Jorge: vale la lógica del sistema). La Fase 1 proyecta las 790 filas "En validación" del Excel a `validacion_vacante` solo como proyección. Hay riesgo de doble conteo con los `validacion_vacante` que el sistema ya tiene (la Fase 1 los deja en la categoría h y no los reemplaza). Pregunta 4.
5. Documento de origen. Jorge pidió no dejar solo "Mapeo MSGC": vincular cada cargo creado con un expediente usando las fuentes disponibles. Orden propuesto: (a) la columna `expediente` del CSV de la Fase 1 (valores `EX-AAAA-…` de la columna M del Excel; 1.612 filas en este corte), (b) concursos del sistema para cargos en concurso, (c) `solicitudes_alta` (`cargos_creados_ids`), (d) `bajas`, (e) padrón. Lo que no se vincule queda con origen "Mapeo MSGC" y fecha de corte, y se lista en el reporte. Qué fuente gana si hay dos expedientes distintos es pregunta 9.
6. Idempotencia y corrida semanal. Cada fila se identifica por su clave de cruce (ID SIAL Rol para ocupados; cupo por sigla, acrónimo, puesto y especialidad para vacantes). Una segunda corrida con el mismo Excel debe dar cero cambios. El reporte semanal calcula el delta contra `resumen.json` de la corrida anterior (ya implementado en la Fase 1 con `--previo`).
7. Orden de ejecución: simulación, luego una base que no sea producción (rama de Neon o una restauración del backup), luego Neon real con el OK explícito de Jorge. Hoy "local" es la Neon de producción (`docker-compose.override.yml` apunta la API a Neon directa, `:5432`; ver `Doc/Desarrollo/ARRANQUE_LOCAL.md`), así que una base separada hay que crearla a propósito.
8. Modo escritura: flag explícito y separado de la simulación, transacción única, `statement_timeout`/`TX_OPTS_LARGA` (`apps/api/src/shared/txOpts.ts`) y log de cada cambio sin datos personales.

### Riesgos

- La escritura apunta por defecto a producción. Es el riesgo principal: sin una base de pruebas, el primer error se paga en producción.
- Reemplazar vacantes con concursos o bajas asociados puede dejar huérfanos documentos o historiales si se hace mal.
- La dotación y los KPIs se mueven por la sola sincronización (cientos de cargos nuevos o dados de baja de golpe).
- El Excel cambia cada semana: un cargo puede pasar a `no_vigente` por un error de carga en el Excel y volver a crearse la semana siguiente. Conviene mostrar en el reporte los cargos que cambian de estado dos semanas seguidas.

### Verificación

- Simulación previa y revisión de Jorge de las cifras de c, d, e, f, g.
- Doble corrida: la segunda no cambia nada.
- Cierre aritmético de la Fase 1: `vigentes_hoy + (c+d+e) − f_reemplazados − g = proyectado`, comparado con las filas del Excel (53.064 en este corte), informando las dos métricas (solo `vigente` y `vigente + validacion_vacante`).

### Rollback

- Backup previo de `cargos` y de las tablas que se toquen (`ocupaciones` si corresponde).
- Transacción única: si algo falla, no queda nada a medias.
- Todo cargo creado por la sincronización queda marcado con su origen y la fecha de corte, para poder identificarlo y revertirlo con una consulta.

---

## Fase 6. Verificación final y rollback global

### Objetivo

Confirmar que el sistema quedó igual al Excel y dejar una vía de vuelta atrás.

### Cambios concretos

1. Conteo. `estado IN ('vigente','validacion_vacante') AND deleted_at IS NULL` igual a las filas del Excel (53.064 en este corte), y desglose por acrónimo contra la hoja `Resumen` del Excel.
2. Cero cargos con prefijo viejo (`CPH-POF`, `CPH-POU`, y los demás reemplazados por la Fase 2).
3. Sub-estado. Recalcular `cargos.sub_estado` con `scripts/sql/recalcular-sub-estado-cargos.sql` (regla: `estado <> 'vigente'` da `NULL`).
4. KPIs. Revisar las tarjetas de dotación y `kpis_dotacion_snapshot`: si una migración de la Fase 2 o la 4 recreara esa tabla, hay que re-correr los backfills de `DEPLOY_PRODUCCION.md` (trampa 2 de §7).
5. Reporte final por acrónimo y por categoría, sin datos personales.

### Riesgos

- Cerrar con el conteo correcto pero con la distribución por acrónimo equivocada.
- Migraciones aplicadas a mano: ver la trampa siguiente.

### Verificación

- Las consultas de arriba, ejecutadas sobre la base final, más la simulación sobre esa misma base: debe reportar cero diferencias.

### Rollback

- Restaurar el backup previo de `cargos` (y de `ocupaciones` si se tocó), con la transacción única de la Fase 5 como primera línea de defensa.
- `codigo_legacy` revierte los códigos (Fase 2).
- Trampas de despliegue (`Doc/Desarrollo/DEPLOY_PRODUCCION.md` §7, desde la línea 89): si una migración de esquema (por ejemplo `codigo_legacy` o la auto-FK de jefaturas) se aplica a mano en Neon, Render la ve como pendiente, el `ALTER TABLE` falla y Prisma la marca como fallida (error P3009), lo que bloquea el arranque del backend. Hay que marcarla como aplicada con `prisma migrate resolve --applied <nombre>` antes de pushear, o dejar que la aplique Render. Los pasos están en esa sección.

---

## Riesgos transversales

- Local es Neon de producción. `docker-compose.override.yml` (archivo local, fuera de git) fija la API contra Neon directa. No hay base de pruebas separada salvo que se cree una.
- Referencias externas a códigos viejos: PDFs, expedientes y planillas. Se mitiga con `codigo_legacy`, no se elimina.
- Numeración del Excel inestable: no importarla nunca; si aparece como pedido, recordar que se renumera en cada corte.
- Datos personales: el Excel trae CUIL en la columna M de los ocupados y nombres en la columna AC; el preprocesador de la Fase 1 no los lee. Cualquier fase futura debe mantener esa garantía. `id_sial_rol` no sale a ninguna salida.
- Procesos paralelos que crean cargos (padrón, cargas masivas de concursos, altas) compiten por los secuenciales y por los códigos: hacer los cambios de las Fases 2 y 5 en una ventana sin carga masiva (recomendación ya usada en el precedente `SG` a `RES`).
- El Excel cambia cada semana: el proceso tiene que tolerar cortes con menos o más filas que el anterior sin repetir cambios.

## Preguntas para Jorge

1. Colisiones de código (Fase 2): cuando dos cargos recodificados dan el mismo código (por ejemplo `TEC-POF-000005` y `TEC-POU-000005`), ¿el que pierde recibe el siguiente número libre del acrónimo (y su código viejo queda en `codigo_legacy`)? Jorge pidió conservar el número del sistema, que en una colisión no se puede para los dos.
2. Vacantes con vínculos (Fase 5): para las vacantes con concursos, bajas u otros vínculos, ¿se reusan para el cupo equivalente del Excel o se pasan a `no_vigente`? No se pueden borrar físicamente.
3. Jefaturas (Fase 4): ¿se agrega una columna nueva para el vínculo jefatura a cargo base, o se reusa `cargo_base_id`? ¿Cómo se vinculan las 192 filas `-J` que no vienen en par con un base?
4. "En validación" (Fase 5): las 790 filas del Excel, ¿se crean como `validacion_vacante` aunque el sistema ya tenga cargos en ese estado (posible doble conteo)? ¿Y qué métrica se vigila: solo `vigente` o `vigente + validacion_vacante`? Este documento y la Fase 1 usan la segunda.
5. Autoridades superiores (Fase 2): con todos los CR 25 como `AS`, ¿dónde se guarda el nivel (MIN, SS, DG, DGA)? Hoy lo da el prefijo.
6. Siglas nuevas (Fase 3): ¿qué datos se cargan para las 19 siglas, además de la sigla?
7. Puestos sin destino (Fase 3): ¿a qué puesto del catálogo van CR 87 `enfermeria` y `tecnico de la salud`, y CR 85 `tecnico`, `enfermeria`, `tecnico de la salud` y puesto vacío?
8. Concursos (Fase 5): los cargos creados por la sincronización, ¿no disparan concurso automático? (Es lo coherente con "carga de inventario", pero Jorge no lo dijo expresamente para los creados por la sincronización.)
9. Documento de origen (Fase 5): si un cargo tiene dos expedientes posibles (columna M del Excel y un concurso del sistema), ¿cuál prevalece?
10. Base de pruebas (Fase 5): ¿se crea una rama de Neon o una base restaurada para ensayar antes de escribir en la real?

## Qué no está verificado

- No hubo corrida contra Neon ni con Docker: las consultas de `sistemaReadonly.ts` no se ejecutaron contra una base real, por lo que las cifras de colisiones, vacantes con vínculos, categoría g y siglas en el organigrama no se conocen todavía. La corrida la hace Jorge siguiendo el README de `apps/api/scripts/sync-cargos-msgc/`.
- Los números de línea citados se abrieron en el código de la rama `sync-cargos-msgc-f1` (base `2acb93a`) y pueden moverse con cambios posteriores.
- No se buscaron consumidores de prefijos en `apps/web` ni en `services/`.
- El punto de alta de jefaturas (Fase 4, punto 2) y los llamadores de `prefijoDeCargo` no se leyeron en su flujo completo.
