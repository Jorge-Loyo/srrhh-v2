# Contrato de Diseño — SRRHH v2

> Define el sistema visual, patrones de UX y reglas de interfaz.
> Basado en los tokens de **Obelisco v2** — el sistema de diseño oficial del Gobierno de la Ciudad de Buenos Aires,
> implementados sobre **Tailwind CSS + shadcn/ui** (no sobre Bootstrap 5).
> Ultima actualizacion: 2026-09 (Post-Sprint 5)
> Estado: VIGENTE

---

## Sistema de Diseño Base

| Aspecto | Especificacion |
|---|---|
| Sistema de diseño | **Obelisco v2** (GCBA) — tokens y principios visuales |
| Implementacion | **Tailwind CSS 3.x + shadcn/ui** (no Bootstrap 5) |
| Documentacion Obelisco | https://gcba.github.io/ |
| Repositorio Obelisco | https://github.com/gcba/Obelisco-v2 |
| UI Kit Figma | Obelisco Core Components + Foundations |

**Nota sobre la implementacion:** Obelisco v2 publica sus tokens de diseño (colores, tipografía, espaciado) y sus principios visuales. La implementacion en este proyecto usa Tailwind CSS con esos tokens aplicados manualmente en `tailwind.config.ts` y `index.css`, y shadcn/ui como librería de componentes base. No se usa el paquete npm `@gcba/obelisco-v2` (que asume Bootstrap 5) — la decision de usar Tailwind + shadcn/ui está documentada en `Contrato_Tecnologias.md`.

---

## Principios de diseño

1. **Identidad institucional** — el sistema respeta la identidad visual del GCBA usando los tokens de Obelisco como base.
2. **Claridad sobre estetica** — es una herramienta de trabajo. La informacion debe ser legible y accionable.
3. **Densidad de informacion** — los usuarios trabajan con tablas de 50k registros. El diseño debe soportar densidad.
4. **Mobile-first** — enfoque responsive desde 320px hasta 1920px.
5. **Accesibilidad** — cumplimiento WCAG 2.1 nivel AA.

---

## Tokens de Diseño (Design Tokens)

### Tipografia

```css
/* Fuente primaria — titulos y destacados */
--font-primary: 'Nunito', system-ui, sans-serif;

/* Fuente secundaria — parrafos y lectura general */
--font-secondary: 'Open Sans', system-ui, sans-serif;

/* Escala tipografica */
--text-xs:   0.75rem;   /* 12px */
--text-sm:   0.875rem;  /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg:   1.125rem;  /* 18px */
--text-xl:   1.25rem;   /* 20px */
--text-2xl:  1.5rem;    /* 24px */
--text-3xl:  1.875rem;  /* 30px */
--text-4xl:  2.25rem;   /* 36px */
```

**Uso:**
- Titulos (h1-h4): Nunito, font-weight 700/800
- Cuerpo de texto, tablas, formularios: Open Sans, font-weight 400/600
- Labels y metadata: Open Sans, font-weight 600

### Paleta de Colores

```css
/* Primario — Amarillo GCBA (identidad de marca) */
--color-primary: #FFD600;
--color-primary-light: #FFE600;
--color-primary-dark: #E6C200;

/* Secundario — Azul GCBA (enlaces y acciones) */
--color-secondary: #0066CC;
--color-secondary-dark: #1E5B97;
--color-secondary-light: #4D94DB;

/* Neutros */
--color-white: #FFFFFF;
--color-gray-50: #F3F6F9;
--color-gray-100: #E9ECEF;
--color-gray-200: #DEE2E6;
--color-gray-300: #CED4DA;
--color-gray-400: #ADB5BD;
--color-gray-500: #6C757D;
--color-gray-600: #495057;
--color-gray-700: #38485C;
--color-gray-800: #212529;
--color-gray-900: #101828;

/* Semanticos — Estados */
--color-success: #2E7D32;       /* verde — aprobado, activo */
--color-danger: #C62828;        /* rojo — error, eliminado */
--color-warning: #F57C00;       /* naranja — advertencia */
--color-info: #0066CC;          /* azul — informativo (usa secundario) */

/* Fondos */
--bg-light: #F3F6F9;
--bg-white: #FFFFFF;
```

### Iconografia

```
Librerias oficiales:
- Material Symbols / Material Icons (Google)
- Boxicons (integrado en Obelisco)

Tamaños estandar:
- sm: 16px
- md: 20px (default)
- lg: 24px
- xl: 32px
```

### Espaciado

Sistema de 4px base (Tailwind compatible):

```
4px   → spacing-1
8px   → spacing-2
12px  → spacing-3
16px  → spacing-4
24px  → spacing-6
32px  → spacing-8
48px  → spacing-12
64px  → spacing-16
```

### Bordes y Sombras

```css
--radius-sm: 4px;    /* badges, chips */
--radius-md: 8px;    /* botones, inputs, cards */
--radius-lg: 12px;   /* modales, panels */
--radius-xl: 16px;   /* hero sections */

--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.07);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
--shadow-xl: 0 20px 25px rgba(0,0,0,0.15);
```

---

## Estructura de Layout

### Header / Navegacion Superior

```
+---------------------------------------------------------------------+
|  [Logo BA]  |  Titulo Sistema  |  [Busqueda]  |  Usuario  |  Menu   |
+---------------------------------------------------------------------+
```

- Fondo: blanco con borde inferior gris
- Logo BA institucional a la izquierda
- Altura: 64px desktop, 56px mobile
- Sticky en scroll

### Sidebar (Desktop)

```
+------------------+
|  Navegacion      |
|                  |
|  > Padron        |  ← item activo: fondo amarillo, texto negro
|    Personas      |
|    Cargos        |
|    Concursos     |
|    KPIs          |
|  ─────────────   |
|    Admin         |
+------------------+
```

- Ancho: 240px desktop, drawer en mobile
- Fondo: gris claro (`--bg-light`)
- Item activo: fondo amarillo GCBA (`--color-primary`), texto negro
- Item hover: fondo gris (`--color-gray-100`)

### Contenido Principal

- Fondo: blanco
- Padding: 24px desktop, 16px mobile
- Max-width contenido: 1200px (centrado en pantallas grandes)

### Footer Institucional

- Fondo: gris oscuro (`--color-gray-800`)
- Texto: blanco/gris claro
- 3 niveles: emergencias, enlaces, legales

---

## Componentes Base

### Botones

```
Variantes:
  btn-primary   → fondo amarillo GCBA, texto negro    (accion principal)
  btn-secondary → fondo azul GCBA, texto blanco       (accion secundaria)
  btn-outline   → borde gris/azul, fondo transparente (terciaria)
  btn-danger    → fondo rojo, texto blanco            (destructiva)
  btn-link      → solo texto azul                     (navegacion)

Tamaños:
  btn-sm  → altura 32px
  btn-md  → altura 40px (default)
  btn-lg  → altura 48px
```

Definidos como `@layer components` en `index.css` para evitar repetir clases Tailwind largas en formularios con muchos campos.

**Regla:** `btn-primary` (amarillo) solo para la accion principal de cada vista. Maximo uno por pantalla.

### Tablas

```
+-----------------------------------------------------+
|  Busqueda          |  Filtros  |  Acciones bulk     |
+------------+------------+------------+--------------+
|  Columna 1 | Columna 2  | Columna 3  | Acciones     |
+------------+------------+------------+--------------+
|  fila...   |            |            | Ver | Editar  |
|  fila...   |            |            | Ver | Editar  |
+-----------------------------------------------------+
|  Mostrando 1-50 de 1.250  |  < 1 2 3 ... 25 >       |
+-----------------------------------------------------+
```

- Header: fondo gris claro, texto bold
- Filas: alternancia blanco / gris-50
- Hover fila: fondo amarillo muy claro (`#FFFDE7`)
- Bordes: 1px gris claro entre filas

### Formularios

```
Label del campo *
+-----------------------------------------------+
| Placeholder...                                |
+-----------------------------------------------+
Texto de ayuda o error

Estados:
  default → borde gris
  focus   → borde azul GCBA + sombra sutil
  error   → borde rojo + mensaje rojo debajo
  success → borde verde (validacion OK)
```

- Labels: Open Sans 600, color gris oscuro
- Inputs: altura 40px, border-radius 8px
- Campos requeridos: `*` en rojo junto al label
- Clases `.input` y `.checkbox` definidas en `@layer components` de `index.css`

### Badges / Tags

```
Estados:
  default   → gris      bg-gray-100  text-gray-700
  primary   → amarillo  bg-yellow-100 text-yellow-800
  success   → verde     bg-green-100  text-green-800
  danger    → rojo      bg-red-100    text-red-800
  warning   → naranja   bg-orange-100 text-orange-800
  info      → azul      bg-blue-100   text-blue-800
  amber     → ambar     bg-amber-100  text-amber-800  ← retencion de cargo
```

- Border-radius: 4px
- Padding: 4px 8px
- Font-size: 12px, font-weight 600
- Clases `.badge-*` definidas en `@layer components` de `index.css`

### Modales

- Header: fondo blanco, titulo en Nunito bold, boton cerrar
- Body: padding 24px
- Footer: botones alineados a la derecha
- Overlay: negro 50% opacity
- Border-radius: 12px
- Tamaños: sm (400px), md (500px), lg (700px), xl (900px)

### Alertas / Notificaciones

```
Tipos:
  alert-success → fondo verde claro, borde verde, icono check
  alert-danger  → fondo rojo claro, borde rojo, icono X
  alert-warning → fondo naranja claro, borde naranja, icono triangulo
  alert-info    → fondo azul claro, borde azul, icono i
```

### Toast (Notificaciones flotantes)

- Posicion: esquina inferior derecha
- Duracion: 4 segundos (errores: 6 segundos)
- Max-width: 350px
- Apilables (max 3 visibles)

### SearchableSelect (combobox)

Componente custom en `shared/components/ui/SearchableSelect.tsx`. Input + lista filtrada en vivo. Normaliza acentos con `normalize('NFD')` para que "medico" encuentre "Médico". Clickear afuera descarta lo tipeado sin confirmar. Usado en selectores de puesto con 60-276 opciones.

---

## Patrones de UX por Modulo

### Padron Semanal
- Badge en header cuando hay snapshot pendiente
- Barra de progreso con `pasoActual` durante el procesamiento
- Diff en tabs: Nuevos / Modificados / Eliminados
- Valores anteriores en rojo tachado, nuevos en verde
- Boton "Aprobar" amarillo, requiere confirmacion modal

### Tablas de Personas / Cargos
- Busqueda con debounce 300ms
- Filtros en cascada: escalafon → puesto → especialidad (cada nivel limpia los siguientes)
- Filtros persistentes en URL (`useSearchParams`)
- Chips de filtros activos con `×` individual y "Limpiar todo"
- Click en fila abre panel de detalle
- Exportar a Excel disponible (todo el resultado filtrado, no solo la pagina visible)

### Concursos CPH
- Timeline visual del sub-estado 3 (barra de progreso de 8 etapas)
- Desierto como banner rojo separado, no como etapa de la barra
- Suspendido atenua la barra entera con aviso
- Formulario agrupado en 6 fases (Baja/apertura, Autorizacion, Inscripcion-examen, IFACS/INSAL, Designacion, Desierto)
- `estado`/`subEstado` como badges de solo lectura — el backend los calcula
- Panel de alertas por inactividad (30/60/90 dias) arriba de la tabla

### Concursos CEETPS
- Mismo patron de tabla + filtros que CPH
- Estado calculado server-side, no editable

### Bajas
- Tabla con historial + formulario de nueva baja
- `tipoBaja` como campo libre con lista sugerida (no obligatoria)
- Al registrar con `generaConcurso: true`, el seguimiento se crea automaticamente

### KPIs / Tablero
- Cards con borde izquierdo amarillo
- Skeleton loading (no spinner global)
- Filtro por hospital afecta toda la pagina

---

## Accesibilidad (WCAG 2.1 AA)

| Requisito | Implementacion |
|---|---|
| Contraste de texto | Minimo 4.5:1 para texto normal, 3:1 para texto grande |
| Navegacion por teclado | Tab order logico, focus visible en todos los interactivos |
| Textos alternativos | Todas las imagenes con `alt` descriptivo |
| Etiquetas ARIA | Labels en formularios, roles en componentes custom |
| Skip links | Enlace "Ir al contenido" al inicio |
| Responsive | Funcional desde 320px hasta 1920px |

**Nota:** El amarillo GCBA (#FFD600) sobre blanco NO cumple contraste AA para texto pequeño. Usar solo como fondo de botones/badges con texto negro, o como acento decorativo.

---

## Breakpoints Responsive

| Breakpoint | Ancho | Uso |
|---|---|---|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Desktop wide |
| `2xl` | 1536px | Desktop extra wide |

---

## Reglas que no se negocian

1. **Tokens Obelisco como base** — usar los colores, tipografias y espaciados oficiales. No inventar colores primarios.
2. **Tipografias oficiales** — Nunito para titulos, Open Sans para cuerpo. No otras.
3. **Paleta GCBA** — amarillo y azul institucionales.
4. **Un solo btn-primary por vista** — el amarillo es para la accion principal.
5. **Mobile-first** — diseñar desde 320px hacia arriba.
6. **WCAG 2.1 AA** — accesibilidad no es opcional.
7. **Feedback en toda accion** — ninguna accion queda sin respuesta visual.
8. **Confirmacion para destructivas** — eliminar/rechazar requiere modal.
9. **Clases de componentes en `@layer components`** — no repetir strings largos de Tailwind en cada instancia. Extraer a `.btn-*`, `.badge-*`, `.input`, `.checkbox` en `index.css`.
