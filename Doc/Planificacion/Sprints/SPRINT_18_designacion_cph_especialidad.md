# SPRINT 18 — Designación CPH: búsqueda mejorada + validación de especialidad + ID SIAL Rol

**Estado:** 📋 Planificado
**Autores:** Jorge (backend) + Agustín (frontend)
**Rama:** `jorge` / `agustin` según tarea
**Depende de:** Sprint 17 ✅, migración `20260928000000_persona_especialidad_cph` ✅

---

## Objetivo

Mejorar el flujo de designación en el wizard CPH en tres dimensiones:

1. **Búsqueda de persona más completa** — buscar por nombre, CUIL, DNI, ID SIAL (sin rol),
   y mostrar la especialidad CPH canónica de cada candidato para facilitar la selección.

2. **Validación de especialidad** — al mostrar la persona designada (o al seleccionar una
   para designar), alertar visualmente si su especialidad CPH no coincide con la
   especialidad solicitada del concurso.

3. **Gestión del ID SIAL Rol** — al designar, el usuario puede:
   - Elegir un `idSialRol` existente de los disponibles para esa persona en el padrón
   - O dejar el campo vacío si la persona todavía no aparece en el padrón (el sistema
     genera un ID sintético `MANUAL-{cargoId}-{fecha}` y lo reemplaza automáticamente
     cuando llegue el padrón siguiente)

---

## Contexto: qué está mal hoy

### Problema 1 — Búsqueda limitada en el modal de designación

El modal "Registrar designación" en `ConcursoCphWizard` busca personas solo por
`apellidoNombre` o `cuil` (campo libre contra `GET /api/v1/personas?search=`).
No permite buscar por:
- DNI (número de documento)
- ID SIAL (el identificador del cargo en SIAL, sin el sufijo de rol)
- ID SIAL Rol completo

### Problema 2 — Sin validación de especialidad al designar

El modal muestra el nombre de la persona seleccionada pero no su especialidad CPH.
Es posible designar a alguien de Radiología en un concurso de Anestesiología sin
ninguna advertencia (caso real: Kunz, Maria Belen Guadalupe).

La causa raíz fue corregida en la sesión anterior:
- `personas.especialidad_cph` ahora existe y está populado desde `ref_especialidades_cuil`
- `personas.especialidad_principal` fue normalizada con tildes y formato canónico

Pero el wizard todavía no usa estos datos para validar.

### Problema 3 — ID SIAL Rol: campo libre sin opciones

El campo "ID SIAL Rol" en el modal es un input de texto libre. El usuario tiene que
saber de memoria el valor correcto. No hay forma de:
- Ver qué `idSialRol` tiene esa persona en el padrón actual
- Elegir entre múltiples roles si la persona tiene más de uno
- Saber si la persona todavía no aparece en el padrón (y que el sistema lo manejará)

---

## Modelo correcto

### Flujo de designación mejorado

```
Usuario abre modal "Designar" en etapa 5 del wizard
  ↓
Busca persona por: nombre / CUIL / DNI / ID SIAL (sin rol)
  ↓
Lista de resultados muestra:
  - Apellido y Nombre
  - CUIL
  - Especialidad CPH (desde personas.especialidad_cph)
  - Badge de alerta si especialidad ≠ especialidad_solicitada del concurso
  ↓
Usuario selecciona persona
  ↓
Sistema carga los idSialRol disponibles de esa persona en el padrón actual
  (ocupaciones activas: hasta IS NULL)
  ↓
Usuario elige un idSialRol de la lista, o deja "Sin ID SIAL (pendiente de padrón)"
  ↓
Usuario ingresa fecha de inicio
  ↓
Confirmar → crea Ocupacion, avanza concurso a N-DESIGNADO
```

### Alerta de especialidad en la etapa 5 (persona ya designada)

Cuando el concurso ya tiene persona designada y el usuario está en la etapa 5:
- Si `persona.especialidad_cph` ≠ `concurso.especialidadSolicitada` (comparación
  case-insensitive, ignorando tildes) → mostrar badge naranja de advertencia
- Si coinciden → mostrar badge verde de confirmación
- Si `especialidad_cph` es null → mostrar badge gris "Sin especialidad registrada"

---

## Tareas

| # | Tarea | Dev | Est. | Prioridad | Estado |
|---|-------|-----|------|-----------|--------|
| S18-1 | Backend: `GET /api/v1/personas/:id/sial-roles` — devuelve los `idSialRol` activos de una persona (ocupaciones con `hasta IS NULL`), con datos del cargo (código, puesto, hospital). | Jorge | 2h | 🔴 | 📋 |
| S18-2 | Backend: extender `GET /api/v1/personas` para buscar por `idSial` (sin rol) — nuevo query param `idSial` que busca en `ocupaciones.idSialRol LIKE '{idSial}%'`. | Jorge | 1h | 🔴 | 📋 |
| S18-3 | Backend: `GET /api/v1/personas` incluye `especialidadCph` en la respuesta del listado (ya existe en la query raw de `personas.service.ts` — solo falta exponerlo). | Jorge | 0.5h | 🔴 | ✅ (hecho en sesión anterior) |
| S18-4 | Frontend: modal "Designar" — reemplazar input de búsqueda libre por búsqueda que acepta nombre / CUIL / DNI / ID SIAL. Mostrar `especialidadCph` en cada resultado. Badge de alerta si no coincide con `especialidadSolicitada` del concurso. | Agustín | 4h | 🔴 | 📋 |
| S18-5 | Frontend: modal "Designar" — después de seleccionar persona, cargar sus `idSialRol` disponibles desde S18-1. Mostrar como lista seleccionable. Opción "Sin ID SIAL (pendiente de padrón)" siempre disponible. | Agustín | 3h | 🔴 | 📋 |
| S18-6 | Frontend: etapa 5 del wizard — panel "Persona designada" muestra badge de validación de especialidad (verde / naranja / gris) comparando `persona.especialidadCph` vs `concurso.especialidadSolicitada`. | Agustín | 2h | 🔴 | 📋 |
| S18-7 | Frontend: etapa 5 del wizard — si la persona fue designada con ID SIAL sintético (`MANUAL-*`), mostrar aviso "Pendiente de padrón — se actualizará automáticamente cuando llegue el archivo semanal". | Agustín | 1h | 🟡 | 📋 |
| S18-8 | Verificación end-to-end: buscar por DNI → seleccionar → ver especialidad → alerta si no coincide → elegir idSialRol → confirmar designación → wizard avanza a N-DESIGNADO. | Jorge + Agustín | 2h | 🔴 | 📋 |

**Total estimado:** ~15.5h

---

## Dependencias entre tareas

```
S18-2 ──► S18-4 (búsqueda por ID SIAL en el modal)
S18-3 ──► S18-4 (especialidadCph en resultados)
S18-1 ──► S18-5 (lista de idSialRol disponibles)
S18-4 + S18-5 ──► S18-8
S18-6 ──► S18-8
```

S18-3 ya está hecho — `especialidadCph` ya se expone en `GET /api/v1/personas`.
Agustín puede arrancar S18-4 en paralelo con Jorge haciendo S18-1 y S18-2.

---

## Cambios de backend

### S18-1 — Nuevo endpoint `GET /personas/:id/sial-roles`

```typescript
// Respuesta
[
  {
    idSialRol: "001234567-2-20123456789",
    cargoId: "uuid",
    codigoCargo: "CPH-POF-001234",
    literalPuesto: "Médico de Planta",
    hospitalSigla: "HGARM",
    desde: "2023-01-15",
  },
  // ... más roles si tiene
]
```

### S18-2 — Búsqueda por ID SIAL en `GET /personas`

Nuevo query param `idSial` (string). Busca en:
```sql
EXISTS (
  SELECT 1 FROM ocupaciones o2
  JOIN cargos c2 ON c2.id = o2.cargo_id
  WHERE o2.persona_id = p.id
    AND (
      TRIM(c2.id_sial) = TRIM($idSial)
      OR TRIM(c2.id_sial) LIKE $idSial || '-%'
      OR o2.id_sial_rol LIKE $idSial || '%'
    )
)
```

Esto ya existe parcialmente en el service (el param `idSial` ya está en el schema
de personas) — revisar si solo falta exponerlo o si hay que extenderlo.

---

## Cambios de frontend

### S18-4 — Modal "Designar" mejorado

**Búsqueda:**
- El input acepta cualquier texto
- El placeholder dice: "Buscar por nombre, CUIL, DNI o ID SIAL..."
- La query a `GET /api/v1/personas` usa el param `search` (ya maneja nombre/CUIL/DNI)
  y agrega `idSial` si el texto parece un ID SIAL (solo dígitos, 6-12 chars)

**Resultados:**
```
┌─────────────────────────────────────────────────────┐
│ Kunz, Maria Belen Guadalupe                         │
│ CUIL: 27-12345678-9  ·  DNI: 12345678               │
│ Especialidad CPH: Radiología (Radiodiagnóstico)     │
│ ⚠️ No coincide con la especialidad del concurso     │
│    (Anestesiología)                                 │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ García, Juan Carlos                                 │
│ CUIL: 20-87654321-0  ·  DNI: 87654321               │
│ Especialidad CPH: Anestesiología                    │
│ ✓ Coincide con la especialidad del concurso         │
└─────────────────────────────────────────────────────┘
```

**Lógica de comparación de especialidad:**
```typescript
function especialidadCoincide(espCph: string | null, espConcurso: string | null): boolean {
  if (!espCph || !espConcurso) return false
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  return norm(espCph) === norm(espConcurso)
}
```

### S18-5 — Selector de ID SIAL Rol

Después de seleccionar persona, aparece una sección nueva:

```
ID SIAL Rol
┌─────────────────────────────────────────────────────┐
│ ○ Sin ID SIAL (pendiente de padrón)                 │
│   El sistema generará un ID provisional. Se         │
│   actualizará automáticamente con el próximo padrón │
├─────────────────────────────────────────────────────┤
│ ● 001234567-2  ·  CPH-POF-001234                    │
│   Médico de Planta  ·  HGARM                        │
├─────────────────────────────────────────────────────┤
│ ○ 001234567-3  ·  CPH-POU-005678                    │
│   Médico de Guardia  ·  HGARM                       │
└─────────────────────────────────────────────────────┘
```

Si la persona no tiene ocupaciones activas en el padrón, solo aparece la opción
"Sin ID SIAL (pendiente de padrón)" — seleccionada por defecto.

### S18-6 — Badge de especialidad en etapa 5

En el panel verde de "Persona designada" (cuando el concurso ya tiene persona):

```
✓ Desde padrón
Kunz, Maria Belen Guadalupe
CUIL: 27-12345678-9
Especialidad: Radiología (Radiodiagnóstico)
⚠️ Especialidad diferente al concurso (Anestesiología)
```

Colores:
- Verde: `especialidadCph` coincide con `especialidadSolicitada`
- Naranja: no coincide (advertencia, no bloquea)
- Gris: `especialidadCph` es null

### S18-7 — Aviso ID SIAL provisional

Si `cargoSial` del concurso empieza con `MANUAL-`:

```
⏳ ID SIAL provisional — pendiente de padrón
El cargo SIAL se actualizará automáticamente cuando
llegue el próximo archivo semanal y la persona aparezca
en el padrón.
```

---

## Criterio de éxito

- [ ] Búsqueda en modal acepta nombre, CUIL, DNI e ID SIAL
- [ ] Cada resultado muestra especialidad CPH y badge de coincidencia
- [ ] Al seleccionar persona, se cargan sus idSialRol disponibles del padrón
- [ ] Se puede designar sin ID SIAL (queda como provisional)
- [ ] Etapa 5 muestra badge de validación de especialidad para persona ya designada
- [ ] Concurso con ID SIAL provisional muestra aviso claro
- [ ] Sin regresiones en el flujo de designación existente

---

## Notas

- **Comparación de especialidad es informativa, no bloqueante** — el usuario puede
  designar a alguien con especialidad diferente (puede ser un caso válido, ej. cambio
  de especialidad aprobado). La alerta es para que el operador lo note y lo evalúe
  conscientemente, no para impedirlo.

- **`especialidad_cph` vs `especialidad_principal`**: el badge usa `especialidadCph`
  (la especialidad CPH canónica de `ref_especialidades_cuil`), no `especialidadPrincipal`
  (que es la del cargo actual del padrón y puede ser diferente). Esta distinción es
  exactamente la razón por la que se creó el campo en la sesión anterior.

- **Personas sin `especialidad_cph`**: son personas que no tienen registro en
  `ref_especialidades_cuil` tipo=cph (ej. personal administrativo, residentes, docentes).
  Para ellas el badge es gris "Sin especialidad CPH registrada" — no es un error.

- **ID SIAL Rol provisional**: el formato `MANUAL-{cargoId.slice(0,8)}-{fechaDesde}`
  ya existe en `designarConcursoCphService`. El aviso de S18-7 detecta este patrón
  con `cargoSial?.startsWith('MANUAL-')`.

- **Múltiples roles**: una persona puede tener más de un `idSialRol` activo (ej.
  retención de cargo). El selector de S18-5 muestra todos y el usuario elige el
  correcto para la designación.
