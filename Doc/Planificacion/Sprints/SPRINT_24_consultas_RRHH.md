# Sprint 24 — Consultas para RRHH antes de generar los cargos de conducción

**Para:** equipo de RRHH / referentes de estructura.
**De:** equipo de desarrollo SRRHH v2.
**Fecha:** 2026-10.

## Contexto en una frase

Vamos a hacer que el sistema **cree automáticamente los cargos de jefatura (direcciones,
jefaturas de departamento, división, unidad, sección) que la estructura orgánica define**, aunque
hoy no estén cargados porque nadie los ocupa. Así una **vacante de conducción** pasa a ser un cargo
real que se puede contar y gestionar, en vez de aparecer como un hueco en el organigrama.

Antes de generarlos (son unos **4.100 cargos**), necesitamos que RRHH confirme seis puntos, porque
son decisiones de negocio que el sistema no puede inventar sin riesgo de cargar datos incorrectos a
gran escala. Debajo de cada pregunta explicamos por qué importa.

---

## Lo que medimos sobre los datos actuales

De las ~4.100 reparticiones con jefatura en la estructura:

| Situación hoy                                               | Cantidad | Qué significa                                            |
| ----------------------------------------------------------- | -------- | -------------------------------------------------------- |
| Tienen jefe en actividad                                    | 3.678    | OK, el sistema solo las "formaliza".                     |
| **Tienen personal trabajando pero NINGÚN jefe en actividad** | **101**  | El caso central: falta modelar/cubrir la jefatura.       |
| Tienen cargos cargados pero nadie en actividad hoy          | 159      | ¿La unidad sigue funcionando o es un dato viejo?         |
| No tienen ningún empleado cargado                           | 178      | ¿La unidad existe de verdad o sobró del árbol anterior?  |

> Aclaración de criterio ya acordada: una persona **en "retención de cargo" NO cuenta como jefe en
> actividad** de esa repartición, porque al retener pasa a ejercer otro puesto en otro lado. Ej.:
> el Hospital Sardá tiene 282 personas trabajando y sus 3 Jefes de Unidad están todos en retención
> → para el organigrama esa jefatura está **vacante hoy**.

---

## Pregunta 1 — Las 101 jefaturas sin cubrir (prioritaria)

Hay **101 reparticiones con personal activo pero sin jefe en actividad**. Entre ellas, las de mayor
nivel: **2 direcciones de hospital (DHOS)** y **11 subdirecciones (SDHOS)**.

**¿Es correcto que todas estas deban tener una jefatura, o alguna por diseño depende del jefe de
otra área y no lleva cargo propio?**

*Por qué importa:* vamos a crear un cargo de jefatura vacante por cada una. Si alguna no debe tener
jefatura propia, estaríamos inventando una vacante inexistente. Las direcciones y subdirecciones de
hospital son las más llamativas: o falta cargar al director (y hay que crearlo) o la dirección está
realmente acéfala (dato importante para gestión). Necesitamos saber cuál es cada caso.

## Pregunta 2 — Las 178 reparticiones sin ningún empleado

Hay **178 unidades en la estructura que no tienen ningún empleado** en el padrón actual.

**¿Estas unidades existen y funcionan hoy, o son estructuras viejas/errores de carga que habría que
depurar del árbol?**

*Por qué importa:* la estructura (el "árbol") se cargó desde un Excel y puede estar desactualizada.
Si creamos una vacante de jefatura para una unidad que ya no existe, ensuciamos el conteo de
vacantes con cargos fantasma. Preferimos marcarlas para revisión antes que darlas por vacantes
reales.

## Pregunta 3 — Las 159 unidades con cargos pero sin actividad

Hay **159 unidades que tienen cargos cargados pero nadie en actividad hoy**.

**¿Son unidades que siguen existiendo pero están temporalmente sin personal, o quedaron sin uso?
¿Les corresponde una jefatura vacante igual?**

*Por qué importa:* es distinto de las 101 (que sí tienen gente trabajando) y de las 178 (que no
tienen nada). Son un caso intermedio y queremos tratarlas como RRHH indique, no asumir.

## Pregunta 4 — Gerencias y Subgerencias Operativas (GO / SGO)

El sistema identifica **184 Gerencias/Subgerencias Operativas**, suprimidas por el Decreto 259/26
(en extinción).

**Confirmamos que NO generamos cargos de jefatura para GO/SGO (por estar eliminándose), ¿correcto?
¿O RRHH todavía necesita verlas mientras dura la transición?**

*Por qué importa:* son 184 cargos. No tiene sentido crear vacantes de puestos que se están
eliminando, pero es una decisión de política de personal que conviene ratificar por escrito porque
afecta el conteo total.

## Pregunta 5 — Cómo se nombra cada jefatura según el nivel

Proponemos este criterio para el título del cargo según el nivel de la repartición:

| Nivel en la estructura        | Cargo de jefatura que se crea |
| ----------------------------- | ----------------------------- |
| Subsecretaría / Dir. Ejecutiva | Subsecretario/a               |
| Dirección General             | Director/a General            |
| Dirección (de hospital)       | Director/a                    |
| Subdirección                  | Subdirector/a                 |
| Departamento                  | Jefe/a de Departamento        |
| División                      | Jefe/a de División            |
| Unidad                        | Jefe/a de Unidad              |
| Sección                       | Jefe/a de Sección             |

**¿Es correcto este mapeo nivel → título de jefatura?**

*Por qué importa:* esta regla se aplica a los ~4.100 cargos. Un error acá se multiplica por todos.
Caso de borde a confirmar: las reparticiones de **Carrera Administrativa** (secciones/divisiones
administrativas) ¿su jefatura es siempre de Escalafón General, aunque cuelguen de un área médica?

## Pregunta 6 — Cuando una unidad desaparece de la estructura

La estructura se recarga periódicamente. Si una unidad deja de existir en una carga nueva, su cargo
de jefatura vacante (sin ocupante) tendría que darse de baja.

**¿Esa baja la hace el sistema automáticamente, o RRHH quiere revisarla antes de confirmarla?**

*Por qué importa:* define si la actualización de la estructura es automática o requiere aprobación
manual. Afecta cuánto control quiere RRHH sobre el ciclo de vida de estos cargos. (Los cargos que
sí tienen ocupante nunca se tocan automáticamente — esos los sigue gestionando el padrón.)

---

## Lo que NO necesita decisión (se resuelve solo)

- **Escalafón / código de cada jefatura:** se deriva del régimen de empleo que ya trae la estructura
  (Profesionales de la Salud, Enfermería, Técnicos, Administrativa, etc.), usando la misma lógica de
  códigos que ya usa el sistema para el padrón. Donde el régimen de la estructura no coincide con el
  escalafón del personal real (unos ~170 casos), se genera igual pero se marca para revisión.
- **No se duplica nada:** cuando un padrón futuro traiga a alguien ocupando una de estas jefaturas,
  el sistema vincula a esa persona con el cargo ya creado, no crea uno nuevo.

## Prioridad de respuesta

Las preguntas **1, 2 y 3** son las urgentes: definen qué pasa con los ~440 casos dudosos (101 + 178
+ 159) antes de generarlos. Las **4, 5 y 6** son confirmaciones de criterios que ya proponemos.
