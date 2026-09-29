/**
 * Errors carry a stable `code` that the mobile app translates (errors.<CODE>),
 * plus an English fallback message.
 */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code: string, message?: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Authentication required') =>
  new AppError(401, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'You are not allowed to do this') =>
  new AppError(403, code, message);
export const notFound = (code = 'NOT_FOUND', message = 'Resource not found') => new AppError(404, code, message);
export const conflict = (code: string, message?: string) => new AppError(409, code, message);
