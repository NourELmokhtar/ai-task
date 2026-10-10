import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-config';

type ParamValue = string | number | boolean;
/** Query params. `null`/`undefined` values are dropped, arrays become repeated keys. */
export type QueryParams = Record<string, ParamValue | readonly ParamValue[] | null | undefined>;

/**
 * Thin wrapper over HttpClient that prefixes the API base URL.
 * Errors arrive as `ApiError` (see `apiErrorInterceptor`). Feature API services inject this.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');

  /** `url('/api/tasks')` -> `http://localhost:5080/api/tasks` */
  url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
  }

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.get<T>(this.url(path), { params: toHttpParams(params) });
  }

  post<T>(path: string, body: unknown, params?: QueryParams): Observable<T> {
    return this.http.post<T>(this.url(path), body, { params: toHttpParams(params) });
  }

  put<T>(path: string, body: unknown, params?: QueryParams): Observable<T> {
    return this.http.put<T>(this.url(path), body, { params: toHttpParams(params) });
  }

  patch<T>(path: string, body: unknown, params?: QueryParams): Observable<T> {
    return this.http.patch<T>(this.url(path), body, { params: toHttpParams(params) });
  }

  delete<T = void>(path: string, params?: QueryParams): Observable<T> {
    return this.http.delete<T>(this.url(path), { params: toHttpParams(params) });
  }
}

export function toHttpParams(params?: QueryParams): HttpParams {
  let result = new HttpParams();
  if (!params) return result;
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value as readonly ParamValue[]) result = result.append(key, String(v));
    } else {
      result = result.set(key, String(value));
    }
  }
  return result;
}
