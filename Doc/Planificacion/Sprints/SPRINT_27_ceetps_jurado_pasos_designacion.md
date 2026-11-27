# SPRINT 27 — Concursos CEETPS: asignación de jurado, pasos del concurso y Etapa 5

**Estado:** ✅ Código completo y con tests — ⏳ falta aplicar la migración y probar en la app
**Autores:** Agustín + Claude (frontend y backend)
**Origen:** feedback de negocio del 2026-11-17 sobre el wizard CEETPS
**Plan detallado:** `docs/superpowers/plans/2026-11-17-ceetps-jurado-inscriptos-etapa5.md`

---

## Qué cambió (solo CEETPS; el wizard CPH no se tocó)

### Etapa 2 — Asignación de jurado (reemplaza el sorteo)
- Primero se definen los lugares (titulares ≥ 1, suplentes ≥ 0); recién después se habilita la búsqueda.
- Búsqueda por CUIL, DNI o nombre + filtros de catálogo (repartición, escalafón, puesto, especialidad), solo entre **personas activas con cargo vigente ocupado** (`GET /personas?conCargoVigente=true`).
- La etapa 2 se completa con el jurado completo + fecha de autorización + disposición de llamado + tipo de gestión.
- Se quitaron el modal de sorteo, "reutilizar jurado" y el PDF "Acta de jurado" (eran del sorteo CPH).

### Etapa 3 — Cronograma y pasos del concurso
- **Cronograma:** 18 fechas (de la publicación a la adjudicación de cargos), editables siempre.
- **Pasos**, una pestaña cada uno: Inscripción → Admisibilidad → Examen → Análisis curricular → Entrevista → Orden de mérito final.
  - Cada pestaña muestra solo a quienes aprobaron el paso anterior.
  - Puntaje mínimo por paso (examen, CV, entrevista) a nivel concurso: igual al mínimo aprueba; vacío, aprueba cualquier puntaje cargado.
  - Reclamos de admisibilidad y de nota de examen: se registra si hubo reclamo y su resultado; además la admisión y la nota se pueden editar.
  - El orden de mérito final lo carga el jurado a mano: solo para finalistas y sin posiciones repetidas.
  - Todo es editable durante el concurso; quién aprobó cada paso se calcula al leer, así que editar un paso anterior nunca deja resultados viejos colgados.
- La etapa 3 se completa cuando todos los finalistas tienen posición.

### Etapa 5 — Pasos de la designación
Orden nuevo: Carga de documentación → EE de designación (TAD) → Fecha apto médico → Disposición de designación (DI / RESOL) + Fecha de disposición → Resolución de convalidación (RESOL / RESFC) → **Designación a la firma** (ex "Proyecto de resolución") → Resolución de designación + Fecha de resolución → **Resolución a la firma** (ex "Reso a la firma") → Cargo SIAL.
- Se quitó la **Fecha ITE**.
- Antes estos campos se mostraban pero **no se guardaban** en CEETPS (el adaptador los descartaba); ahora sí.

---

### Etapa 4 — Proponer candidato al INSAL (agregado 2026-11-24)
Al probar, "Proponer candidato" fallaba porque CEETPS no guardaba `inscriptoReservadoId`, `insalAceptado` ni `insalRechazados` (ni los expedientes IFACS/INSAL). Ahora se guardan: migración `20261124000000_ceetps_etapa4_insal_reserva` (5 columnas en `concursos_ceetps`, FK a `inscriptos_ceetps`), el PATCH valida que el candidato sea inscripto de ese concurso. Aplicada solo en la base local; **falta Neon** (mismo procedimiento manual, ver encabezado del .sql).

### Etapa 5 — Designado e enganche con el padrón (agregado 2026-11-24)
El designado es quien firmó el INSAL (Etapa 4). Se guarda por referencia (CUIL + nombre + ID SIAL rol opcional, `POST /:id/asignar-designado`) sin ocupar el cargo. Migración `20261124010000_ceetps_designado_referencia` (3 columnas). Al aprobar el padrón ("Aprobar todos"), si un diff coincide por CUIL (o ID SIAL rol), carrera y sigla del hospital con un concurso CEETPS designado, el cargo pasa a ocupado, se vincula la persona, se guarda `codigoSial` y se notifica a `concursales_ceetps`. Si el concurso ya tenía resolución de designación, queda finalizado. No incluye el preview de validaciones ni la aprobación diff por diff desde la UI (solo "Aprobar todos").

### Ronda 2026-11-24 (modificaciones de negocio)
- **Mayúsculas** en todo texto libre del wizard CEETPS (`lib/mayusculas.ts`, un handler en el contenedor).
- **Etapa 4:** sin "Expediente IFACS/INSAL" (solo fechas); se quita el texto `[ETL]` de las observaciones (migración de datos `20261124020000_*`, y ya no se guarda ni se muestra).
- **Etapa 5:** sin botón Registrar (autoguardado), sin Carga de documentación / Resolución de designación / Fecha de resolución; "Designación a la firma" y "Resolución a la firma" primeras en su tarjeta; Número de nota + Apto/No apto; **No apto** guarda al candidato en `designaciones_historial_ceetps` (migración `20261124030000_*`) y vuelve a la Etapa 4.
- **Fechas:** no pueden ir para atrás en toda la cadena (`errorEnCadenaFechas` en `@srrhh/types`, validado en front y en el PATCH).
- **Etapa 3:** cada paso es un modal (buscador + paginación), importación por Excel con aviso de estructura, posición del orden de mérito automática (entrevista > examen > CV), "Todos entregaron documentación", teléfono en el alta, reclamo de examen solo si no aprobó, resultado del reclamo oculto hasta marcar reclamo, paso en curso resaltado en pasos y cronograma.
- **Migraciones pendientes en Neon (a mano, en orden):** `20261124000000`, `20261124010000`, `20261124020000`, `20261124030000`.
- **Probar en el navegador con `http://localhost:5180`** (con `127.0.0.1` el login falla por CORS).

---

## Backend

| Qué | Dónde |
|---|---|
| Migración `20261118000000_ceetps_jurado_inscriptos_etapa5` (14 columnas en `concursos_ceetps` + tablas `miembros_jurado_ceetps` e `inscriptos_ceetps`) | `prisma/migrations/` |
| PATCH acepta Etapa 5, puntajes mínimos y `cronograma` | `concursos-ceetps.schema.ts` |
| `GET /:id/jurado`, `PUT /:id/jurado/cantidades`, `POST /:id/jurado/miembros`, `DELETE /:id/jurado/miembros/:miembroId` | `jurado.service.ts` |
| `GET/POST /:id/inscriptos`, `PATCH/DELETE /:id/inscriptos/:inscriptoId` | `inscriptos.service.ts`, `inscriptos.calc.ts` |
| Filtro `conCargoVigente` | `personas.service.ts` |
| Tablas nuevas clasificadas como BORRAR (igual que sus pares CPH) | `scripts/sync-cargos-msgc/limpieza.ts` |

Todas las escrituras nuevas exigen `concursos-ceetps / editar` y responden 409 con el concurso finalizado/desierto o con un cargo nuevo sin autorizar por SGRASV.

---

## Pendientes

1. **Aplicar la migración** en la base local y en Neon (a mano, como las anteriores: ver el encabezado del `.sql`) y reconstruir la API (`docker compose ... up -d --build api`).
2. **Probar en la app** el recorrido completo (jurado → pasos → etapa 5).
3. **Bloqueado por negocio:** selector Trámite a Distancia / Proyecto de Resolución (GENE1303) al inicio de la Etapa 5 y qué campos muestra cada camino. La columna `tramite_designacion` ya existe y el PATCH la acepta.
4. **A revisar con negocio:** el pedido mencionaba dos veces "Resolución a la firma" y "Fecha de resolución"; quedaron una sola vez cada una. La "Resolución de convalidación" quedó sin fecha propia.
5. Siguen fallando los 3 tests de `limpieza.test.ts` del Sprint 26 (Parte B): `usuario_siglas`, `concursos_asignados` y `etiquetas_concurso_ceetps` sin clasificar. No son de este sprint.
6. **Fuera de alcance:** módulo de Jurados (más adelante), importación de inscriptos por Excel, PDF del jurado y del orden de mérito CEETPS.
