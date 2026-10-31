import { handleRequest, type Env } from './app';

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    return handleRequest(request, env);
  },
};
