// Envolve um handler síncrono/assíncrono e encaminha erros ao middleware central.
export function wrap(handler) {
  return (request, response, next) => {
    try {
      const result = handler(request, response, next);
      if (result && typeof result.then === 'function') result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}

export function errorHandler(error, request, response, _next) {
  const status = Number.isInteger(error?.status) ? error.status : 500;

  if (status >= 500) {
    console.error(`[500] ${request.method} ${request.originalUrl}`, error);
    return response.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  if (error?.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
  const body = { error: error.code || 'ERROR' };
  if (error.reason) body.reason = error.reason;
  response.status(status).json(body);
}
