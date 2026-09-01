# Contrato de Página — Alta de Cargos (`/cargos/alta`)

## Archivo
`SRRHH-Legacy/apps/web/src/modules/cargos/pages/AltaCargosPage.tsx`

---

## Propósito
Permite registrar uno o varios cargos nuevos en el sistema, agrupados bajo un mismo expediente o decreto. El flujo es: confirmar expediente → completar campos del cargo → agregar al panel → repetir para más cargos → registrar todos de una vez.

---

## Mapa de orígenes de alta de cargo

Un cargo solo puede crearse por **4 vías** en todo el sistema. Tres de ellas son manuales y se concentran en esta página; la cuarta es automática (importación del padrón SIAL) y ocurre en el módulo Padrón.

| # | Origen | Vía | Endpoint | Datos distintivos | ¿Esta página? |
|---|--------|-----|----------|-------------------|---------------|
| 1 | **Ejecución POF** | Manual | `POST /api/v1/cargos` | `unificadorPuesto='POF'`, expediente | ✅ Sí |
| 2 | **Ejecución POU** | Manual | `POST /api/v1/cargos` | `unificadorPuesto='POU Guardia'`, expediente | ✅ Sí |
| 3 | **Estructura** | Manual | `POST /api/v1/cargos` | Cargos de conducción/autoridades (`modalidad='ambos'`), decreto | ✅ Sí |
| 4 | **Padrón semanal SIAL** | Automática (aprobar snapshot) | `POST /api/v1/padron/snapshots/:id/aprobar` | `idSial` real del Excel, `codigoRepa`, creación en lote (`createMany`) | ❌ Fuera de alcance |

> **No existen otros orígenes.** Verificado en todo el repo: `AltaPorBajaPage` no crea cargos (es la entrada al flujo baja→concurso), las bajas marcan `no_vigente`, los concursos consumen cargos existentes, y ningún script/migración/seed inserta en `cargos`.

### Caso que NO es origen de alta: "Alta con contrapartida de baja"
El `Contrato_logica-cargo.md` (§2.2) menciona la baja "Vacante a No Vigente" cuya contrapartida es un expediente de alta de otro cargo. **Esto no crea un cargo nuevo**: el cargo estructural y su historia persisten; solo se reemplaza a la persona que lo ocupa. Es un movimiento de **ocupación** (flujo de bajas/designaciones), no un alta de cargo.

---

## Requerimientos Funcionales

### Implementados (comportamiento actual)

| ID | Requerimiento | Criterio de aceptación | Estado |
|----|---------------|------------------------|--------|
| RF-01 | Selección de tipo de alta con toggle exclusivo | Solo un formulario activo a la vez; clic en el activo lo cierra; clic en otro abre ese y cierra el anterior. Botones siempre habilitados. | ✅ Implementado |
| RF-02 | Expediente/decreto como paso obligatorio previo | Sin expediente confirmado, los campos del cargo están deshabilitados (`opacity-40` + `pointer-events-none`). El expediente se comparte por todos los cargos agregados en esa sesión de formulario. | ✅ Implementado |
| RF-03 | Formulario con reseteos en cascada | Cambiar Hospital resetea Puesto y Especialidad. Cambiar Escalafón resetea Modalidad, Puesto y Especialidad. Cambiar Modalidad resetea Puesto y Especialidad. Cambiar Puesto resetea Especialidad. | ✅ Implementado |
| RF-04 | Filtrado de puestos por escalafón y modalidad | `estructura` → solo `modalidad='ambos'`. `pof`/`pou` → puestos propios de esa modalidad; si el escalafón no tiene (ej: CEETPS), incluye los `'ambos'`. Garantiza que CPH POF no muestra cargos de conducción. | ✅ Implementado |
| RF-05 | Especialidad obligatoria sin texto libre | Si el puesto tiene especialidades en BD, el campo aparece y bloquea "Agregar" hasta seleccionar una. No permite texto libre. | ✅ Implementado |
| RF-06 | Panel de pendientes multi-cargo | Permite acumular N cargos bajo el mismo expediente antes de registrar. Muestra badge con total (suma de cantidades). Eliminación individual por ítem. | ✅ Implementado |
| RF-07 | Registro secuencial con conservación en error | Envía un `POST /api/v1/cargos` por ítem, en secuencia. En éxito: mueve todos al historial y vacía pendientes. En error: muestra mensaje en rojo y **no vacía** pendientes. | ✅ Implementado |
| RF-08 | Historial de sesión con buscador | Tabla de altas registradas en la sesión (no persiste al recargar). Buscador filtra por hospital, escalafón, puesto, expediente, códigos y tipo. | ✅ Implementado |
| RF-09 | Generación de códigos correlativos | `cantidad` entre 1 y 50. El backend genera N códigos correlativos según nomenclatura (`{PREFIJO}-{seq 6 dígitos}`) en una transacción. | ✅ Implementado |
| RF-10 | Alias visual "Médicos" → "CPH" | El escalafón "Médicos" se muestra como "CPH" solo en el `<select>` del frontend. La BD mantiene "Médicos". | ✅ Implementado |

### Pendientes (gaps a lograr)

| ID | Requerimiento | Criterio de aceptación | Prioridad | Estado |
|----|---------------|------------------------|-----------|--------|
| RF-11 | **Persistir expediente/decreto en BD** | El acto administrativo que respalda el alta debe guardarse en la tabla `cargos` (columna `expediente`). Se resuelve en S7-1/S7-2. | 🔴 P1 | ✅ Implementado (S7-1/S7-2) |
| RF-12 | **Persistir fecha "desde" en BD** | La fecha de inicio de vigencia del cargo debe guardarse (columna `fechaDesde`). Se resuelve en S7-1/S7-2. | 🔴 P1 | ✅ Implementado (S7-1/S7-2) |
| RF-13 | **Auditoría del alta** | Registrar `createdById` (usuario del token JWT) en cada alta manual para trazabilidad. Se resuelve en S7-1/S7-2. | 🟡 P2 | ✅ Implementado (S7-1/S7-2) |
| RF-14 | **Historial persistente de altas** | Poder consultar altas por expediente más allá de la sesión. Endpoint dedicado: `GET /api/v1/cargos/altas?expediente=&desde=&hasta=` — lista cargos con `idSial LIKE 'MANUAL-%'`, filtrable por expediente y rango de fechas, incluye usuario y códigos generados. Se resuelve en S7-4/S7-7. | 🟡 P2 | ✅ Implementado (S7-4/S7-7) |
| RF-15 | **Validación de duplicado estructural** | Antes de crear, advertir si ya existe un cargo vigente con la misma identidad estructural `(hospitalId, escalafonId, literalPuesto)`. El backend responde `409` con el cargo existente; el frontend muestra modal con "Crear de todos modos" / "Cancelar". Se resuelve en S7-5/S7-6. | 🟢 P3 | ✅ Implementado (S7-5/S7-6) |

---

## Estructura visual

### Header
- Título: **"Alta de Cargos"**
- 3 botones de tipo de alta (siempre habilitados):
  - `+ Ejecución POF` → `btn-secondary`
  - `+ Ejecución POU` → `btn-outline`
  - `+ Estructura` → `btn-outline`
- Al clickear un botón activo (`▲`) lo cierra (toggle). Al clickear uno inactivo abre ese formulario y cierra el anterior.

### Estado inicial (sin botón activo)
- Mensaje: *"Seleccioná un tipo de cargo para agregar."*
- Panel lateral y formulario **no se muestran**.

### Layout al activar un tipo (2 columnas)
- **Columna izquierda** (`flex-1`): formulario `FormAlta`
- **Columna derecha** (`w-72`): panel "Cargos pendientes"

---

## Formulario `FormAlta`

### Paso 1 — Expediente / Decreto
- Campo de texto libre obligatorio.
- Label: "Expediente" para POF/POU, "Decreto" para Estructura.
- Placeholder POF/POU: `Ej: EX-2026-32260736-GCABA-DGAYDRH`
- Placeholder Estructura: `Ej: DEC-541/MSGC/26`
- Botón "Confirmar" (disabled si vacío). Enter también confirma.
- Una vez confirmado: muestra badge verde con ✓ + texto del expediente + link "Cambiar".
- Los campos del cargo se habilitan solo tras confirmar el expediente (opacity-40 + pointer-events-none si no confirmado).

### Paso 2 — Campos del cargo (habilitados tras confirmar expediente)

#### Hospital *
- `<select>` con todos los hospitales: `{sigla} — {nombre}`
- Al cambiar: resetea Puesto y Especialidad.

#### Escalafón *
- `<select>` filtrado según el tipo de alta activo (ver tabla por pestaña más abajo).
- Al cambiar: resetea Modalidad, Puesto y Especialidad.

#### Modalidad / Categoría
- Solo aparece si `opciones.length > 1` (pills/botones).
- Al cambiar: resetea Puesto y Especialidad.
- Opciones según escalafón (ver tabla por pestaña más abajo).

#### Puesto *
- `PuestoCombobox`: input con búsqueda en tiempo real, dropdown con resultados.
- Puestos cargados desde `GET /api/v1/puestos-cargo?escalafonId=&modalidad=`.
- **Regla de filtrado**: `pof` → puestos con `modalidad='pof'` + `'ambos'`. `pou` → puestos con `modalidad='pou'` + `'ambos'`. `estructura` → solo `modalidad='ambos'`.
- Al cambiar: resetea Especialidad.

#### Especialidad
- Solo aparece si el puesto seleccionado tiene especialidades en BD (`GET /api/v1/puestos-cargo/especialidades`).
- `PuestoCombobox` igual al de Puesto.
- Obligatoria cuando aparece (bloquea el botón Agregar).
- No permite texto libre.

#### Desde *
- `<input type="date">`

#### Cantidad
- Stepper `−` / número / `+`. Mínimo 1, máximo 50.
- Default: 1.

#### Botones de acción
- **Cancelar**: cierra el formulario (setTipoActivo null).
- **+ Agregar** (disabled si `formCompleto === false`): agrega el cargo al panel pendiente, resetea Puesto / Especialidad / Cantidad (mantiene Hospital, Escalafón, Desde para agilizar carga múltiple). El formulario permanece abierto.

### `formCompleto`
```
expConfirmado && hospitalId && escalafonId && modalidadEfectiva && puesto
  && (especialidades.length === 0 || especialidad) && desde
```

---

## Panel "Cargos pendientes" (columna derecha)

- Solo visible cuando hay formulario activo (`tipoActivo !== null`) o hay pendientes (`pendientes.length > 0`).
- Badge con total de cargos (suma de `cantidad` de todos los ítems).
- Cada ítem muestra: tipo (badge), sigla hospital, `x{cantidad}` si > 1, nombre del puesto, especialidad (si tiene), fecha desde.
- Botón `×` por ítem para eliminarlo individualmente.
- Botón **"Registrar (N)"**:
  - Disabled si `pendientes.length === 0` o `guardando`.
  - Envía todos los pendientes a la API en secuencia (`POST /api/v1/cargos` por cada ítem).
  - Al completar: mueve todos al historial, vacía pendientes.
  - En error: muestra mensaje en rojo, no vacía pendientes.

---

## Historial de altas (persistente)

- Siempre visible debajo del card principal.
- Buscador filtra por expediente (llama a `GET /api/v1/cargos/altas?expediente=...`).
- Tabla con columnas: Fecha / Código / Hospital / Escalafón / Puesto / Expediente / Desde / Registrado por.
- Si no hay altas: mensaje *"No hay altas registradas"*.
- El historial **persiste entre sesiones** — consume el endpoint dedicado (S7-7).

---

## API utilizada

| Método | Endpoint | Uso |
|--------|----------|-----|
| GET | `/api/v1/hospitales` | Lista de hospitales para el select |
| GET | `/api/v1/escalafones?paraNuevaAlta=true` | Escalafones con puestos activos (6 escalafones) |
| GET | `/api/v1/puestos-cargo?escalafonId=&modalidad=` | Puestos filtrados por escalafón y modalidad |
| GET | `/api/v1/puestos-cargo/especialidades?escalafonId=&nombre=` | Especialidades de un puesto |
| POST | `/api/v1/cargos` | Crear cargo(s) — persiste expediente, fechaDesde, createdById (post S7-2) |
| GET | `/api/v1/cargos/altas?expediente=&desde=&hasta=` | Historial persistente de altas manuales (post S7-4) |

### Body de `POST /api/v1/cargos`
```json
{
  "hospitalId": "uuid",
  "escalafonId": "uuid",
  "literalPuesto": "Médico de Planta",
  "especialidad": "Cardiología",
  "unificadorPuesto": "POF",
  "agrupador": null,
  "expediente": "EX-2026-...",
  "desde": "2026-09-01",
  "cantidad": 3
}
```

> ✅ **Nota**: `expediente` y `desde` se persisten en BD desde S7-1/S7-2. `createdById` se toma del token JWT. El historial es persistente desde S7-7.

---

## Lógica por pestaña — Escalafón, Modalidad y Puestos

### Pestaña: Ejecución POF

Cargos de planta permanente financiados por el Presupuesto Operativo Financiero.

| Escalafón | Modalidad (selector) | Puestos disponibles | Notas |
|-----------|---------------------|--------------------|---------|
| Carrera Profesional Hospitalaria | Opción única: "Planta (POF)" — no se muestra selector | `modalidad='pof'` (23 puestos) | Médicos, bioquímicos, psicólogos, etc. |
| Carrera de Enfermería | Opción única: "Enfermería" — no se muestra selector | `modalidad='ambos'` (2 puestos) | Solo tiene `ambos` |
| CEETPS | Opción única: "Técnico Planta (POF)" — no se muestra selector | `modalidad='ambos'` (28 puestos) | Solo tiene `ambos`, se usa como POF |
| Escalafón General | Opción única: "Anexo 2" — no se muestra selector | `modalidad='ambos'` (11 puestos) | Puestos Anexo 2: Camillero, Chofer de Ambulancia, Conductor de Furgon, etc. |

> **No aparecen en POF**: ningún otro escalafón. Residentes, Docentes, Carrera Gerencial, Planta Transitoria, Planta de Gabinete, Autoridades Superiores, Cuerpos Transitorios, Carrera de Técnicos de la Salud quedan fuera de esta pestaña.

---

### Pestaña: Ejecución POU

Cargos de guardia financiados por el Presupuesto Operativo de Unidad.

| Escalafón | Modalidad (selector) | Puestos disponibles | Notas |
|-----------|---------------------|--------------------|---------|
| Carrera Profesional Hospitalaria | Opción única: "Guardia (POU)" — no se muestra selector | `modalidad='pou'` (22 puestos) | Guardias médicas, bioquímicas, etc. |
| CEETPS | Opción única: "Técnico Guardia (POU)" — no se muestra selector | `modalidad='ambos'` (28 puestos) | Solo tiene `ambos`, se usa como POU |
| Carrera de Enfermería | Opción única: "Enfermería" — no se muestra selector | `modalidad='ambos'` (2 puestos) | Solo tiene `ambos` |
| Carrera de Técnicos de la Salud | Opción única: "Técnico Guardia (POU)" — no se muestra selector | `modalidad='ambos'` (28 puestos) | Solo tiene `ambos` |
| Escalafón General | Opción única: "Anexo 2" — no se muestra selector | `modalidad='ambos'` (11 puestos) | Puestos Anexo 2: Camillero, Chofer de Ambulancia, Conductor de Furgon, etc. |

> **No aparecen en POU**: Residentes, Docentes, Carrera Gerencial, Planta Transitoria, Planta de Gabinete, Autoridades Superiores, Cuerpos Transitorios. Estos escalafones no tienen régimen de guardia.

---

### Pestaña: Estructura

Cargos de conducción, autoridades y cuerpos especiales creados por decreto.

| Escalafón | Modalidad (selector) | Puestos disponibles | Notas |
|-----------|---------------------|--------------------|---------|
| Escalafón General | 4 opciones: General / Jefe / Director / Gerencial | `modalidad='ambos'` (11 puestos) | Jefaturas, conducción y puestos Anexo 2 |
| Autoridades Superiores | 4 opciones: Dir. General / Dir. General Adjunta / Subsecretaría / Ministro | `modalidad='ambos'` (4 puestos) | Máximas autoridades |
| Carrera Gerencial | Opción única: nombre del escalafón | `modalidad='ambos'` (3 puestos) | Gerentes operativos |
| Cuerpos Transitorios | Opción única: nombre del escalafón | `modalidad='ambos'` (1 puesto) | Designaciones transitorias |

> **No aparecen en Estructura**: Carrera Profesional Hospitalaria, CEETPS, Carrera de Enfermería, Carrera de Técnicos, Residentes, Docentes, Planta Transitoria, Planta de Gabinete. Estos escalafones no crean cargos de conducción.

> **Nota**: El campo se llama "Decreto" en lugar de "Expediente" en esta pestaña.

> **Puestos Anexo 2 (Escalafón General, 11 puestos)**: Ayudante de Laboratorio Hemoterapia Farmacia y Drogueria, Camillero, Capellan, Chofer de Ambulancia, Conductor de Furgon, Cuidador Enfermero de Animales, Hermana de Caridad, Morguero, Oxigenista, Radio Operador, Radio Operador de Emergencias. En POF/POU se muestran todos bajo la opción única "Anexo 2". En Estructura se acceden desde las opciones General/Jefe/Director/Gerencial.

---

### Resumen: qué escalafones aparecen en cada pestaña

| Escalafón | POF | POU | Estructura |
|-----------|-----|-----|------------|
| Carrera Profesional Hospitalaria | ✅ | ✅ | ❌ |
| Carrera de Enfermería | ✅ | ✅ | ❌ |
| CEETPS | ✅ | ✅ | ❌ |
| Escalafón General | ✅ | ✅ | ✅ |
| Carrera de Técnicos de la Salud | ❌ | ✅ | ❌ |
| Autoridades Superiores | ❌ | ❌ | ✅ |
| Carrera Gerencial | ❌ | ❌ | ✅ |
| Cuerpos Transitorios | ❌ | ❌ | ✅ |
| Residentes | ❌ | ❌ | ❌ |
| Docentes | ❌ | ❌ | ❌ |
| Planta Transitoria | ❌ | ❌ | ❌ |
| Planta de Gabinete | ❌ | ❌ | ❌ |

> ✅ **Estado actual del código**: el filtrado por tipo está implementado en el frontend (`filtrarEscalafones`). Al cambiar de pestaña el formulario se remonta (`key={tipoActivo}`) limpiando el escalafón seleccionado.

---

## Reglas de negocio

1. El expediente es compartido por todos los cargos agregados en una misma sesión de formulario. Cada tipo (POF/POU/Estructura) tiene su propio expediente independiente.
2. Los cargos de conducción (`modalidad='ambos'`) en escalafones de autoridad solo aparecen en **Estructura**.
3. Los escalafones con puestos `pof`/`pou` propios (CPH) no mezclan con conducción en esas pestañas.
4. Los escalafones sin distinción de modalidad (CEETPS, ENF, TEC, Residentes, etc.) usan `modalidad='ambos'` como fallback.
5. La especialidad es obligatoria cuando el puesto la tiene en BD. No se puede ingresar texto libre.
6. Cantidad máxima por grupo: 50. El sistema genera N códigos correlativos.
7. Solo se muestran escalafones que tienen puestos normalizados activos (`?paraNuevaAlta=true`). Actualmente: 12 escalafones (ver tabla resumen arriba).

---

## Componentes internos

| Componente | Descripción |
|------------|-------------|
| `PuestoCombobox` | Input con búsqueda en tiempo real + dropdown. Usado para Puesto y Especialidad. |
| `FormAlta` | Formulario completo de un cargo. Maneja su propio estado de expediente. |
| `AltaCargosPage` | Página principal. Maneja lista de pendientes, historial y envío a API. |

---

## Estado que NO debe cambiar

- Los botones de tipo siempre habilitados (nunca `disabled`).
- El formulario permanece abierto tras "Agregar" (no se cierra automáticamente).
- El panel lateral solo aparece cuando hay formulario activo o pendientes.
- El filtrado de escalafones usa `?paraNuevaAlta=true` — no cambiar a filtro por `cargos: { some: {} }`.
- El filtrado de puestos por modalidad respeta la lógica inteligente: puestos propios si existen, `ambos` como fallback.
- El campo se llama "Decreto" en Estructura y "Expediente" en POF/POU.

---

## Relación con el flujo `validacion_vacante` (Sprint 8)

Desde Sprint 8, el padrón semanal ya no marca cargos directamente como `no_vigente` cuando una persona desaparece del Excel. En cambio los pone en estado `validacion_vacante`. Esto afecta el flujo de alta por baja:

| Situación | Estado del cargo | ¿Se puede seleccionar en `/cargos/baja/nueva`? |
|-----------|-----------------|------------------------------------------------|
| Cargo activo con persona | `vigente` + ocupado | ✅ Sí (reemplazo de persona) |
| Padrón detectó que la persona desapareció | `validacion_vacante` | ✅ Sí (flujo de alta por baja) |
| Baja manual confirmada | `no_vigente` | ❌ No |

**Regla:** el selector de cargo en `NuevaBajaPage` hace 2 queries paralelas (`vigente` + `validacion_vacante`) y muestra badge naranja "En validación" para los del segundo grupo.

**Columna Ocupación en `CargosPage`:** el badge Ocupado/Vacante solo se muestra para cargos `vigente`. Los cargos `no_vigente` y `validacion_vacante` no muestran nada en esa columna — no tiene sentido hablar de "vacante" para un cargo que ya no está activo o está en proceso de baja.
