# Contrato de Frontend — SRRHH v2

> Define la arquitectura, estructura, convenciones y reglas del cliente web.
> Última actualización: 2026-09
> Estado: BORRADOR — en revisión

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
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   │   └── useAuth.ts
│   │   │   └── pages/
│   │   │       └── LoginPage.tsx
│   │   ├── personas/
│   │   │   ├── components/
│   │   │   │   ├── PersonaTable.tsx
│   │   │   │   ├── PersonaDetail.tsx
│   │   │   │   └── PersonaFilters.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── usePersonas.ts      ← TanStack Query hooks
│   │   │   │   └── usePersona.ts
│   │   │   ├── api/
│   │   │   │   └── personas.api.ts     ← Funciones de fetch
│   │   │   └── pages/
│   │   │       └── PersonasPage.tsx
│   │   ├── padron/
│   │   ├── cargos/
│   │   ├── concursos-cph/
│   │   ├── concursos-ceetps/
│   │   ├── bajas/
│   │   └── kpis/
│   ├── shared/
│   │   ├── components/
│   │   │   ├── ui/                 ← Componentes shadcn/ui (copiados)
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx    ← Layout principal (sidebar + header)
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Header.tsx
│   │   │   └── common/
│   │   │       ├── DataTable.tsx   ← Tabla genérica reutilizable
│   │   │       ├── PageHeader.tsx
│   │   │       ├── Spinner.tsx
│   │   │       ├── EmptyState.tsx
│   │   │       └── ErrorBoundary.tsx
│   │   ├── hooks/
│   │   │   ├── useDebounce.ts
│   │   │   └── usePagination.ts
│   │   ├── lib/
│   │   │   ├── api-client.ts       ← Instancia Axios con interceptors
│   │   │   ├── query-client.ts     ← Configuración TanStack Query
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

### Query keys

Las query keys son arrays tipados. Se definen en el archivo `api` del módulo:

```typescript
// personas/api/personas.api.ts
export const personasKeys = {
  all: ['personas'] as const,
  list: (filters: PersonaFilters) => ['personas', 'list', filters] as const,
  detail: (id: string) => ['personas', 'detail', id] as const,
}
```

### Hooks de lectura

```typescript
// personas/hooks/usePersonas.ts
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
export function useUpdatePersona() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePersonaDto) => updatePersona(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: personasKeys.all })
    },
  })
}
```

---

## Formularios — convenciones

Todos los formularios usan React Hook Form + Zod:

```typescript
const schema = z.object({
  cuil: z.string().length(11, 'CUIL debe tener 11 dígitos'),
  apellido_nombre: z.string().min(2).max(200),
})

type FormData = z.infer<typeof schema>

function PersonaForm() {
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
// app/router.tsx
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/padron" /> },
      { path: 'padron', element: <PadronPage /> },
      { path: 'personas', element: <PersonasPage /> },
      { path: 'personas/:id', element: <PersonaDetailPage /> },
      { path: 'cargos', element: <CargosPage /> },
      { path: 'concursos/cph', element: <ConcursosCphPage /> },
      { path: 'concursos/cph/:id', element: <ConcursoCphDetailPage /> },
      { path: 'concursos/ceetps', element: <ConcursosCeetpsPage /> },
      { path: 'bajas', element: <BajasPage /> },
      { path: 'kpis', element: <KpisPage /> },
      { path: 'admin/usuarios', element: <UsuariosPage /> },
    ],
  },
  { path: '/login', element: <LoginPage /> },
])
```

### Protección de rutas

```typescript
// Wrapper que verifica autenticación y rol
function ProtectedRoute({ roles }: { roles?: Rol[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" />
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" />
  return <Outlet />
}
```

---

## Componentes — convenciones

### Nomenclatura

| Tipo | Convención | Ejemplo |
|---|---|---|
| Páginas | `{Nombre}Page.tsx` | `PersonasPage.tsx` |
| Componentes | PascalCase | `PersonaTable.tsx` |
| Hooks | `use{Nombre}.ts` | `usePersonas.ts` |
| API functions | `{recurso}.api.ts` | `personas.api.ts` |
| Types/DTOs | `{recurso}.types.ts` | `personas.types.ts` |

### Props tipadas siempre

```typescript
// Bien
interface PersonaTableProps {
  personas: Persona[]
  loading: boolean
  onSelect: (id: string) => void
}

// Mal — nunca
function PersonaTable(props: any) { ... }
```

### Componentes pequeños y enfocados

- Un componente hace una sola cosa
- Si un componente supera ~150 líneas, dividirlo
- Los componentes de página orquestan — los componentes hoja renderizan

---

## Diseño responsive

La app debe funcionar en desktop y mobile. Breakpoints Tailwind:

| Breakpoint | Ancho | Uso |
|---|---|---|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Desktop wide |

**Regla:** diseñar mobile-first. El layout base es para mobile, los breakpoints agregan complejidad para pantallas más grandes.

El sidebar colapsa a un drawer en mobile. Las tablas tienen scroll horizontal en mobile.

---

## Cliente HTTP

```typescript
// shared/lib/api-client.ts
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,   // para cookies de refresh token
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
