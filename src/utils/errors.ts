export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const Forbidden = (m = "forbidden") => new HttpError(403, m);
export const NotFound = (m = "not found") => new HttpError(404, m);
export const BadRequest = (m: string, details?: unknown) =>
  new HttpError(400, m, details);
export const Conflict = (m: string) => new HttpError(409, m);
