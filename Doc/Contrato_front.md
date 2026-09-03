# Contrato de Frontend — SRRHH v2

> Define la arquitectura, estructura, convenciones y reglas del cliente web.
> Última actualización: 2026-09 (Post-Sprint 12 — UX bajas, wizard CPH, permisos UI)
> Estado: VIGENTE

---

## Stack

| Tecnología | Versión | Rol |
|---|---|---|
| React | 18 | UI |
| TypeScript | 5.x | Lenguaje |
| Vite | 5.x | Build tool |
| Tailwind CSS | 3.x | Estilos |
| shadcn/ui | latest | Componentes base |
| TanStack Query | v5 | Estado servidor (fetching, cache) |
| React Router | v7 | Routing |
| React Hook Form | 7.x | Formularios |
| Zod | 3.x | Validación de formularios |
| Axios | 1.x | Cliente HTTP |
| jsPDF | latest | Generación de PDF en el browser |
| xlsx (SheetJS) | latest | Exportación a Excel |

---

## Estructura de carpetas

```
apps/web/
├── src/
│   ├── app/
│   │   ├── router.tsx              ← Definición de rutas
│   │   ├── providers.tsx           ← QueryClient, AuthProvider, etc.
│   │   └── App.tsx
│   ├── modules/                    ← Un módulo por dominio (espeja el backend)
│   │   ├── auth/
│   │   │   ├── hooks/
│   │   │   │   └── useAuth.ts
│   │   │   └── pages/
│   │   │       └── LoginPage.tsx
│   │   ├── personas/
│   │   │   ├── components/
│   │   │   │   ├── PersonaTable.tsx
│   │   │   │   ├── PersonaDetailPanel.tsx
│   │   │   │   └── PersonaFilters.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── usePersonas.ts
│   │   │   │   └── usePersona.ts
│   │   │   └── pages/
│   │   │       └── PersonasPage.tsx
│   │   ├── cargos/
│   │   │   ├── components/
│   │   │   │   └── CargoDetailPanel.tsx
│   │   │   ├── hooks/
│   │   │   └── pages/
│   │   │       ├── CargosPage.tsx
│   │   │       ├── AltaCargosPage.tsx
│   │   │       ├── BajaCargosPage.tsx
│   │   │       └── AltaPorBajaPage.tsx
│   │   ├── padron/
│   │   │   ├── hooks/
│   │   │   │   └── usePadron.ts
│   │   │   └── pages/
│   │   │       ├── PadronPage.tsx
│   │   │       └── PadronDiffPage.tsx
│   │   ├── concursos-cph/
│   │   │   ├── components/
│   │   │   │   ├── SubEstadoTimeline.tsx
│   │   │   │   └── AlertasSinMovimiento.tsx
│   │   │   └── pages/
│   │   │       ├── ConcursosCphPage.tsx
│   │   │       └── ConcursoCphDetail.tsx
│   │   ├── concursos-ceetps/
│   │   │   └── pages/
│   │   │       ├── ConcursosCeetpsPage.tsx
│   │   │       └── ConcursoCeetpsDetail.tsx
│   │   ├── bajas/
│   │   │   └── pages/
│   │   │       ├── BajasPage.tsx
│   │   │       └── ValidacionBajasPage.tsx
│   │   ├── inicio/
│   │   │   └── pages/
│   │   │       └── InicioPage.tsx
│   │   ├── notificaciones/
│   │   │   ├── hooks/
│   │   │   │   └── useNotificaciones.ts
│   │   │   └── pages/
│   │   │       └── NotificacionesPage.tsx
│   │   ├── configuracion/
│   │   │   └── pages/
│   │   │       └── ConfiguracionPermisosPage.tsx
│   │   ├── kpis/
│   │   │   └── pages/
│   │   │       └── KpisPage.tsx
│   │   └── admin/
│   │       └── pages/
│   │           └── AdminUsuariosPage.tsx
│   ├── shared/
│   │   ├── components/
│   │   │   ├── ui/                 ← Componentes shadcn/ui (copiados)
│   │   │   │   └── SearchableSelect.tsx  ← Combobox con filtro en vivo
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Header.tsx
│   │   │   └── common/
│   │   │       ├── DataTable.tsx
│   │   │       ├── PageHeader.tsx
│   │   │       ├── Spinner.tsx
│   │   │       ├── EmptyState.tsx
│   │   │       └── ErrorBoundary.tsx
│   │   ├── hooks/
│   │   │   ├── useDebounce.ts
│   │   │   ├── usePagination.ts
│   │   │   └── useCatalogos.ts     ← useHospitales, useEscalafones, usePuestosCargos
│   │   ├── lib/
│   │   │   ├── api-client.ts       ← Instancia Axios con interceptors
│   │   │   ├── query-client.ts     ← Configuración TanStack Query
│   │   │   ├── exportExcel.ts      ← fetchAllPages() + downloadExcel() con SheetJS
│   │   │   ├── escalafonLabel.ts   ← escalafonLabel() — "Médicos" → "CPH", etc.
│   │   │   └── utils.ts
│   │   └── types/                  ← Re-exporta desde packages/types
│   └── main.tsx
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Arquitectura de módulos

Cada módulo sigue el mismo patrón de 3 capas:

```
Page  →  Hook (TanStack Query)  →  API function  →  api-client (Axios)
 │              │
 │        (cache, loading,
 │         error, refetch)
 │
Components reciben datos como props — no hacen fetch directamente
```

**Regla:** ningún componente hace fetch con `useEffect`. Todo pasa por un hook de TanStack Query.

---

## TanStack Query — convenciones

### staleTime global

`staleTime: 0` en `main.tsx` — cada navegación hace fetch fresco. `refetchOnWindowFocus: false`.

```typescript
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: false, retry: 1 } },
})
```

### Query keys

Las query keys son arrays tipados. Se definen en el archivo de hooks del módulo:

```typescript
export const personasKeys = {
  all: ['personas'] as const,
  list: (filters: PersonaFilters) => ['personas', 'list', filters] as const,
  detail: (id: string) => ['personas', 'detail', id] as const,
}
```

### Hooks de lectura

```typescript
export function usePersonas(filters: PersonaFilters) {
  return useQuery({
    queryKey: personasKeys.list(filters),
    queryFn: () => fetchPersonas(filters),
    staleTime: 1000 * 60 * 5,  // 5 minutos
  })
}
```

### Hooks de escritura

```typescript
export function useUpdateConcursoCph() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: PatchConcursoCphRequest) => patchConcursoCph(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: concursosCphKeys.all })
    },
  })
}
```

---

## Formularios — convenciones

Todos los formularios usan React Hook Form + Zod:

```typescript
const schema = z.object({
  hospitalId: z.string().uuid(),
  fechaBaja: z.string().min(1),
})

type FormData = z.infer<typeof schema>

function BajaForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  // ...
}
```

**Regla:** el schema Zod del formulario debe ser compatible con el DTO del backend (definido en `packages/types`).

---

## Routing

```typescript
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <InicioPage /> },
      { path: 'padron', element: <PadronPage /> },
      { path: 'padron/:id/diff', element: <PadronDiffPage /> },
      { path: 'personas', element: <PersonasPage /> },
      { path: 'personas/:id', element: <PersonaDetailPanel /> },
      { path: 'cargos', element: <CargosPage /> },
      { path: 'cargos/:id', element: <CargoDetailPanel /> },
      { path: 'cargos/alta', element: <AltaCargosPage /> },
      { path: 'cargos/baja', element: <BajaCargosPage /> },
      { path: 'cargos/baja/nueva', element: <NuevaBajaPage /> },
      { path: 'cargos/baja/:id/editar', element: <NuevaBajaPage /> },
      { path: 'cargos/alta-por-baja', element: <AltaPorBajaPage /> },
      { path: 'concursos/cph', element: <ConcursosCphPage /> },
      { path: 'concursos/cph/nuevo/wizard', element: <ConcursoCphWizard /> },
      { path: 'concursos/cph/:id/wizard', element: <ConcursoCphWizard /> },
      { path: 'concursos/ceetps', element: <ConcursosCeetpsPage /> },
      { path: 'concursos/ceetps/:id', element: <ConcursoCeetpsDetail /> },
      { path: 'bajas', element: <BajasPage /> },
      { path: 'bajas/validacion', element: <ValidacionBajasPage /> },
      { path: 'bajas-consolidadas', element: <BajasConsolidasPage /> },
      { path: 'bajas-consolidadas/:snapshotId', element: <BajasSialDiffPage /> },
      { path: 'kpis', element: <KpisPage /> },
      { path: 'notificaciones', element: <NotificacionesPage /> },
      { path: 'admin/usuarios', element: <AdminUsuariosPage /> },
      { path: 'configuracion/permisos', element: <ConfiguracionPermisosPage /> },
      { path: 'sin-acceso', element: <SinAccesoPage /> },
    ],
  },
  { path: '/login', element: <LoginPage /> },
])
```

### Protección de rutas

```typescript
function ProtectedRoute({ roles }: { roles?: Rol[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" />
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" />
  return <Outlet />
}
```

### Filtros persistentes en URL

Las páginas de listado (`PersonasPage`, `CargosPage`, `ConcursosCphPage`) usan `useSearchParams` en vez de `useState` para los filtros — todos los filtros viven en la URL como query params. Al navegar al detalle y volver, los filtros se restauran desde `location.state.from`.

---

## Componentes — convenciones

### Nomenclatura

| Tipo | Convención | Ejemplo |
|---|---|---|
| Páginas | `{Nombre}Page.tsx` | `PersonasPage.tsx` |
| Componentes | PascalCase | `PersonaDetailPanel.tsx` |
| Hooks | `use{Nombre}.ts` | `usePersonas.ts` |
| Types/DTOs | desde `packages/types` | — |

### Props tipadas siempre

```typescript
interface PersonaDetailPanelProps {
  personaId: string
  onClose: () => void
}
// Nunca: function PersonaDetailPanel(props: any)
```

### Componentes pequeños y enfocados

- Un componente hace una sola cosa
- Si un componente supera ~150 líneas, dividirlo
- Los componentes de página orquestan — los componentes hoja renderizan

---

## Hooks compartidos

### `useCatalogos.ts`

Centraliza los hooks de catálogos usados en múltiples módulos:

```typescript
useHospitales()                          // GET /api/v1/hospitales
useEscalafones()                         // GET /api/v1/escalafones
usePuestosCargos(escalafonId?, hospitalId?)  // GET /api/v1/cargos/puestos
```

### `useDebounce.ts`

Debounce de 300ms para inputs de búsqueda. Evita una request por tecla.

### `exportExcel.ts`

- `fetchAllPages(url, filters)` — pagina en bloques de 1000 contra el endpoint de listado
- `downloadExcel(rows, filename)` — genera `.xlsx` con SheetJS y dispara la descarga

---

## Componentes compartidos notables

### `SearchableSelect`

Combobox genérico: input + lista filtrada en vivo al escribir. Normaliza acentos con `normalize('NFD')` para que "medico" encuentre "Médico". Usado en los selectores de puesto (276 opciones en `/personas`, 62 en CPH).

### `SubEstadoTimeline`

Barra de progreso segmentada sobre `subEstado3` (8 etapas) en `ConcursoCphDetail`. Desierto se muestra como banner rojo separado. Suspendido atenúa la barra entera.

### `AlertasSinMovimiento`

Panel en `ConcursosCphPage`. Umbrales acumulativos 30+/60+/90+ días desde `updatedAt`. Solo alerta concursos `no_iniciado`/`activo`. Calcula buckets client-side paginando con `fetchAllPages`.

---

## Diseño responsive

La app debe funcionar en desktop y mobile. Breakpoints Tailwind:

| Breakpoint | Ancho | Uso |
|---|---|---|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Desktop wide |

El sidebar colapsa a un drawer en mobile. Las tablas tienen scroll horizontal en mobile.

---

## Cliente HTTP

```typescript
// shared/lib/api-client.ts
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
})

// Interceptor: agrega el access token a cada request
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Interceptor: refresca el token si recibe 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await refreshToken()
      return apiClient(error.config)
    }
    return Promise.reject(error)
  }
)
```

---

## Variables de entorno

```bash
VITE_API_URL="http://localhost:3000"
```

Solo se exponen variables con prefijo `VITE_`. Nunca credenciales en el frontend.

---

## Reglas que no se negocian

1. **TypeScript estricto** — `strict: true`. Sin `any`.
2. **Sin fetch en useEffect** — todo pasa por TanStack Query.
3. **Sin lógica de negocio en componentes** — va en hooks o en el backend.
4. **Props tipadas** — ningún componente acepta `props: any`.
5. **shadcn/ui primero** — antes de crear un componente custom, verificar si shadcn/ui ya lo tiene.
6. **Zod en formularios** — ningún formulario sin validación de schema.
7. **Mobile-first** — el diseño base es para mobile.
8. **Filtros en URL** — las páginas de listado usan `useSearchParams`, no `useState`, para que los filtros sean compartibles y sobrevivan la navegación.
9. **Exportación paginada** — el export a Excel usa `fetchAllPages()`, no el resultado visible en pantalla.
