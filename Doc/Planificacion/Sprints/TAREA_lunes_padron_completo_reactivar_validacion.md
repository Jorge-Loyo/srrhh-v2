# TAREA (lunes) — Cargar padrón completo para reactivar las falsas bajas en `validacion_vacante`

> Programada 2026-10-30 (vie) para ejecutar el **lunes** cuando esté el padrón nuevo.
> Diagnóstico completo en `.agents/tasks/validacion-vacante-25oct/findings.md`.

## Objetivo
Reactivar a `vigente` los ~2.857 cargos que quedaron en `validacion_vacante` como
**falsas bajas** por un padrón del 25-oct que vino **incompleto** (le faltaron cargos
que existían el 18-oct). Al cargar y aprobar un padrón **completo** bien exportado,
la reactivación automática del paso 4 (match por `id_sial` exacto) los devuelve a
`vigente` sin intervención manual.

## Por qué funciona (evidencia, no teoría)
- El 25-oct el diff marcó **2.897 eliminados**, **429 modificados**, **69 nuevos**.
- De esos 2.897 eliminados, **2.857 (98,6%) estaban VIVOS el 18-oct** y reaparecen con
  el **mismo `id_sial_rol` exacto** (verificado contra `padron_historico` del 18-oct).
- NO fue recodificación ni rotación real (eso habría traído ~2.300 `nuevos`, hubo 69).
  Fue un padrón incompleto cuyo `total_registros=49.246` resultó engañoso.
- Como el `id_sial` viejo es idéntico al que reaparece, el paso 4 hace match →
  `aRechazar` → `estado:'vigente'`. (`padron.service.ts:2489-2497` +
  `bajas.validacion.helpers.ts:49`).

## Estado base ANTES de cargar (medición del 30-oct)
- `validacion_vacante` total: **2.905** cargos (todos con `id_sial`).
  - 2.298 entraron el 25-oct, 85 el 28-oct, 522 con `estado_desde` NULL (legacy, aparte).
- Último snapshot aprobado: **25-oct, 49.246 regs** (incompleto).
- NO había snapshots en `pendiente`/`procesando` (libre para subir uno nuevo).

## Guarda de padrón parcial (ya en producción, commit cda46d9)
- La guarda compara contra el último aprobado (25-oct, 49.246). Un padrón completo
  real (~49k) da ratio ~1.0 → **NO bloquea**. No habrá fricción al aprobar.
- `PADRON_RATIO_MINIMO=0.7`. Solo frena padrones chicos (ratio < 0.70).

---

## PROCEDIMIENTO DEL LUNES

### Paso 0 — Reconstruir NEON_DIRECT en la terminal WSL
```bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
NEON_URL=$(grep 'neon.tech' apps/api/.env | sed -E 's/^#\s*//; s/^DATABASE_URL=//; s/^"//; s/"$//')
export NEON_DIRECT=$(echo "$NEON_URL" | sed -E 's/-pooler//; s/:6432/:5432/; s/[?&]channel_binding=require//')
```

### Paso 1 — Snapshot del estado ANTES (para comparar después)
```bash
echo "
SELECT count(*) AS validacion_vacante_antes FROM cargos WHERE estado='validacion_vacante';
SELECT to_char(estado_desde,'YYYY-MM-DD') AS entro, count(*)
FROM cargos WHERE estado='validacion_vacante' GROUP BY 1 ORDER BY 1 DESC NULLS LAST LIMIT 10;
" | docker compose exec -T postgres sh -c "psql '\$NEON_DIRECT' -f -"
```
Esperado: ~2.905 (puede variar si hubo movimientos el fin de semana).

### Paso 2 — Subir el padrón completo por la UI
- Entrar a la app (front Vercel) → módulo Padrón → subir el Excel del padrón nuevo.
- Esperar a que el pipeline termine (estado pasa a `pendiente`). NO aprobar todavía.

### Paso 3 — VERIFICAR el diff ANTES de aprobar (no aprobar a ciegas)
Confirmar que los ~2.857 que faltaban ahora reaparecen (como `modificado`/reactivación),
y que el nuevo padrón NO está marcando otra tanda masiva de eliminados.
```bash
echo "
-- Ultimo snapshot pendiente (el recien subido)
WITH snap AS (
  SELECT id, to_char(fecha_asignada,'YYYY-MM-DD') AS fecha, total_registros, ratio_tamano,
         COALESCE(advertencia_tamano,'(sin advertencia)') AS advertencia
  FROM padron_snapshots WHERE estado='pendiente' ORDER BY created_at DESC LIMIT 1
)
SELECT * FROM snap;

-- Volumen del diff del nuevo snapshot por tipo
SELECT d.tipo, count(*)
FROM padron_diff d
JOIN padron_snapshots s ON s.id=d.snapshot_id
WHERE s.estado='pendiente'
GROUP BY d.tipo ORDER BY count(*) DESC;
" | docker compose exec -T postgres sh -c "psql '\$NEON_DIRECT' -f -"
```
**Criterio de seguridad para aprobar:**
- `total_registros` del nuevo padrón debe ser ~49k o más (completo).
- `ratio_tamano` ~1.0 y SIN `advertencia_tamano` (si hubiera advertencia = vino chico otra vez → NO aprobar, revisar el archivo).
- Los `eliminado` del nuevo diff deben ser **pocos** (bajas reales de la semana),
  NO ~2.800 otra vez. Si vuelve a marcar miles de eliminados, el archivo sigue
  incompleto → NO aprobar.

### Paso 4 — Aprobar (si el Paso 3 pasó el criterio)
- Aprobar el snapshot desde la UI. El paso 4 reactiva los `id_sial` que reaparecen.

### Paso 5 — Verificar el DESPUÉS
```bash
echo "
SELECT count(*) AS validacion_vacante_despues FROM cargos WHERE estado='validacion_vacante';
-- Cuantos de los que entraron el 25-oct volvieron a vigente
SELECT estado, count(*) FROM cargos
WHERE id_sial IS NOT NULL
GROUP BY estado ORDER BY count(*) DESC;
" | docker compose exec -T postgres sh -c "psql '\$NEON_DIRECT' -f -"
```
**Resultado esperado:** `validacion_vacante` baja de ~2.905 a unos ~600 o menos
(quedan los 522 legacy con `estado_desde` NULL + bajas reales + los que no reaparecieron).

### Paso 6 — Los 522 legacy (`estado_desde` NULL) — tratar aparte
NO los toca este proceso salvo que su `id_sial` reaparezca. Son de origen distinto
(pre-migración / escritura directa). Investigar con SQL 4 del findings cuando haya tiempo.

---

## Señales de ALERTA (abortar y avisar)
- El nuevo padrón vuelve a marcar miles de `eliminado` → archivo incompleto otra vez.
- Aparece `advertencia_tamano` / `ratio_tamano` < 0.70 → la guarda detectó padrón chico.
- `validacion_vacante` NO baja tras aprobar → el match por `id_sial` no ocurrió
  (revisar si los id_sial del archivo nuevo difieren de los guardados).

## Causa raíz de fondo (follow-up, fuera de esta tarea)
El diff no distingue "el cargo se fue" de "el cargo faltó en el archivo". Un padrón
incompleto con total engañoso genera falsas bajas masivas. Fix robusto: cruzar por
clave estable (CUIL / clave estructural) además del `id_sial`, o un guard que detecte
una proporción anómala de eliminados en un solo diff (no solo el ratio de tamaño total).
Candidato a sprint. Ver `.agents/tasks/validacion-vacante-25oct/findings.md` §7.6.
