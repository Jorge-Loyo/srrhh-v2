# Validación del árbol SSAPAC contra el Decreto 306/26 + catálogo de cargos de conducción

**Fecha:** 2026-10-02
**Fuentes:**

- `Doc/Referencias/DECRETO 306-26 - Nivel Central.pdf` — norma madre. Art. 6 aprueba
  la estructura del Ministerio de Salud (Anexo XI Organigrama, 15 pág.; Anexo XII
  Responsabilidades, 84 pág.). IF del organigrama: `IF-2026-39515082-GCABA-MSGC`.
- `Doc/Referencias/SSAPAC ESTRUCTURA.pdf` — detalle de la rama Atención Primaria
  (es la pág. 11/15 del Anexo XI).
- `Doc/Referencias/AP y CeSACs.pdf` — Anexo III: localizaciones, niveles y
  denominaciones de los 52 CeSAC (lista oficial 1–51 y 53).
- `Arbol_Salud_20260927.xlsx` — **fuente de verdad semanal** que envía el
  Departamento de Liquidaciones. Se sube tal cual por `/organigrama/upload`; el
  sistema detecta si la estructura sigue igual o cambió. NO se arma a mano.

> **Flujo operativo:** Liquidaciones manda el Excel cada semana. Lo subimos sin
> editar y comparamos contra el estado anterior. Este documento es la referencia
> normativa contra la cual validar que ese Excel está completo y bien clasificado.

---

## 1. Estructura del Ministerio de Salud (Decreto 306/26, Anexo XI)

```
Ministerio de Salud (lvl 1)
├── Auditoría Interna (UAI)
├── DG Legal y Técnica
├── DG Competencias Sanitarias Jurisdiccionales
├── Subsecretaría Administración del Sistema de Salud
│     ├── DG Administración y Desarrollo de RRHH
│     ├── DG Administrativa, Contable y Presupuesto
│     ├── DG Recursos Físicos en Salud
│     └── DG Adquisiciones y Contrataciones de Salud
├── Subsecretaría Atención Hospitalaria
│     ├── DG Hospitales
│     └── DG Salud Mental
├── Subsecretaría SAME (Sistema de Atención Médica de Emergencias)
├── Subsecretaría de Atención Primaria Ambulatoria y Comunitaria (SSAPAC)
│     ├── DG Atención Primaria y Salud Comunitaria
│     └── Departamentos de Área Programática de Salud
└── Subsecretaría Planificación Sanitaria y Gestión en Red
      ├── UPE Transformación Digital en Salud / HCE (Fuera de Nivel - DG)
      ├── DG Coordinación de Redes y Financiamiento en Salud
      ├── DG Sistemas de Información Sanitaria
      ├── DG Cultura / Sistema Público de Salud
      └── DG Docencia, Investigación y Desarrollo Profesional
```

> Nota: las Gerencias/Subgerencias Operativas (GO/SGO) fueron **suprimidas** por el
> Decreto 259/26 a partir del 1-ago-2026. Los nodos GO/SGO que aún aparecen en el
> árbol cargado son remanentes en extinción.

### Jerarquía de la rama SSAPAC (Anexo XI pág. 11)

```
Subsecretaría SSAPAC
└── Departamento de Área Programática de Salud (**)   — uno por Área Programática
      ├── División Programas y Centros de Salud (**)   — (2) 13 cargos
      │     ├── Sección Salud Escolar (**)             — (3) 13 cargos
      │     └── Unidad → CeSAC (**)                    — nivel por Anexo V Dto 311/22
      │           └── (Sección)                        — solo en CeSAC con "UNIDAD*"
      ├── División CEMAR I / II / III / IV (**)
      │     └── Sección CEMAR III / IV (**)
      └── Unidad Centro Odontológico Infantil N° 1 / N° 2 (**)
```

`(**)` = cargos a ocupar por **Carrera Profesional de la Salud**.

---

## 2. Validación del árbol cargado (resultado)

Verificado contra la BD tras subir `Arbol_Salud_20260927.xlsx` (sigla `SSAPAC`,
108 nodos). Comparado 1 a 1 contra el PDF "AP y CeSACs".

### 2.1 CeSAC — COMPLETO ✅

- El decreto define **52 CeSAC**: numerados **1–51 y 53** (el **N° 52 no existe**
  en la norma — la lista oficial salta de 51 a 53, confirmado en el PDF).
- La BD tiene exactamente esos **52 CeSAC** como tipo `UNID`. No falta ninguno y no
  sobra ninguno.

### 2.2 CeSAC con Sección dependiente

El PDF marca con `UNIDAD*` ("de la Jefatura Unidad depende una Jefatura Sección")
a: **CeSAC 3, 4, 5, 7, 15**. En la BD, esos 5 tienen una Sección hija ✅. Además la
BD tiene Secciones asistenciales bajo **CeSAC 6 y 14** ("SECC Asistencial" / "A" /
"B"), que el PDF no marca con asterisco — son secciones asistenciales reales, no un
error (criterio distinto del asterisco).

### 2.3 Áreas Programáticas

El PDF lista las AP por hospital de referencia (Álvarez, Argerich, Durand,
Fernández, Grierson, Penna, Piñero, Pirovano, Ramos Mejía, Santojanni, Tornú, Vélez
Sarsfield, Zubizarreta). En la BD hay **13 Departamentos de Área Programática de
Salud** (tipo `DEPT`, lvl 3) colgando de SSAPAC — coincide con el conteo esperado.

### 2.4 CEMAR y Centros Odontológicos — presentes ✅

- CEMAR I (`40011210`), II (`40011220`), III (`40011211`), IV (`40011230`) como `DIV`.
- Secciones CEMAR III (`40010202`) y IV (`40011231`).
- Centros Odontológicos Infantiles N° 1 (`40011013`) y N° 2 (`40011014`) como `UNID`.

### 2.5 Los 4 códigos que no subían — RESUELTO (bug de backend, no del Excel)

`40011230` (DIV CEMAR IV), `40011231` (SECC CEMAR IV), `40222175` (CeSAC 53),
`40224905` (CeSAC 51) caían como "repartición nueva sin REGIMEN EMPLEO". No era el
Excel: era un bug de regresión en `canonUniverso` (comparaba el universo contra
MAYÚSCULAS cuando `normalizarTexto` pasó a devolver minúscula en A21-8/11), que
rompía la inferencia `sigla|universo|tipo`. Corregido — los 4 ahora resuelven solos
a universo `ATENCION PRIMARIA` + régimen `Carrera de Profesionales de la Salud`.

### 2.6 Observaciones menores (no bloqueantes)

- `CeSAC N° 50` (`40011012`) cuelga del primer DEPT Área Programática de forma
  directa; en el PDF figura bajo "AP - VÉLEZ SARSFIELD". Revisar la asignación de
  Área si importa el agrupamiento por hospital de referencia.
- 3 nodos del árbol global (fuera de SSAPAC) tienen régimen
  `fuera de norma - dejar pendiente` — quedan para curaduría aparte.

---

## 3. Catálogo de cargos de conducción (regla tipo de unidad → cargo → régimen)

### 3.1 Cómo se resuelve HOY en el código

La relación "unidad del organigrama → cargo de conducción que la encabeza" **no**
se deriva del `tipo` del nodo, sino del lado de **Cargos** (padrón), en
`esCargoDeConduccion()` (`organigrama.service.ts`), cruzando:

| codigoRegistro | regla de conducción (unificador_puesto) | régimen asociado |
| --- | --- | --- |
| `25` | `autoridades superiores` | Autoridades Superiores |
| `60` | `gerente` / `subgerente` | Régimen Gerencial |
| `37` | `director/a medico/a`, `subdirector/a medico/a` (sin jefatura) **o** `cph de planta/guardia`, `jefe/a de departamento/division/unidad/seccion` **con** `codigo_jefaturas` ≠ 0 | Carrera de Profesionales de la Salud / Dirección Médica |
| `83` / `85` / `87` | `administrativo/a`, `enfermero/a`, `servicios generales`, `tecnico/a de la salud` **con** `codigo_jefaturas` ≠ 0 | Escalafón General / Enfermería / Técnicos / Serv. Generales |

El `codigo_jefaturas` (JCAT) distingue el **nivel** de la jefatura (depto/división/
unidad/sección) — es lo que el Sprint 22 mapea a `cargo_jefatura` vía la tabla
`jcat_cargo_jefatura`.

### 3.2 Mapa tipo de nodo (organigrama) → cargo de conducción esperado

Derivado del Anexo XI + `jcat_cargo_jefatura`. Sirve para validar que el cargo de
conducción asignado a cada nodo tenga el nivel correcto:

| tipo nodo | cargo de conducción | nivel JCAT (familias P/G/Z) |
| --- | --- | --- |
| Ministerio | Ministro | Autoridad Superior |
| SSEC/DIREJE | Subsecretario / Director Ejecutivo | Autoridad Superior |
| DG / F/N DG | Director General | Autoridad Superior / Régimen Gerencial |
| DHOS | Director (de Hospital) | Dirección Médica |
| SDHOS | Subdirector (de Hospital) | Dirección Médica |
| DEPT | Jefe de Departamento | jefatura |
| DIV | Jefe de División | jefatura |
| UNID | Jefe de Unidad | jefatura |
| SECCION | Jefe de Sección | jefatura |
| GO / SGO | (en extinción, Dto 259/26) | — |

> Sufijo `CA` (DEPT CA, DIV CA, SECCION CA): misma jerarquía pero rama de **Carrera
> Administrativa / Escalafón General** en vez de Carrera Profesional de la Salud.

### 3.3 Regímenes de empleo en uso (BD, árbol completo)

| régimen | nodos |
| --- | --- |
| Carrera de Profesionales de la Salud | 2270 |
| Carrera de Enfermería | 907 |
| Escalafón General / Carrera Administrativa | 463 |
| Carrera de Técnicos de la Salud | 399 |
| Régimen Gerencial / Escalafón General / Carrera Administrativa | 151 |
| Autoridades Superiores | 41 |
| Dirección Médica | 38 |
| Régimen Gerencial / Carrera de Enfermería | 30 |
| Régimen Gerencial / Carrera de Profesionales de la Salud | 3 |
| fuera de norma - dejar pendiente | 3 |
| Director Docente | 1 |

---

## 4. Conclusión

- **El árbol SSAPAC cargado está completo y bien clasificado** respecto del Decreto
  306/26: los 52 CeSAC, los 4 CEMAR, los 2 Centros Odontológicos y los 13
  Departamentos de Área Programática están presentes con el tipo correcto.
- **No falta el CeSAC 52**: no existe en la norma.
- El único problema real era el **bug de inferencia de régimen** (ya corregido), no
  un faltante de datos.
- El **catálogo de cargos de conducción** ya está implementado en
  `esCargoDeConduccion()` + `jcat_cargo_jefatura` (Sprint 22). El mapa de la sección
  3.2 es la referencia para validar el nivel del cargo contra el tipo de nodo.

### Pendientes sugeridos (no urgentes)

1. Revisar la pertenencia de `CeSAC N° 50` al Área Programática correcta (§2.6).
2. Resolver los 3 nodos `fuera de norma - dejar pendiente`.
3. Opcional: agregar un chequeo automático post-upload que compare el árbol subido
   contra esta referencia normativa y liste altas/bajas/reclasificaciones de CeSAC.
