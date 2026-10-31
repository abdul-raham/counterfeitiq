import type { VisionModel } from '../../api/src/ai/extraction';
import { AnalysisApiError } from '../../api/src/routes/errors';

/** One vision-capable model. Add a provider here; the rest of the service stays the same. */
export interface VisionProvider {
  readonly name: string;
  readonly model: string;
  complete(prompt: string, imageDataUri: string): Promise<string>;
}

export interface WorkersAiOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
}

const RATE_LIMIT_PATTERN = /\b(?:429|3036|3040|4006)\b|rate limit|too many requests|capacity|daily free allocation/i;
const MAX_ATTEMPTS = 2;

function failed(kind: string, error: AnalysisApiError): AnalysisApiError {
  // Provider errors and replies stay out of logs: only the classification is recorded.
  console.error('inference_failed', { kind });
  return error;
}

function replyText(result: unknown): string {
  const choice = (result as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] } | null)
    ?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim() || choice?.finish_reason === 'length') {
    throw failed('empty_or_truncated', new AnalysisApiError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'The vision model returned an invalid response. Please try again.',
      retryable: true,
    }));
  }
  return content;
}

export function workersAiProvider(ai: VisionModel, model: string, options: WorkersAiOptions = {}): VisionProvider {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retryDelayMs = options.retryDelayMs ?? 500;

  async function once(prompt: string, imageDataUri: string): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(failed('timeout', new AnalysisApiError({
        code: 'MODEL_TIMEOUT',
        message: 'The vision model timed out. Please try again.',
        retryable: true,
      }))), timeoutMs);
    });
    try {
      return await Promise.race([
        ai.run(model, {
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageDataUri } },
            ],
          }],
          max_tokens: 1800,
          temperature: 0,
          // With thinking on, the model spends the whole token budget on reasoning.
          chat_template_kwargs: { enable_thinking: false },
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: 'cloudflare-workers-ai',
    model,
    async complete(prompt, imageDataUri) {
      for (let attempt = 1; ; attempt += 1) {
        try {
          return replyText(await once(prompt, imageDataUri));
        } catch (error) {
          // A timed-out call is not cancelled, and a malformed reply repeats at
          // temperature 0, so only a provider fault is worth paying for twice.
          if (error instanceof AnalysisApiError) throw error;
          if (RATE_LIMIT_PATTERN.test(String(error))) {
            throw failed('rate_limited', new AnalysisApiError({
              code: 'RATE_LIMITED',
              message: 'The vision model is rate-limited. Please try again shortly.',
              retryable: true,
            }));
          }
          if (attempt >= MAX_ATTEMPTS) {
            throw failed('provider_error', new AnalysisApiError({
              code: 'SERVICE_UNAVAILABLE',
              message: 'The vision model is temporarily unavailable.',
              retryable: true,
            }));
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    },
  };
}
