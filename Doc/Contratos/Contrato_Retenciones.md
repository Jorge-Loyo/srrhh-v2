# Contrato — Retenciones, Cadenas de Conducción y Comisiones

> Fuente de verdad para el modelo de retención de cargos, cadenas de conducción,
> cargos remplazantes (R y TTR), vencimientos de período y comisiones.
> Todo código que cree o modifique ocupaciones con situación de revista
> distinta de "Activo" debe respetar estas reglas.

---

## 1. Conceptos base

### 1.1 Tipos de cargo por modalidad

El prefijo del código de cargo identifica el escalafón y la modalidad:

| Prefijo | Tipo | Modalidad |
|---------|------|-----------|
| `CPH-POF` | Médico | Planta de Oficio Fija (planta permanente) |
| `CPH-POU` | Médico | Planta de Oficio Universitaria / Guardia |
| `CPH-J-POF` / `CPH-J-POU` | Médico | Jefatura (conducción) |
| `CPH-D` / `CPH-SD` | Médico | Director / Sub Director (conducción) |
| `ENF` | Enfermería | Planta |
| `TEC-POF` / `TEC-POU` | Técnico | Planta fija / Guardia |
| `EG` / `EG-J` / `EG-D` / `EG-G` | Escalafón General | Ejecución / Conducción |
| `RG-CG` | Régimen Gerencial | Conducción |

**Ejecución**: `CPH-POF`, `CPH-POU`, `ENF`, `TEC-POF`, `TEC-POU`, `EG`
**Conducción**: `CPH-J-*`, `CPH-D`, `CPH-SD`, `EG-J`, `EG-D`, `EG-G`, `RG-CG`

> Una persona de guardia (`CPH-POU`) puede postularse a un cargo de planta
> (`CPH-POF`) y viceversa. La modalidad no restringe la postulación.

---

### 1.2 Cargo base

El **cargo base** de una persona es el primer cargo de la cadena — el que no
retiene a ningún otro. Es el cargo al que la persona vuelve cuando cesa en
todos los cargos superiores.

**Reglas:**
- Toda persona tiene exactamente un cargo base.
- El cargo base puede ser de ejecución o de conducción (personas que ingresaron
  con cargo de conducción por ley anterior tienen cargo base de conducción).
- El cargo base de conducción tiene período fijo igual que cualquier otro cargo
  de conducción.
- El cargo base **nunca** tiene `cargoRetenidoId` — es el origen de la cadena.

---

## 2. Retención de cargo

### 2.1 Definición

Una persona **retiene** un cargo cuando gana un concurso para otro cargo de
mayor jerarquía pero no cesa en el cargo de origen. El cargo de origen queda
con `situacionRevista = 'Retencion de Cargo'` — sigue ocupado, no genera
vacante directa.

Para cubrir el hueco funcional que deja la persona retenida, el sistema genera
automáticamente un **cargo remplazante** (R o TTR según el tipo) que sí puede
tener concurso.

### 2.2 Reglas según tipo de cargo retenido

#### Caso A — Retención de cargo de EJECUCIÓN

| Condición | Resultado |
|-----------|-----------|
| Persona en cargo de ejecución gana concurso para otro cargo | Retiene el cargo de ejecución |
| Se genera cargo remplazante | Código: `{prefijo}-R-{seq}` |
| El cargo R puede tener concurso normal | Sí |
| El cargo R genera baja cuando su ocupante cesa | No — ver §2.4 |
| El cargo R genera concurso cuando su ocupante cesa | No — ver §2.4 |

**Código del cargo remplazante de ejecución:**
```
{mismo prefijo que el cargo retenido}-R-{seq 6 dígitos}
Ejemplo: CPH-POF-R-000001
```

#### Caso B — Retención de cargo de CONDUCCIÓN

| Condición | Resultado |
|-----------|-----------|
| Persona en cargo de conducción gana concurso para otro cargo de conducción | Retiene el cargo de conducción |
| Se genera cargo remplazante | Código: `{prefijo}-TTR-{seq}` (Titular Transitorio por Reemplazo) |
| El cargo TTR puede tener concurso normal | Sí |
| El cargo TTR tiene período fijo | Sí — mismo período que el cargo de conducción original |

**Código del cargo remplazante de conducción:**
```
{mismo prefijo que el cargo retenido}-TTR-{seq 6 dígitos}
Ejemplo: CPH-J-POF-TTR-000001
```

### 2.3 Ejecución → Ejecución: NO retiene

Si una persona en cargo de ejecución gana **otro cargo de ejecución**:
- **Cesa** en el cargo anterior — no retiene
- No se genera cargo remplazante
- El cargo anterior queda vacante y puede generar concurso normal

> Regla: una persona no puede tener dos cargos de ejecución simultáneos.

### 2.4 Ciclo de vida del cargo remplazante de ejecución (R)

El cargo R tiene un ciclo de vida especial — **no sigue las reglas normales
de baja**:

| Evento | Comportamiento |
|--------|---------------|
| Ocupante del R renuncia / jubila / muere | El cargo R queda vacante. NO genera baja formal. NO genera concurso. SGRASV gestiona manualmente. |
| Titular (persona retenida) vuelve a su cargo base | El cargo R sigue existiendo. El hospital pasa de N a N+1 cargos. |
| Titular cesa definitivamente (renuncia / jubila / muere) | El ocupante del R pasa al cargo titular (planta fija) SIN concurso. El cargo R pasa a `no_vigente`. |

> **Impacto en dotación**: mientras el titular esté retenido, el hospital tiene
> un cargo extra (el R). Esto es intencional y correcto — no es un error de
> conteo.

### 2.5 Generación automática del cargo remplazante

Cuando SGRASV registra una retención (cambia `situacionRevista` a
`'Retencion de Cargo'`), el sistema debe:

1. Detectar si el cargo retenido es de ejecución o conducción.
2. Generar automáticamente el cargo remplazante con el código correcto
   (R o TTR).
3. Vincular el cargo remplazante al cargo retenido mediante
   `cargoRetenidoId` (FK en `cargos`).
4. Dejar el cargo remplazante en estado `vigente + vacante` listo para
   concurso.
5. Registrar en `ocupaciones` el cambio de `situacionRevista` con
   `sr_doc_respaldo` obligatorio.

---

## 3. Cadena de retención (conducción)

### 3.1 Estructura

Una persona puede retener múltiples cargos a lo largo de su carrera. La cadena
no tiene límite de niveles:

```
Cargo base (E1 o C1)
  └─ retenido por → Cargo C2 (TTR)
       └─ retenido por → Cargo C3 (TTR)
            └─ retenido por → Cargo C4 (TTR)
                 └─ ... (sin límite)
```

Cada cargo de la cadena tiene:
- `cargoRetenidoId` → apunta al cargo que retiene (el anterior en la cadena)
- `cargoBaseId` → apunta directamente al cargo base (para trazabilidad rápida)

### 3.2 Baja en cascada

Cuando un cargo de conducción se da de baja, se produce el **efecto dominó**:

```
C4 se da de baja
  → persona vuelve a C3 (su cargo retenido)
  → C3 se da de baja (o vence su período)
       → persona vuelve a C2
            → C2 se da de baja
                 → persona vuelve a C1 (o E1 si es el base)
                      → C1 se da de baja
                           → baja definitiva de la persona
```

**Reglas de la cascada:**
- Cada paso de la cascada es un acto administrativo separado que SGRASV
  debe registrar.
- El sistema debe mostrar la cadena completa antes de confirmar una baja
  de conducción — alerta visual con todos los cargos afectados.
- La cascada no es automática — SGRASV la ejecuta paso a paso con
  documentación respaldatoria en cada nivel.
- Si en algún nivel el cargo ya venció su período, ese nivel se salta
  (la persona ya no tiene derecho a volver a ese cargo).

### 3.3 Trazabilidad del cargo base

Para poder trazar el efecto dominó rápidamente, cada cargo de la cadena
almacena una referencia directa al cargo base:

```
C4.cargoBaseId → E1 (o C1 si el base es de conducción)
C3.cargoBaseId → E1
C2.cargoBaseId → E1
```

Esto permite consultar "todos los cargos de la cadena de esta persona" con
una sola query por `cargoBaseId`.

---

## 4. Períodos de conducción

### 4.1 Duración

Los cargos de conducción tienen un período fijo definido al momento de la
designación. El período mínimo es de 4 años; puede ser mayor según el acto
administrativo.

| Campo | Descripción |
|-------|-------------|
| `periodoDesde` | Fecha de inicio del período |
| `periodoHasta` | Fecha de vencimiento del período |
| `periodoRenovado` | Boolean — si fue renovado al menos una vez |
| `fechaRenovacion` | Fecha de la última renovación |

### 4.2 Vencimiento

Al vencer el período:
- Si **no se solicita renovación**: se inicia la cascada automáticamente
  (ver §3.2).
- Si **se solicita renovación**: SGRASV registra la renovación y se extiende
  el período.

### 4.3 Notificaciones previas al vencimiento

El sistema debe notificar al rol SGRASV con anticipación:

| Anticipación | Tipo de alerta |
|-------------|----------------|
| 90 días antes | Notificación en sistema + vista de vencimientos próximos |
| 30 días antes | Segunda notificación (recordatorio) |
| Día del vencimiento | Alerta crítica — acción requerida |

### 4.4 Vista de vencimientos próximos

SGRASV debe tener una interfaz dedicada que muestre:
- Todos los cargos de conducción con período activo
- Días restantes hasta el vencimiento
- Estado: `vigente` / `por vencer (≤90 días)` / `por vencer (≤30 días)` /
  `vencido sin acción`
- Cadena completa del cargo (quién retiene a quién)
- Acciones disponibles: Renovar / Iniciar cascada

---

## 5. Comisión de servicios

### 5.1 Definición

Una persona **comisionada** pertenece a un hospital de origen pero presta
servicios temporalmente en otro hospital (hospital de destino).

| Campo | Descripción |
|-------|-------------|
| `situacionRevista` | `'Comision'` |
| `comision` | Descripción del motivo / tipo de comisión |
| `repaComision` | Hospital / repartición de destino |
| `cr_comentario` | Observaciones adicionales |

### 5.2 Reglas

- El cargo de origen sigue **OCUPADO** — no genera vacante, no genera
  remplazante.
- La comisión **no tiene fecha de vencimiento definida en el sistema** — el
  sistema se entera del fin de la comisión cuando Meta4 actualiza el archivo
  semanal y la situación de revista vuelve a `'Activo'`.
- No requiere acto administrativo en el sistema para iniciarse — llega
  desde Meta4.
- SGRASV puede registrar manualmente el inicio de una comisión antes de que
  llegue el archivo semanal (mismo patrón que bajas en trámite).

### 5.3 Diferencia con retención

| | Retención | Comisión |
|-|-----------|----------|
| Genera cargo remplazante | Sí (R o TTR) | No |
| Genera vacante | No | No |
| Puede iniciar concurso | Sí (sobre el R/TTR) | No |
| Tiene período definido | Sí (conducción) | No |
| Origen del dato | Sistema + Meta4 | Meta4 (o registro manual previo) |
| Hospital de destino | Mismo hospital (otro cargo) | Otro hospital |

---

## 6. Modelo de datos — cambios requeridos

### 6.1 Tabla `cargos` — campos nuevos

```prisma
model Cargo {
  // ... campos existentes ...

  // Retención y cadena
  tipoOrigen         String?   @map("tipo_origen") @db.VarChar(10)
  // 'R' = remplazante de ejecución, 'TTR' = remplazante de conducción,
  // null = cargo normal (no es remplazante)

  cargoRetenidoId    String?   @map("cargo_retenido_id") @db.Uuid
  // FK al cargo que este cargo está remplazando (el retenido)
  // null si no es un cargo remplazante

  cargoBaseId        String?   @map("cargo_base_id") @db.Uuid
  // FK al cargo base de la cadena (para trazabilidad rápida)
  // null si este cargo ES el cargo base

  // Período de conducción
  periodoDesde       DateTime? @map("periodo_desde") @db.Date
  periodoHasta       DateTime? @map("periodo_hasta") @db.Date
  periodoRenovado    Boolean   @default(false) @map("periodo_renovado")
  fechaRenovacion    DateTime? @map("fecha_renovacion") @db.Date

  // Relaciones
  cargoRetenido      Cargo?    @relation("CargoRemplazante", fields: [cargoRetenidoId], references: [id])
  remplazantes       Cargo[]   @relation("CargoRemplazante")
  cargoBase          Cargo?    @relation("CadenaCargo", fields: [cargoBaseId], references: [id])
  cadena             Cargo[]   @relation("CadenaCargo")
}
```

### 6.2 Tabla `ocupaciones` — campos existentes relevantes

Estos campos ya existen y se usan para retención y comisión:

| Campo | Uso |
|-------|-----|
| `situacionRevista` | `'Activo'` / `'Retencion de Cargo'` / `'Comision'` |
| `srDocRespaldo` | Documento que avala la retención (obligatorio) |
| `srComentario` | Observaciones de retención |
| `comision` | Descripción de la comisión |
| `repaComision` | Hospital/repartición de destino en comisión |
| `crComentario` | Comentarios de comisión |

### 6.3 Índices requeridos

```sql
-- Para consultar toda la cadena de un cargo base
CREATE INDEX idx_cargos_cargo_base_id ON cargos (cargo_base_id);

-- Para consultar el remplazante de un cargo retenido
CREATE INDEX idx_cargos_cargo_retenido_id ON cargos (cargo_retenido_id);

-- Para alertas de vencimiento
CREATE INDEX idx_cargos_periodo_hasta ON cargos (periodo_hasta)
  WHERE periodo_hasta IS NOT NULL AND estado = 'vigente';
```

---

## 7. Árbol de estados extendido

```
CARGO
├── NO VIGENTE  (terminal)
│
├── VALIDACION_VACANTE  (intermedio — solo desde padrón)
│
└── VIGENTE
    ├── VACANTE  (condición derivada)
    │   ├── Sin concurso
    │   ├── Con concurso abierto (normal)
    │   └── Cargo R/TTR vacante — sin concurso, gestión manual SGRASV
    │
    └── OCUPADO  (condición derivada)
        ├── situacionRevista: Activo
        │   ├── Cargo normal
        │   ├── Cargo R (remplazante de ejecución)
        │   └── Cargo TTR (remplazante de conducción, con período)
        │
        ├── situacionRevista: Retencion de Cargo
        │   ├── Cargo de ejecución retenido → genera cargo R
        │   └── Cargo de conducción retenido → genera cargo TTR
        │       └── Tiene período → notificación 90/30 días antes
        │
        └── situacionRevista: Comision
            └── Prestado a otro hospital — sin remplazante
```

---

## 8. Reglas de negocio — resumen

| Regla | Descripción |
|-------|-------------|
| R-01 | Una persona no puede tener dos cargos de ejecución simultáneos. Si gana otro de ejecución, cesa en el anterior. |
| R-02 | Una persona puede retener un cargo de ejecución al ganar uno de conducción. |
| R-03 | Una persona puede retener un cargo de conducción al ganar otro de conducción. |
| R-04 | La cadena de retención no tiene límite de niveles. |
| R-05 | Al registrar una retención, el sistema genera automáticamente el cargo R o TTR. |
| R-06 | El cargo R no genera baja formal ni concurso cuando su ocupante cesa. |
| R-07 | Cuando el titular de un cargo R cesa definitivamente, el ocupante del R pasa al cargo titular sin concurso. El cargo R pasa a `no_vigente`. |
| R-08 | La baja de un cargo de conducción dispara la cascada hacia el cargo base. |
| R-09 | La cascada no es automática — SGRASV la ejecuta paso a paso con documentación. |
| R-10 | El sistema debe mostrar la cadena completa antes de confirmar una baja de conducción. |
| R-11 | Los cargos de conducción tienen período fijo. Sin renovación, inician la cascada al vencer. |
| R-12 | SGRASV recibe notificación 90 y 30 días antes del vencimiento de un período de conducción. |
| R-13 | La comisión no genera remplazante ni vacante. El cargo de origen sigue ocupado. |
| R-14 | El fin de una comisión llega desde Meta4 — el sistema lo detecta cuando `situacionRevista` vuelve a `'Activo'` en el archivo semanal. |
| R-15 | El cargo base de una persona puede ser de ejecución o de conducción (ley anterior). |
| R-16 | `cargoBaseId` en cada cargo de la cadena apunta directamente al cargo base para trazabilidad rápida. |

---

## 9. Flujos a implementar (backlog)

| # | Flujo | Prioridad |
|---|-------|-----------|
| F-01 | Registrar retención: cambiar `situacionRevista`, generar cargo R/TTR automáticamente, vincular cadena | 🔴 |
| F-02 | Vista de cadena de retención por persona — árbol visual de todos los cargos vinculados | 🔴 |
| F-03 | Baja en cascada: mostrar cadena completa, ejecutar paso a paso con documentación | 🔴 |
| F-04 | Vista de vencimientos de conducción: tabla con días restantes, filtros, acciones | 🔴 |
| F-05 | Notificaciones automáticas 90/30 días antes del vencimiento | 🟡 |
| F-06 | Renovación de período de conducción | 🟡 |
| F-07 | Paso de ocupante R al cargo titular cuando el titular cesa | 🔴 |
| F-08 | Registrar comisión manualmente (antes de que llegue Meta4) | 🟡 |
| F-09 | Detectar fin de comisión desde archivo semanal Meta4 | 🟡 |
| F-10 | Alerta al aprobar baja de conducción: mostrar cargos en cascada afectados | 🔴 |

---

## 10. Notas de implementación

- **`tipoOrigen`** en `cargos` (`'R'` / `'TTR'` / `null`) permite filtrar
  rápidamente los cargos remplazantes en listados y reportes de dotación.
  Los cargos R/TTR se cuentan en dotación pero se identifican visualmente
  con un badge diferenciado.

- **Dotación real vs dotación estructural**: un hospital con N cargos de
  planta más M cargos R activos tiene N+M cargos en dotación. Esto es
  correcto y esperado. Los reportes deben poder mostrar ambas cifras por
  separado.

- **`cargoBaseId` desnormalizado**: se guarda en cada nodo de la cadena
  para evitar recorrer el árbol en cada consulta. Se actualiza al crear
  el cargo remplazante (se copia el `cargoBaseId` del cargo retenido, o
  el `id` del cargo retenido si ese es el base).

- **Generación de código R/TTR**: usa el mismo mecanismo de
  `maxSecuencialCargo()` pero con el prefijo extendido
  (`CPH-POF-R`, `CPH-J-POF-TTR`, etc.). El `prefijoDeCargo()` en
  `codigoCargo.ts` debe extenderse para soportar estos prefijos.

- **Shadow database roto**: las migraciones de los campos nuevos en `cargos`
  deben aplicarse con el patrón manual (`migrate resolve --applied` +
  `db execute --url`).
