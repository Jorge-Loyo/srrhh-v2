import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError('Usuario o contraseña incorrectos')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header institucional */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center font-primary font-bold text-sm">
            BA
          </div>
          <span className="font-primary font-bold text-gray-800">Gobierno de la Ciudad de Buenos Aires</span>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md w-full max-w-sm p-8">
          <h1 className="font-primary text-2xl font-bold text-gray-900 mb-1">SRRHH v2</h1>
          <p className="text-sm text-gray-500 mb-6">Sistema de Recursos Humanos</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Usuario <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                placeholder="usuario"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Contraseña <span className="text-danger">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="btn-primary w-full h-10">
              {isLoading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
