import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Base URL of the QuickFlow API, e.g. `http://localhost:5080`. Override in tests via providers. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});
