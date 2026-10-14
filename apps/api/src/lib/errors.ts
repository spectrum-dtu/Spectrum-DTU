export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}
export const badRequest = (m: string, code?: string) => new HttpError(400, m, code)
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m)
export const forbidden = (m = 'You do not have permission to do that') => new HttpError(403, m)
export const notFound = (m = 'Not found') => new HttpError(404, m)
export const conflict = (m: string) => new HttpError(409, m)
