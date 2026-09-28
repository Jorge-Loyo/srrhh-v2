# SPRINT 22 — Dotaneitor v2: reescritura lineal (dotación + tablas, contra catálogo)

**Estado:** 📋 Planificado
**Autores:** Jorge (backend Node + Python)
**Depende de:** Sprint 20 ✅ (catálogo `puestos_cargo`/`especialidades_puesto` consolidado, `Cargo.puestoCargoId`/`especialidadPuestoId`, `migrate reset`, política de "sin match" definida del lado Node), Sprint 21 ✅ (consumidores secundarios migrados, `revisado` en catálogos)

> ⚠️ **Cambio de enfoque (decisión del taller 2026-09-28):** este sprint deja de ser un _refactor
> incremental_ del Dotaneitor viejo y pasa a ser una **reescritura lineal desde cero**. Ver
> `Doc/Referencias/DOTANEITOR_DECISIONES.md`. Se conservan **solo las funciones de negocio probadas**
> (normalización de texto, reglas de limpieza de puesto/especialidad, detección de duplicados/
> jefaturas); se **elimina** todo lo demás.

---

## Objetivo

Reescribir el microservicio `services/dotaneitor/` como un **pipeline lineal simple** que hace
**exactamente dos cosas** y nada más:

1. **Genera el Excel de dotación** (el resultado procesado).
2. **Entrega los datos para llenar las tablas del sistema** (lo que consume Node para consolidar).

Todo lo que **no** sea eso se elimina.

### Flujo lineal (reemplaza el modelo actual de sesión + jobs)

```
recibe Excel  →  limpia/normaliza (minúscula, sin tilde)  →  resuelve carrera/puesto/especialidad
contra el catálogo  →  [genera Excel de dotación]  +  [entrega datos para las tablas]  →  FIN
```

- **Un solo paso de punta a punta.** Sin `/session`, sin `/normalizar`+`/procesar`+`/cruzar`
  separados, sin `/preview` paginado, sin `/job` con polling, sin estado `sessions{}` en memoria.
- El frontend `/padron` sigue igual para el usuario: sube el archivo, y **antes de aprobar ve el
  diff** (cargos nuevos/modificados/eliminados) y evalúa las acciones — **eso se conserva**. Lo que
  cambia es la plomería interna, no la experiencia de revisión/aprobación.

## Qué se ELIMINA (ya no es responsabilidad del Dotaneitor)

- **Reporte de calidad en Excel** (las 4 hojas: Resumen, Detalle, Completitud). El único Excel que
  genera el Dotaneitor es el de **dotación**.
- Endpoints `/reporte-calidad`, `/descargar`, `/exports/*`, `/preview`, `/job`, `/session`,
  `/session/delete`, `/normalizar`, `/procesar`, `/cruzar` — se colapsan en el flujo lineal.
- Estado en memoria (`sessions{}`), jobs con `Thread`, parquet temporal, relecturas del Excel.
- Cualquier proceso que no sea generar dotación + entregar datos para las tablas.

> **Importante — los problemas se siguen detectando, solo cambia el canal.** Eliminar el _Excel_
> de reporte de calidad NO significa dejar de detectar literales sin catalogar, jefaturas
> duplicadas, etc. Esos casos siguen vivos: se marcan con el flag `revisado=false` en el catálogo
> (A22-3) y/o se reflejan en el **diff** que el usuario revisa en `/padron` antes de aprobar. La
> pantalla de aprobación con el detalle de acciones de cada cargo **se conserva**.

## Qué se CONSERVA (funciones de negocio probadas — se copian, no se reinventan)

- Normalización de texto: reparar mojibake, fechas, teléfonos, formato de nombres.
- Reglas de limpieza de literal puesto y especialidad (las tablas `Ref*` / vinculaciones).
- Detección de duplicados de ID SIAL y de jefaturas duplicadas.
- Regla afinada de JEFE ESCALAFON + mapeo JCAT → cargo de jefatura (familias P/G/Z).

## Tareas

| #      | Tarea                                                                                                                                                                                                                                                                                    | Dev   | Est. | Prioridad | Estado |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- | --------- | ------ |
| S22-1  | **Esqueleto del pipeline lineal**: un único endpoint (ej. `POST /procesar-padron`) que recibe el Excel y ejecuta limpieza → resolución → salida en un solo flujo síncrono/tarea. Sin `sessions{}`, sin jobs, sin `/preview`.                                                             | Jorge | 4h   | 🔴        | 📋     |
| S22-2  | **Portar funciones de negocio probadas** (copiar tal cual, no reinventar): normalización (mojibake/fechas/teléfonos/nombres), limpieza de puesto/especialidad, dedup ID SIAL (versión vectorizada), jefaturas duplicadas.                                                                | Jorge | 4h   | 🔴        | 📋     |
| S22-3  | **Normalización total minúscula + sin tilde** en todo el texto de salida; nombres de columna en snake_case sin tilde/espacios (arreglar `documentacion_pou`, `antiguedad`). Reemplaza `_forzar_mayusculas`. (ver A22-1)                                                                  | Jorge | 2h   | 🔴        | 📋     |
| S22-4  | **Cargar catálogo** `puestos_cargo`/`especialidades_puesto` en el arranque (mismo patrón que las `Ref*`).                                                                                                                                                                                | Jorge | 2h   | 🔴        | 📋     |
| S22-5  | **Resolución contra catálogo**: carrera por código de registro → `escalafonId`; literal puesto → `puestoCargoId`; especialidad → `especialidadPuestoId` (con regla del paréntesis, A22-2). `LOWER(TRIM())` en ambos lados.                                                               | Jorge | 4h   | 🔴        | 📋     |
| S22-6  | **Política "sin match" con auto-alta revisable** (A22-3): literal/especialidad sin match → alta en catálogo con `revisado=false`, se usa ese id, y el caso se refleja en el diff que ve el usuario. El padrón **no se frena**.                                                           | Jorge | 3h   | 🔴        | 📋     |
| S22-7  | **Conservar texto crudo de origen** (A22-4): guardar `literal_puesto_origen`/equivalente además del id resuelto, para auditoría/reversibilidad.                                                                                                                                          | Jorge | 1h   | 🟡        | 📋     |
| S22-8  | **Salida del pipeline**: (a) Excel de dotación; (b) dataset con `puesto_cargo_id`/`especialidad_puesto_id`/`puesto_sin_catalogar`/`cargo_jefatura` + campos para las tablas, que Node consume para el diff y la consolidación.                                                           | Jorge | 3h   | 🔴        | 📋     |
| S22-9  | **Backend Node** (`padron.service.ts`): adaptar el consumo al nuevo flujo lineal (una llamada, sin polling); consumir los ids resueltos por Python (reemplaza la resolución de S20-6, que queda como fallback de validación).                                                            | Jorge | 4h   | 🔴        | 📋     |
| S22-10 | **Tabla `jcat_cargo_jefatura`** (`jcat` → nivel/cargo + escalafón) + seed con el mapeo verificado (familias P/G/Z, ver `Doc/Referencias/DOTANEITOR_DECISIONES.md §2.2`). En tabla, no hardcode.                                                                                          | Jorge | 2h   | 🔴        | 📋     |
| S22-11 | **Paso JCAT → cargo de jefatura** en el pipeline (tras JEFE ESCALAFON); JCAT sin mapeo → nivel `null`, se refleja en el diff, no frena. Agregar la columna a la salida.                                                                                                                  | Jorge | 3h   | 🔴        | 📋     |
| S22-12 | **Persistir cargo de jefatura** en el cargo (FK a `puestos_cargo` de conducción, o texto — ver Opción A/B en el doc de decisiones §2.2) y reflejarlo en el rol. Migración + consumo en Node. Prerequisito Opción B: seed jefaturas no médicas + `Sub-Director`→conducción.               | Jorge | 4h   | 🟡        | 📋     |
| S22-13 | **Actualizar `README.md`** del Dotaneitor al flujo lineal real (quitar `/diff`/`/guardar-bd`/sesiones/jobs; documentar el único endpoint y las columnas de salida).                                                                                                                      | Jorge | 1h   | 🟢        | 📋     |
| S22-14 | **Verificación e2e**: subir un padrón real (o fixture) por `/padron`, confirmar que se genera el Excel de dotación, que el diff muestra las acciones de cada cargo, que se pueden evaluar antes de aprobar, y que un puesto sin catalogar cae con `revisado=false` sin romper el import. | Jorge | 3h   | 🔴        | 📋     |

**Total estimado:** ~40h

## Dependencias entre tareas

```
S22-1 (esqueleto) ──► S22-2 (portar negocio) ──► S22-3 (normalización)
S22-4 (catálogo) ──► S22-5 (resolución) ──► S22-6 (sin match) ──► S22-7 (crudo)
(S22-3 + S22-5 + S22-6) ──► S22-8 (salida) ──► S22-9 (Node)
S22-10 ──► S22-11 ──► S22-12   (JCAT → jefatura)
(S22-8 + S22-9 + S22-11) ──► S22-14 (e2e)
S22-13 independiente (doc)
```

## Criterio de éxito

- [ ] El Dotaneitor es un **pipeline lineal**: una sola llamada de punta a punta, sin sesiones,
      jobs ni preview paginado.
- [ ] Genera **únicamente** el Excel de dotación (no el reporte de calidad ni otros exports).
- [ ] Resuelve `puestoCargoId`/`especialidadPuestoId` contra el catálogo; carrera por código de registro.
- [ ] Todo el texto sale en **minúscula y sin tilde**; nombres de columna en snake_case (sin
      `documentacion_pou` / diéresis).
- [ ] Un literal/especialidad sin match cae con `revisado=false` sin frenar el import, y es visible
      al revisar el diff antes de aprobar.
- [ ] En `/padron` el usuario **sigue pudiendo evaluar las acciones de cada cargo y ver el diff
      antes de aprobar** (experiencia de revisión conservada).
- [ ] El JCAT se resuelve a cargo de jefatura (P/G/Z) contra `jcat_cargo_jefatura`, se persiste, y
      un JCAT sin mapeo cae sin frenar.
- [ ] `README.md` refleja el flujo lineal real.

## Notas

- **Reescritura, no refactor:** el flujo principal (orquestador, manejo de estado) se rehace lineal;
  las funciones de negocio probadas se **copian** para no re-validar lógica que ya funciona.
- Las tablas `Ref*` de corrección texto→texto se conservan como primera pasada de limpieza (igual
  que antes) — lo que cambia es que después el pipeline resuelve contra el catálogo.
- El **diff y la pantalla de aprobación** en `/padron` los maneja Node y **no son parte de lo que se
  elimina** — el Dotaneitor entrega el dataset, Node arma el diff que el usuario revisa.
- **KPI mensual:** NO entra en este sprint — sprint futuro propio (backend + tabla de corte mensual).
- Referencia de decisiones: `Doc/Referencias/DOTANEITOR_DECISIONES.md`.
