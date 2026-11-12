# Sprint — Guarda contra padrón parcial (prevenir falsas bajas masivas)

> Plan acordado con Jorge (2026-10-30). Base: investigación read-only en
> `.agents/tasks/guarda-padron-parcial/findings.md`.
> Previene que un padrón PARCIAL (error de exportación del SIAL) se procese como
> completo y genere miles de falsas bajas (`validacion_vacante`).
>
> Dependencia: toca `padron.service.ts`. Lanzar DESPUÉS del backfill de vinculación
> de bajas (que también toca el módulo) para no pisar el mismo archivo.

---

## 1. Problema y causa raíz

- El padrón completo son ~52.000 registros. Los snapshots 2026-10-11 (31.655), -18 (4.899) y
  -25 (3.174) vinieron truncos (errores de exportación del SIAL) y se procesaron como completos.
- `calcularDiff()` (`padron.service.ts` ~L273) marca cada `id_sial` ausente del padrón nuevo como
  `tipo: 'eliminado'`. `aprobarSnapshotService` paso 5 (~L2499) los manda a `validacion_vacante`.
- **Único guard de volumen hoy:** `if (!result.total) throw` (~L1050) — solo rechaza padrón vacío
  (0 filas). Un padrón de 3.174 tras uno de 52.723 pasa sin alerta → generó ~2.279 falsas bajas.

## 2. Guarda a implementar

- **Métrica:** `ratio = totalRegistrosNuevo / totalRegistrosUltimoAprobado`. Referencia = último
  snapshot con `estado='aprobado'` (no el último subido). Primer padrón (sin aprobado previo): no aplica.
- **Umbral:** env `PADRON_RATIO_MINIMO` (zod en `config/env.ts`, `z.coerce.number().min(0).max(1).default(0.7)`).
  ratio < 0.70 ⇒ anómalo. (Datos reales: parciales dan 0.06–0.60; completo ~1.0.)
- **Comportamiento: BLOQUEO BLANDO con override explícito.**
  - Al terminar el pipeline (`runPipeline`, ~L1059): calcular ratio vs último aprobado; si < umbral,
    marcar el snapshot con advertencia (campo nuevo en `PadronSnapshot`, ej. `ratioTamano` / `advertenciaTamano`).
  - En `aprobarSnapshotService` (~L1666, junto a los guards): si el snapshot es anómalo y NO vino
    flag de override → `AppError.conflict(...)` con mensaje claro (ratio, conteos, "posible padrón parcial").
  - Override: flag explícito en `POST /snapshots/:id/aprobar`, auditado (usuario/timestamp/ratio),
    exige permiso `aprobar_padron` (ya requerido por la ruta).

## 3. Alcance (archivos — del findings §7)
- `apps/api/src/config/env.ts`: agregar `PADRON_RATIO_MINIMO`.
- `prisma/schema.prisma`: campo en `PadronSnapshot` para la advertencia/ratio (migración manual idempotente).
- `apps/api/src/modules/padron/padron.service.ts`: cálculo del ratio en `runPipeline`; bloqueo blando +
  parámetro override en `aprobarSnapshotService`.
- `apps/api/src/modules/padron/padron.routes.ts`: aceptar flag override en `POST /snapshots/:id/aprobar`.
- `apps/web/src/modules/padron/pages/PadronDiffPage.tsx` + `hooks/usePadron.ts`: mostrar advertencia de
  padrón chico junto a la pestaña "Bajas" / botón Aprobar, y pasar el override cuando el operador confirma.
- Tests: métrica de ratio pura, testeable como los helpers (`padron.diff.helpers.ts`); vitest.

## 4. Recuperación de los ~2.279 ya marcados (falsas bajas existentes)
- **Automática** al aprobar el próximo padrón COMPLETO: la lógica de reaparición (paso 4 reactivación
  por `id_sial` ~L2449 + marcador `__reabrir_ocupacion__` ~L2863) los vuelve a `vigente` con persona
  `activo=true`. NO requiere tocar datos.
- Opcional (red de seguridad): script read-write acotado a los cargos que pasaron a `validacion_vacante`
  en los snapshots parciales (2026-10-11/-18/-25, por `estadoDesde = fechaAsignada` de esos snapshots),
  para adelantar la restauración o cubrir los que no reaparezcan. Validar con RRHH (riesgo: reactivar
  una baja real mezclada). Fuera del alcance del código de la guarda.

## 5. Riesgos
- Bloquear un padrón legítimo → mitigado por override auditado. Umbral 0.70 deja margen.
- Referencia mal elegida → comparar contra último APROBADO (no último subido).
- Override sin traza → flag explícito + auditoría (aprobadoPorId/aprobadoAt).
- Primer padrón / BD vacía → la guarda no aplica (sin referencia).

## 6. Verificación
- Builds api + web verdes; vitest de padron sigue pasando + test nuevo de la métrica de ratio.
- NO ejecutar contra DB. Si se agrega campo al schema, migración manual que corre Jorge.
- Prueba funcional: simular aprobar un snapshot anómalo → bloquea; con override → aprueba.
