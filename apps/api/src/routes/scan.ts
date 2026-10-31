import { apiErrorResponse, unexpectedApiErrorResponse } from './errors';

export interface IntelligenceService {
  url?: string;
  /** Server-side only. The browser never sees this token or the service address. */
  token?: string;
  fetch?: typeof fetch;
}

const TIMEOUT_MS = 15_000;

async function forward(service: IntelligenceService, path: string, init: RequestInit = {}): Promise<Response> {
  if (!service.url || !service.token) {
    return apiErrorResponse({ code: 'SERVICE_UNAVAILABLE', message: 'Product scanning is not configured.', retryable: false });
  }
  const send = service.fetch ?? ((input, options) => fetch(input, options));
  try {
    const response = await send(`${service.url.replace(/\/+$/, '')}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${service.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return apiErrorResponse({ code: 'SERVICE_UNAVAILABLE', message: 'Product scanning is temporarily unavailable.', retryable: true });
    }
    return Response.json(await response.json());
  } catch {
    return unexpectedApiErrorResponse();
  }
}

export function scanRequest(request: Request, url: URL, service: IntelligenceService): Promise<Response> | Response {
  const identifier = url.searchParams.get('identifier')?.trim();
  if (!identifier || identifier.length > 256) {
    return apiErrorResponse({ code: 'SERVICE_UNAVAILABLE', message: 'A barcode value is required.', retryable: false }, 400);
  }
  const deviceId = request.headers.get('X-Scan-Device')?.trim();
  return forward(service, '/resolve-identifier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, ...(deviceId && deviceId.length >= 8 && deviceId.length <= 100 ? { deviceId } : {}) }),
  });
}

export function sourceStatusRequest(service: IntelligenceService): Promise<Response> {
  return forward(service, '/source-status');
}
