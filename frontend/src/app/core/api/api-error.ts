import { HttpErrorResponse } from '@angular/common/http';

/** RFC 7807 ProblemDetails as returned by the QuickFlow API (`application/problem+json`). */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  /** Validation errors: field name (camelCase) -> messages. */
  errors?: Record<string, string[]>;
}

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

/**
 * Typed error emitted by every HttpClient call (see `apiErrorInterceptor`).
 * `status` is 0 when the server could not be reached, -1 for non-HTTP failures.
 */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string | null = null,
    readonly fieldErrors: FieldErrors = {},
    readonly traceId: string | null = null,
    readonly url: string | null = null,
  ) {
    super(detail ?? title);
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
  get isValidationError(): boolean {
    return this.status === 400;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }

  /** Messages for one field (camelCase key), or an empty array. */
  errorsFor(field: string): readonly string[] {
    return this.fieldErrors[field] ?? [];
  }
}

export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['title'] === 'string' || typeof v['status'] === 'number' || 'errors' in v;
}

/** Normalizes server field keys: `Title` -> `title`, `$.status` -> `status`. */
export function normalizeFieldKey(key: string): string {
  const stripped = key.startsWith('$.') ? key.slice(2) : key;
  return stripped.length ? stripped.charAt(0).toLowerCase() + stripped.slice(1) : stripped;
}

function normalizeFieldErrors(errors: unknown): FieldErrors {
  if (errors === null || typeof errors !== 'object') return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    const messages = Array.isArray(value) ? value.map(String) : [String(value)];
    const k = normalizeFieldKey(key);
    result[k] = [...(result[k] ?? []), ...messages];
  }
  return result;
}

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/** Converts anything thrown by HttpClient into an `ApiError`. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return new ApiError(
        0,
        'Network error',
        "Can't reach the server. Check that the QuickFlow API is running.",
        {},
        null,
        error.url,
      );
    }
    const body = parseBody(error.error);
    if (isProblemDetails(body)) {
      return new ApiError(
        body.status ?? error.status,
        body.title ?? (error.statusText || 'Request failed'),
        body.detail ?? null,
        normalizeFieldErrors(body.errors),
        body.traceId ?? null,
        error.url,
      );
    }
    return new ApiError(
      error.status,
      error.statusText || 'Request failed',
      typeof body === 'string' && body.trim() ? body : null,
      {},
      null,
      error.url,
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ApiError(-1, 'Unexpected error', message);
}
