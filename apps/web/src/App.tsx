import { Routes, Route } from 'react-router-dom'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* TODO: Agregar rutas */}
      </Routes>
    </div>
  )
}

function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          SRRHH v2
        </h1>
        <p className="text-gray-600 mb-4">
          Sistema de Recursos Humanos
        </p>
        <div className="inline-block bg-primary px-4 py-2 rounded text-gray-900 font-semibold">
          Gobierno de la Ciudad de Buenos Aires
        </div>
      </div>
    </div>
  )
}

export default App
