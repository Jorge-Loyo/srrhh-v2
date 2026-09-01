export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SNAPSHOT_PENDIENTE'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError('VALIDATION_ERROR', message, 400, details)
  }

  static unauthorized(message = 'No autorizado') {
    return new AppError('UNAUTHORIZED', message, 401)
  }

  static forbidden(message = 'Sin permisos para esta acción') {
    return new AppError('FORBIDDEN', message, 403)
  }

  static notFound(message: string) {
    return new AppError('NOT_FOUND', message, 404)
  }

  static conflict(message: string, details?: unknown) {
    return new AppError('CONFLICT', message, 409, details)
  }

  static snapshotPendiente() {
    return new AppError('SNAPSHOT_PENDIENTE', 'Hay un snapshot pendiente de aprobación', 409)
  }
}
