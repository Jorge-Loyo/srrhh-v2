# Sprint 19 — Revisión contra el código actual + plan para Jorge y Agustín

> Documento de planificación del día. Revisa el Sprint 19 documentado
> (`Sprints/SPRINT_19_retenciones_vencimientos_comision.md`) contra lo que
> **realmente existe en el código** al día de hoy, y ajusta el reparto para dos
> developers (Jorge = backend, Agustín = frontend).

---

## Veredicto de alineación

El Sprint 19 documentado está **parcialmente desalineado**: da por construir cosas
que ya existen y asume un punto de partida más pobre que el real. Hay que ajustarlo
antes de arrancar.

### Lo que el doc NO refleja (ya está hecho en el código)

- **Cálculo de vencimiento ya implementado.** En `retenciones.service.ts`
  (`listRetenidosService`) ya están:
  - `fechaVencimiento()` con la regla completa: jefatura/conducción → inicio + 4 años;
    Director/Subdirector/Vicedirector/planta **no vencen**; centinela `01/01/4000`
    (año ≥ 3000) → no vence; resto → `CARGO_HASTA` genuino.
  - `esCargoSinVencimiento()` y el campo `venceEl` ya se calcula y devuelve por cada
    cargo actual.
  - → **El "core" de vencimientos del S19 ya existe.** Lo que falta es exponerlo como
    **vista + notificaciones automáticas**, no calcularlo.
- **`situacionRevista = 'Comision'` ya se contempla** en la validación de retenciones
  (se excluye del conteo). Falta el flujo para *registrar/terminar* una comisión, no el
  reconocimiento del estado.

### Lo que el doc pide y realmente falta (confirmado en código)

| Tarea | Estado real |
|---|---|
| S19-1 enum `vencimiento_conduccion` | ❌ El enum `TipoNotificacion` tiene 5 tipos, sin ese |
| S19-2 `materializarAlertasVencimiento()` | ❌ Solo existe `materializarAlertasEstancamiento` |
| S19-3 integrar en `GET /notificaciones` | ❌ |
| S19-4/5 `renovarPeriodoService` + `PATCH /retenciones/:id/renovar` | ❌ |
| S19-6/7 módulo `comisiones/` + endpoints | ❌ No existe el módulo |
| S19-8 verificar `situacionRevista` en `aprobarSnapshotService` | ⚠️ Sin verificar |
| S19-9/10/11 frontend (vencimientos, renovar, comisión) | ❌ No hay páginas; hoy existen `RetencionesPage`, `RetencionesListaPage`, `ValidacionRetencionesPage` |

### Hallazgo extra (no es del S19, pero conviene decidir)

- **Services de retención sin ruta expuesta.** `retenciones.routes.ts` solo publica
  `GET /validacion` y `GET /retenidos`. Pero el service tiene `registrarRetencionService`,
  `titularCesaService`, `getCadenaRetencionService`, `getCargoConRemplazanteService`
  **sin endpoint**. O se consumen desde otro módulo, o es deuda. **Verificar antes de
  S19** — si registrar retención / titular-cesa no tienen ruta, el flujo de retención no
  está completo end-to-end y eso es más prioritario que vencimientos.

---

## Ajuste del alcance del S19 (realista)

- **Quitar** del sprint el cálculo de vencimiento (ya está).
- **Reenfocar S19-9** (vista vencimientos): consume el `venceEl` que ya calcula el
  backend; el backend solo agrega el endpoint de listado si hace falta filtrar por urgencia.
- **Mantener**: notificaciones automáticas (S19-1/2/3), renovación (S19-4/5), comisión
  (S19-6/7/8), y el frontend (S19-9/10/11).
- **Agregar tarea 0**: verificar/exponer rutas de retención faltantes (registrar/cesa) —
  bloquea el flujo real.

---

## Plan para 2 developers — hoy

### 🔵 Jorge (backend) — ~6.5 h

**Bloque 0 · Cerrar el flujo base (primero — es prerequisito real)**
- **S19-0** Verificar si `registrarRetencion` / `titularCesa` / `getCadena` tienen ruta.
  Si no, exponerlas en `retenciones.routes.ts`. — 1h

**Bloque A · Notificaciones de vencimiento** *(reusa `venceEl` ya existente)*
- **S19-1** Enum `vencimiento_conduccion` + migración manual (shadow DB roto →
  `migrate deploy` + `generate`) — 0.5h
- **S19-2** `materializarAlertasVencimiento()` — reusa la lógica de `fechaVencimiento`
  ya escrita, no la reimplementa — 1.5h
- **S19-3** Integrar en `GET /notificaciones` — 0.5h

**Bloque B · Renovación**
- **S19-4/5** `renovarPeriodoService` + `PATCH /retenciones/:cargoId/renovar` — 1.5h

**Bloque C · Tipos (entregar temprano a Agustín)**
- **S19-12** `packages/types`: `VencimientoCargo`, `ComisionInput`, tipo nuevo — 0.5h

**Bloque D · Comisión** *(independiente)*
- **S19-6/7/8** módulo `comisiones/` + endpoints + verificación snapshot — 1h (parcial hoy)

### 🟢 Agustín (frontend) — ~7 h

*Arranca con S19-12 (tipos) + el `venceEl` que ya expone `/retenidos`.*
- **S19-9** Vista `/retenciones/vencimientos`: tabla con `venceEl`, días restantes,
  badges de urgencia (>90 gris / ≤90 amarillo / ≤30 naranja / vencido rojo), filtros por
  hospital y urgencia. Puede empezar YA contra `/retenidos` (ya trae `venceEl`). — 4h
- **S19-10** Modal de renovación de período (depende de S19-5) — 1.5h
- **S19-11** Modal de comisión manual (depende de S19-6/7) — 2h *(si el backend de
  comisión no llega hoy, queda mañana)*

### 🤝 Cierre
- **S19-13** Verificación e2e (los 8 escenarios del doc, quitando los de cálculo de
  vencimiento que ya andan) — 1.5h

---

## Orden para no bloquearse

```
Jorge:  S19-0 (rutas) ─► S19-1 ─► S19-2 ─► S19-3
                       └► S19-12 (tipos, temprano) ─► S19-4/5
                       └► (paralelo) S19-6/7/8 comisión

Agustín: S19-9 (arranca ya contra /retenidos + venceEl)
              └► S19-10 (tras S19-5)   └► S19-11 (tras S19-6/7)

Ambos:  ──────────────────────────────► S19-13 e2e
```

## Riesgos / recordatorios

- Migración: shadow DB roto → migración manual + `prisma migrate deploy` + `generate`.
- Neon es espejo de local (clonado 2026-09-24): aplicar ahí también las migraciones
  nuevas si se prueba contra Neon.
- Al cerrar, actualizar `PLAN_SCRUM_2026.md`: hoy marca Sprint 18/19 como "planificado"
  cuando 18 está hecho y 19 arranca — está desactualizado.
- **Coordinación (DoD del equipo)**: Jorge toca `notificaciones.service.ts`; avisar por
  Notion antes de que Agustín toque algo ahí.
