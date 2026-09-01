export class AppError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export const notFound = (code) => new AppError(code, 404);
export const badRequest = (code) => new AppError(code, 400);
export const unauthorized = (code = 'AUTH_REQUIRED') => new AppError(code, 401);
export const forbidden = (code = 'FORBIDDEN') => new AppError(code, 403);
export const conflict = (code) => new AppError(code, 409);
