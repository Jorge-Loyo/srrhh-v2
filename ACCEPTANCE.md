# ACCEPTANCE — Unificación de «Evolución de dotación» (`/reportes`)

Rama: `fix-evolucion-dotacion`. Unifica las dos vistas de evolución de dotación detrás de un
**motor único**: `count(DISTINCT cuil)` por **código de registro** (`codigos_registro.codigo`, no
escalafón), desglosado por **situación de revista** (una serie por estado, series NO disjuntas) +
una línea/fila **TOTAL** calculada aparte, al último padrón aprobado de cada mes, reconstruyendo el
estado acumulado de `padron_historico` + `padron_diff`.

Cambios por FEAT: **FEAT-001** (schema Prisma `kpis_dotacion_snapshot` reescrito + migración manual
DROP+CREATE + tipos `@srrhh/types`), **FEAT-002** (motor unificado en `kpis.service.ts` + populate
al aprobar + scripts SQL + test puro), **FEAT-003** (frontend: una línea por estado + total en
ambos gráficos, combo Carrera por código con label literal), **FEAT-004** (candado de normalización
en el Dotaneitor + contratos + este documento).

---

## A. Orden de ejecución en Neon (lo corre el USUARIO, back-to-back, en una sola sesión)

> ⚠️ El agente **nunca** ejecuta SQL ni migraciones contra Neon (el `.env` local apunta a Neon
> **producción**). Todo lo de abajo lo corre el usuario a mano. Correr los 4 pasos **seguidos**,
> sin dejar la ventana abierta entre uno y otro (ver §D sobre la ventana de tarjetas vacías).

1. **Aplicar la migración Prisma** `prisma/migrations/20261020000000_kpis_dotacion_situacion_revista/migration.sql`.
   Es un **DROP + CREATE** de `kpis_dotacion_snapshot`: la tabla queda **VACÍA** (el dato viejo,
   grano `(fecha, escalafon)`, no es convertible al nuevo grano `(fecha, codigo_registro,
situacion_revista)`; se re-popula entero por el backfill del paso 3). Aplicarla por el canal
   habitual de migraciones manuales en Neon — **no** con `prisma migrate dev/deploy`.

2. **Normalizar la situación de revista** — correr `scripts/normalizar_situacion_revista.sql`.
   Baja `situacion_revista` a minúscula-sin-tilde sobre `ocupaciones` y `padron_historico`
   (idempotente; trae SELECT de variantes antes/después). Esto debe ir **antes** del backfill: el
   motor agrupa por el valor ya normalizado.

3. **Re-backfill de las tarjetas** — correr `scripts/backfill_kpis_dotacion.sql`. Reconstruye
   `kpis_dotacion_snapshot` completo con el motor unificado: una fila por
   `(fecha, codigo_registro, situacion_revista)` + la fila reservada `situacion_revista = '(total)'`
   por carrera. Trae SELECT de control (variantes residuales de situación, personas en
   `'(sin codigo)'`, personas con cargos vigentes en >1 código).

4. **Validar** con las queries de §B. Si las 4 cifras meta de CPH dan, el motor reconcilia.

> **Fuente de verdad del estado acumulado:** el CTE copiado en `backfill_kpis_dotacion.sql` es una
> copia textual de `estadoActivoAcumuladoSql` (en `apps/api/src/modules/kpis/kpis.service.ts`), que
> es el mismo generador que usa el populate al aprobar y la consulta individual. Los tres
> consumidores comparten la lógica por construcción.

---

## B. Queries de aceptación (§8.1) — CPH = código 37, corte oct-26 (padrón 2026-10-18)

Metas **EXACTAS** (son las cifras que el usuario obtuvo con sus queries sobre ocupaciones vigentes,
adaptadas a `cr.codigo = '37'` y estado normalizado `lower(unaccent(trim(...)))`):

| Métrica                                       | Valor esperado |
| --------------------------------------------- | -------------- |
| `(total)` — personas únicas, cualquier estado | **17591**      |
| serie `activo`                                | **17445**      |
| serie `retencion de cargo`                    | **1567**       |
| serie `comision`                              | **10**         |

> Las series **NO** suman el total (`17445 + 1567 + 10 = 19022 ≠ 17591`): una persona cuenta en
> cada estado donde tiene al menos una ocupación vigente (series no disjuntas). El total es su
> propio `count(DISTINCT cuil)`.

**B.1 — Desglose materializado (lo que quedó en `kpis_dotacion_snapshot` tras el backfill):**

```sql
SELECT situacion_revista, personas
FROM kpis_dotacion_snapshot
WHERE codigo_registro = '37'
  AND fecha = (
    SELECT max(fecha_asignada) FROM padron_snapshots
    WHERE estado = 'aprobado'
      AND date_trunc('month', fecha_asignada) = date '2026-10-01'
  )
ORDER BY situacion_revista;
-- Esperado: (total)=17591, activo=17445, retencion de cargo=1567, comision=10
```

**B.2 — Reconstrucción directa sobre ocupaciones vigentes (la query original del usuario, para
contrastar contra B.1):**

```sql
-- TOTAL (cualquier estado)
SELECT count(DISTINCT p.cuil) AS total
FROM ocupaciones o
JOIN cargos c            ON c.id = o.cargo_id
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
JOIN personas p          ON p.id = o.persona_id
WHERE o.hasta IS NULL AND cr.codigo = '37' AND p.cuil IS NOT NULL;
-- Esperado: 17591

-- Por situación de revista normalizada (una fila por estado, NO disjuntas)
SELECT lower(unaccent(trim(o.situacion_revista))) AS estado,
       count(DISTINCT p.cuil) AS personas
FROM ocupaciones o
JOIN cargos c            ON c.id = o.cargo_id
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
JOIN personas p          ON p.id = o.persona_id
WHERE o.hasta IS NULL AND cr.codigo = '37' AND p.cuil IS NOT NULL
GROUP BY lower(unaccent(trim(o.situacion_revista)))
ORDER BY personas DESC;
-- Esperado: activo=17445, retencion de cargo=1567, comision=10
```

---

## C. Salvaguarda contra falso negativo

Si las cifras de §B **divergen** de las metas, **antes** de atribuirlo a un bug del motor,
confirmar que **las ocupaciones vivas no cambiaron fuera de padrón** respecto del corte 2026-10-18.
El motor cuenta sobre `padron_historico` reconstruido al corte del snapshot; la query de contraste
B.2 cuenta sobre `ocupaciones` vigentes **ahora**. Si alguien tocó ocupaciones (altas/bajas/UPDATE
manual) después del 2026-10-18 — o si corrió otro padrón posterior que movió el `max(fecha_asignada)`
del mes —, las cifras legítimamente difieren y **no** es un bug del motor. Verificar primero:

```sql
-- ¿El corte del mes sigue siendo 2026-10-18?
SELECT max(fecha_asignada) FROM padron_snapshots
WHERE estado = 'aprobado' AND date_trunc('month', fecha_asignada) = date '2026-10-01';
-- Esperado: 2026-10-18 (si cambió, las metas de §B ya no aplican a ese corte)

-- ¿Hubo cambios de ocupaciones vivas fuera del flujo de padrón?
SELECT count(*) FROM ocupaciones WHERE hasta IS NULL;  -- comparar contra el conteo del corte
```

Solo tras descartar esto, tratar una divergencia como bug del motor unificado.

---

## D. Ventana de tarjetas vacías + confirmación de no-migración automática

- **Ventana de tarjetas vacías.** Entre el paso A.1 (migrar → tabla vacía) y el final del paso A.3
  (backfill), las tarjetas de `/reportes` mostrarán **"sin datos"** porque
  `kpis_dotacion_snapshot` queda vacía. Esto es producción: **correr los pasos A.1→A.3 seguidos**,
  en una sola ventana de mantenimiento corta, para minimizar ese intervalo. La consulta individual
  (segundo gráfico) no depende de la tabla materializada (calcula en vivo), así que no se ve
  afectada por esta ventana.
- **No hay migración automática contra Neon.** Antes de aplicar, confirmar que **ningún pipeline
  de CI/CD corre `prisma migrate deploy`** automáticamente contra Neon (la migración es manual por
  diseño). Si existiera un deploy automático, coordinarlo para que no aplique esta migración por su
  cuenta y deje la tabla vacía sin backfill.

---

## E. Verificación visual — `http://localhost:5180/reportes` (manual, la hace el USUARIO)

> No hay navegador/headless para el agente, y está prohibido tocar el stack `:5180` del usuario.
> Estos pasos los hace el usuario tras correr §A.

1. **Tarjetas (primer gráfico, `EvolucionDotacionChart`).** Hay **una tarjeta por carrera/código**
   rotulada con el `literal` del código (ej. "Nueva Carrera Prof. Hosp" para 37). Cada mini-gráfico
   muestra la **línea total** destacada + **una línea fina por situación de revista** presente
   (`activo`, `comision`, `retencion de cargo`). El **número grande** = total actual, entero exacto
   (`toLocaleString('es-AR')`, NO `formatK`).

2. **Consulta individual (segundo gráfico, `EvolucionEspecialidadChart`).** Grafica **líneas
   superpuestas (NO apiladas)**: una **TOTAL** destacada + **una por estado** presente + la línea
   **"activos y comisionados"**. El combo **"Carrera"** lista los códigos con su label `literal` y
   submite el código. El bloque "Dotación actual / Variación" usa el total, con sub-cifras por
   estado al corte.

3. **Reconciliación tarjeta ↔ consulta individual.** Para la **misma carrera** (ej.
   «Nueva Carrera Prof. Hosp» = código 37), el **número de la tarjeta** debe **coincidir** con el
   **total de la consulta individual** al mismo corte. Antes variaba entre ambas vistas; ahora, con
   el motor unificado, debe dar el mismo entero (para CPH al corte oct-26: **17591**).

4. **Cifras meta (CPH, corte oct-26).** El total de CPH = **17591**; `activo` = **17445**;
   `retencion de cargo` = **1567**; `comision` = **10**. Coinciden con §B.

Si algún punto no se cumple, anotarlo antes de aprobar.

---

## F. Verificación automatizada ya ejecutada por el agente (gates de código)

- `pnpm --filter @srrhh/api build` → **OK** (FEAT-001/002: tipos + motor backend compilan).
- `pnpm --filter @srrhh/api test` → suite de kpis/dotación **verde** (FEAT-002; los únicos fallos
  son tests `.http` pre-existentes contra una DB real, ajenos a este cambio).
- `pnpm --filter @srrhh/web build` → **OK** (FEAT-003: ambos gráficos compilan con el nuevo shape).
- `cd services/dotaneitor && python -m unittest` → **OK** (FEAT-004: 51 tests, incluido el candado
  `test_situacion_revista_normaliza`).

> Ninguna de estas verificaciones toca Neon ni ejecuta SQL. El re-backfill y la validación de datos
> (§A/§B) son pasos manuales del usuario.
