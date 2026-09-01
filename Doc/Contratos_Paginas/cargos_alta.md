# Contrato de Página — Alta de Cargos (`/cargos/alta`)

## Archivo
`SRRHH-Legacy/apps/web/src/modules/cargos/pages/AltaCargosPage.tsx`

---

## Propósito
Permite registrar uno o varios cargos nuevos en el sistema, agrupados bajo un mismo expediente o decreto. El flujo es: confirmar expediente → completar campos del cargo → agregar al panel → repetir para más cargos → registrar todos de una vez.

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
- `<select>` con todos los escalafones.
- El escalafón "Médicos" se muestra como **"CPH"** en el select (sin tocar BD).
- Al cambiar: resetea Modalidad, Puesto y Especialidad.

#### Modalidad / Categoría
- Solo aparece si `opciones.length > 1` (pills/botones).
- Para CPH POF: opción única "Planta (POF)" → no se muestra el selector.
- Para CPH POU: opción única "Guardia (POU)" → no se muestra el selector.
- Para EG: General / Jefe / Director / Gerencial.
- Para AS: Dir. General / Dir. General Adjunta / Subsecretaría / Ministro.
- Al cambiar: resetea Puesto y Especialidad.

#### Puesto *
- `PuestoCombobox`: input con búsqueda en tiempo real, dropdown con resultados.
- Puestos cargados desde `GET /api/v1/puestos-cargo?escalafonId=&modalidad=`.
- **Regla de filtrado de modalidad**:
  - `estructura` → solo `modalidad='ambos'` (cargos de conducción).
  - `pof` o `pou` → si el escalafón tiene puestos propios de esa modalidad, solo esos. Si no tiene (ej: CEETPS con `modalidad='ambos'`), incluye los `'ambos'`.
  - Esto garantiza que CPH POF no muestra cargos de conducción, y CEETPS sí muestra sus puestos.
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

## Historial de la sesión

- Siempre visible debajo del card principal.
- Buscador de texto libre (filtra por hospital, escalafón, puesto, expediente, códigos, tipo).
- Tabla con columnas: Fecha / Tipo / Hospital / Escalafón / Puesto / Especialidad / Códigos generados / Expediente.
- Si `historial.length === 0`: mensaje *"No hay altas registradas en esta sesión..."*.
- El historial es **solo de sesión** (no persiste al recargar).

---

## API utilizada

| Método | Endpoint | Uso |
|--------|----------|-----|
| GET | `/api/v1/hospitales` | Lista de hospitales para el select |
| GET | `/api/v1/escalafones` | Lista de escalafones para el select |
| GET | `/api/v1/puestos-cargo?escalafonId=&modalidad=` | Puestos filtrados por escalafón y modalidad |
| GET | `/api/v1/puestos-cargo/especialidades?escalafonId=&nombre=` | Especialidades de un puesto |
| POST | `/api/v1/cargos` | Crear cargo(s) |

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

---

## Reglas de negocio

1. El expediente es compartido por todos los cargos agregados en una misma sesión de formulario. Cada tipo (POF/POU/Estructura) tiene su propio expediente independiente.
2. Los cargos de conducción (`modalidad='ambos'`) solo aparecen en el tipo **Estructura**.
3. Los escalafones con puestos propios de `pof`/`pou` (CPH, ENF) no mezclan con conducción.
4. Los escalafones sin distinción de modalidad (CEETPS con `modalidad='ambos'`) aparecen en POF y POU.
5. La especialidad es obligatoria cuando el puesto la tiene en BD. No se puede ingresar texto libre.
6. El escalafón "Médicos" se muestra como "CPH" solo en el frontend (la BD mantiene "Médicos").
7. Cantidad máxima por grupo: 50. El sistema genera N códigos correlativos.

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
- El historial es solo de sesión (no llamar a ningún GET de historial al montar).
- "Médicos" → "CPH" solo en el `<select>` del frontend.
