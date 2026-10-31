import { lookupMedicine } from './adapters/reference';
import { extractProduct } from './ai/extraction';
import { analyzeRequest, type AnalyzeDependencies } from './routes/analyze';
import { apiErrorResponse } from './routes/errors';
import { referenceRequest } from './routes/reference';

export interface Env {
  ENVIRONMENT?: string;
  GEMMA_API_KEY?: string;
  GEMMA_API_URL?: string;
  REFERENCE_MODE?: 'demo' | 'authorized_live';
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createDependencies(env: Env = {}): AnalyzeDependencies {
  return {
    extractProduct: (image: Blob) =>
      extractProduct(image, {
        apiKey: env.GEMMA_API_KEY,
        apiUrl: env.GEMMA_API_URL,
      }),
    lookupMedicine: (number: string) =>
      lookupMedicine(number, {
        mode: env.REFERENCE_MODE ?? 'demo',
      }),
  };
}

export async function handleRequest(request: Request, env: Env = {}): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const deps = createDependencies(env);

  if (pathname === '/api/health') {
    if (request.method !== 'GET') {
      return withCors(new Response(null, { status: 405, headers: { Allow: 'GET' } }));
    }
    return withCors(
      Response.json({
        status: 'ok',
        service: 'counterfeitiq-api',
        environment: env.ENVIRONMENT ?? 'production',
        timestamp: new Date().toISOString(),
      }),
    );
  }

  if (pathname === '/api/analyze') {
    if (request.method !== 'POST') {
      return withCors(new Response(null, { status: 405, headers: { Allow: 'POST' } }));
    }
    const response = await analyzeRequest(request, deps);
    return withCors(response);
  }

  if (pathname.startsWith('/api/reference/')) {
    if (request.method !== 'GET') {
      return withCors(new Response(null, { status: 405, headers: { Allow: 'GET' } }));
    }
    const encodedNumber = url.pathname.slice('/api/reference/'.length);
    const response = await referenceRequest(request, encodedNumber, deps);
    return withCors(response);
  }

  return withCors(
    apiErrorResponse(
      { code: 'SERVICE_UNAVAILABLE', message: 'The requested route was not found.', retryable: false },
      404,
    ),
  );
}
