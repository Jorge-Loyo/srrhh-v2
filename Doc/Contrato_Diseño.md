# Contrato de Diseño — SRRHH v2

> Define el sistema visual, patrones de UX y reglas de interfaz.
> Basado en **Obelisco v2** — el sistema de diseño oficial del Gobierno de la Ciudad de Buenos Aires.
> Ultima actualizacion: 2026-09
> Estado: BORRADOR — en revision

---

## Sistema de Diseño Base

| Aspecto | Especificacion |
|---|---|
| Sistema de diseño | **Obelisco v2** (GCBA) |
| Framework base | Bootstrap 5 |
| Paquete NPM | `@gcba/obelisco-v2` |
| Documentacion | https://gcba.github.io/ |
| Repositorio | https://github.com/gcba/Obelisco-v2 |
| UI Kit Figma | Obelisco Core Components + Foundations |

---

## Principios de diseño

1. **Identidad institucional** — el sistema respeta la identidad visual del GCBA usando Obelisco como base.
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

Sistema de 4px base (Bootstrap/Tailwind compatible):

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
/* Border radius estandar Obelisco */
--radius-sm: 4px;    /* badges, chips */
--radius-md: 8px;    /* botones, inputs, cards */
--radius-lg: 12px;   /* modales, panels */
--radius-xl: 16px;   /* hero sections */

/* Sombras */
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
|  Barra de accesibilidad (opcional): atajos, selector accesibilidad  |
+---------------------------------------------------------------------+
|  [Logo BA]  |  Titulo Sistema  |  [Busqueda]  |  Usuario  |  Menu   |
+---------------------------------------------------------------------+
```

- Fondo: blanco (`--color-white`) con borde inferior gris
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

```
+--------------------------------------------------+
|  PageHeader                                       |
|  Titulo de pagina + breadcrumb + acciones        |
+--------------------------------------------------+
|                                                  |
|  Contenido                                       |
|  (tablas, formularios, cards, etc.)              |
|                                                  |
+--------------------------------------------------+
```

- Fondo: blanco
- Padding: 24px desktop, 16px mobile
- Max-width contenido: 1200px (centrado en pantallas grandes)

### Footer Institucional

```
+---------------------------------------------------------------------+
|  Servicios de Emergencia: 103 | 107 | 144 | 147                     |
+---------------------------------------------------------------------+
|  Enlaces      |  Gobierno    |  Comunas     |  Transparencia        |
|  - Tramites   |  - Ministros |  - Comuna 1  |  - Datos abiertos     |
|  - Servicios  |  - Organigr. |  - Comuna 2  |  - Presupuesto        |
+---------------------------------------------------------------------+
|  [Redes sociales]  |  © GCBA  |  Terminos  |  Privacidad            |
+---------------------------------------------------------------------+
```

- Fondo: gris oscuro (`--color-gray-800`) o negro
- Texto: blanco/gris claro
- 3 niveles: emergencias, enlaces, legales

---

## Componentes Base (Obelisco)

### Botones

```
Variantes Obelisco:
  btn-primary   → fondo amarillo GCBA, texto negro    (accion principal)
  btn-secondary → fondo azul GCBA, texto blanco       (accion secundaria)
  btn-outline   → borde gris/azul, fondo transparente (terciaria)
  btn-danger    → fondo rojo, texto blanco            (destructiva)
  btn-link      → solo texto azul                     (navegacion)

Tamaños:
  btn-sm  → altura 32px
  btn-md  → altura 40px (default)
  btn-lg  → altura 48px

Estados:
  :hover   → oscurece ligeramente
  :focus   → outline amarillo 2px
  :disabled → opacity 50%
  loading  → spinner interno
```

**Regla:** `btn-primary` (amarillo) solo para la accion principal de cada vista. Maximo uno por pantalla.

### Cards

```
+----------------------------------+
|  [Imagen 16:9] (opcional)        |
+----------------------------------+
|  Tag categoria                   |
|  Titulo de la card               |
|  Descripcion o contenido...      |
|                                  |
|  [Accion]              [Accion]  |
+----------------------------------+
```

- Border-radius: 8px
- Sombra: `--shadow-sm`, hover `--shadow-md`
- Padding interno: 16px

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

- Header: fondo gris claro (`--color-gray-50`), texto bold
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

### Badges / Tags

```
Estados:
  default   → gris      bg-gray-100  text-gray-700
  primary   → amarillo  bg-yellow-100 text-yellow-800
  success   → verde     bg-green-100  text-green-800
  danger    → rojo      bg-red-100    text-red-800
  warning   → naranja   bg-orange-100 text-orange-800
  info      → azul      bg-blue-100   text-blue-800
```

- Border-radius: 4px
- Padding: 4px 8px
- Font-size: 12px, font-weight 600

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

---

## Patrones de UX por Modulo

### Padron Semanal
- Badge amarillo en header cuando hay snapshot pendiente
- Diff en tabs: Nuevos / Modificados / Eliminados
- Valores anteriores en rojo tachado, nuevos en verde
- Boton "Aprobar" amarillo, requiere confirmacion modal

### Tablas de Personas / Cargos
- Busqueda con debounce 300ms
- Filtros en panel colapsable lateral
- Click en fila abre panel de detalle (no navega)
- Exportar a Excel disponible

### Concursos
- Timeline visual del estado (barra de progreso)
- Etapa activa resaltada en amarillo
- Edicion inline de campos
- Alertas visuales por inactividad (30/60 dias)

### KPIs / Tablero
- Cards con borde izquierdo amarillo
- Skeleton loading (no spinner global)
- Filtro por hospital afecta toda la pagina
- Comparacion con periodo anterior

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
| xs | < 576px | Mobile portrait |
| sm | >= 576px | Mobile landscape |
| md | >= 768px | Tablet |
| lg | >= 992px | Desktop |
| xl | >= 1200px | Desktop wide |
| xxl | >= 1400px | Desktop extra wide |

---

## Recursos y Entregables

### Recursos Oficiales
- Documentacion Obelisco: https://gcba.github.io/
- Repositorio GitHub: https://github.com/gcba/Obelisco-v2
- NPM: `npm install @gcba/obelisco-v2`
- UI Kit Figma: Obelisco Core Components + Foundations

### Entregables de Diseño
1. Prototipo interactivo en Figma usando UI Kit Obelisco
2. Especificacion de componentes custom (si los hay)
3. Guia de estados y variantes

### Entregables de Frontend
1. Codigo fuente modularizado (HTML5 semantico, SCSS/CSS)
2. Componentes React siguiendo tokens de Obelisco
3. Pruebas de compatibilidad cross-browser (Chrome, Firefox, Safari, Edge)
4. Pruebas de accesibilidad (axe, Lighthouse)

---

## Reglas que no se negocian

1. **Obelisco como base** — usar los tokens y componentes oficiales. No reinventar.
2. **Tipografias oficiales** — Nunito para titulos, Open Sans para cuerpo. No otras.
3. **Paleta GCBA** — amarillo y azul institucionales. No inventar colores primarios.
4. **Un solo btn-primary por vista** — el amarillo es para la accion principal.
5. **Mobile-first** — diseñar desde 320px hacia arriba.
6. **WCAG 2.1 AA** — accesibilidad no es opcional.
7. **Feedback en toda accion** — ninguna accion queda sin respuesta visual.
8. **Confirmacion para destructivas** — eliminar/rechazar requiere modal.
