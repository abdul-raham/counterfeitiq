import { handleRequest, type Env } from './app';

// The Workers runtime treats every named export of the entry module as an
// entrypoint and refuses to start on anything else, so only the handler lives here.
export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    return handleRequest(request, env);
  },
};
