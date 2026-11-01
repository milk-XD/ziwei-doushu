/**
 * AI provider resolution for the locally implemented /api/* routes.
 *
 * The open source release ships no backend, so these routes are a local
 * addition (added 2026-11-01 for Muse). They talk to any
 * OpenAI-compatible chat completions endpoint, following the variable
 * names already documented in .env.example:
 *
 *   AI_PROVIDER=deepseek | mimo | openai        (default deepseek)
 *   DEEPSEEK_API_KEY=...                        (base https://api.deepseek.com, model deepseek-chat)
 *   MIMO_API_KEY=... MIMO_BASE_URL=... MIMO_MODEL=...
 *   OPENAI_API_KEY=... OPENAI_BASE_URL=... OPENAI_MODEL=...
 *
 * Generic overrides win over per-provider defaults when set:
 *   AI_API_KEY, AI_BASE_URL, AI_MODEL
 */

export interface AiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string; keyEnv: string; baseEnv: string; modelEnv: string }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    keyEnv: 'DEEPSEEK_API_KEY',
    baseEnv: 'DEEPSEEK_BASE_URL',
    modelEnv: 'DEEPSEEK_MODEL',
  },
  mimo: {
    baseUrl: '',
    model: '',
    keyEnv: 'MIMO_API_KEY',
    baseEnv: 'MIMO_BASE_URL',
    modelEnv: 'MIMO_MODEL',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
    baseEnv: 'OPENAI_BASE_URL',
    modelEnv: 'OPENAI_MODEL',
  },
};

export function resolveAiConfig(): AiConfig | null {
  const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
  const d = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.deepseek;
  const apiKey = process.env.AI_API_KEY || process.env[d.keyEnv] || '';
  const baseUrl = (process.env.AI_BASE_URL || process.env[d.baseEnv] || d.baseUrl).replace(/\/$/, '');
  const model = process.env.AI_MODEL || process.env[d.modelEnv] || d.model;
  if (!apiKey || !baseUrl || !model) return null;
  return { provider, apiKey, baseUrl, model };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Stream a chat completion from the configured OpenAI-compatible endpoint.
 * Yields plain text deltas. Throws on HTTP errors with the status included.
 */
export async function* streamChatCompletion(
  cfg: AiConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  // Transient overloads (Gemini free tier answers 503/429 in bursts) are
  // retried with backoff before any token is yielded; once streaming has
  // started, errors surface to the caller instead.
  const retryDelaysMs = [800, 2000, 4000];
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        temperature: 0.7,
      }),
      signal,
    });
    if (res.ok && res.body) break;
    const detail = await res.text().catch(() => '');
    const transient = res.status === 503 || res.status === 429;
    if (!transient || attempt >= retryDelaysMs.length) {
      throw new Error(`AI provider HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, retryDelaysMs[attempt]));
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const delta: string = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) yield delta;
      } catch { /* skip partial lines */ }
    }
  }
}

/**
 * Wrap a text-delta generator into the SSE format the shipped frontend
 * panels parse: lines of `data: {"delta":{"text":"..."}}` and a final
 * `data: [DONE]`.
 */
export function toFrontendSse(source: AsyncGenerator<string>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of source) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: delta } })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: `\n[解读中断：${msg}]` } })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export function aiNotConfiguredResponse(): Response {
  return Response.json(
    {
      error: 'ai_not_configured',
      message:
        '本地 /api 已实现，但还没有配置 AI 模型：在项目根目录 .env.local 里填 AI_PROVIDER 与对应的 API Key（如 DEEPSEEK_API_KEY），然后重启服务。',
    },
    { status: 500 },
  );
}
