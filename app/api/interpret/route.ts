/**
 * POST /api/interpret — locally implemented AI chart interpretation.
 *
 * Contract (from components/ChatPanel.tsx and components/InsightPanel.tsx):
 *   request:  { chart: ZiweiChart, messages: [{ role, content }] }
 *   response: SSE stream, lines `data: {"delta":{"text":"..."}}`,
 *             terminated by `data: [DONE]`.
 *   A 404 is treated by the frontend as "API not implemented", so real
 *   failures here use 400/500 on purpose.
 */
import { aiNotConfiguredResponse, resolveAiConfig, streamChatCompletion, toFrontendSse, type ChatMessage } from '@/lib/ai/provider';
import { buildChartContext, INTERPRET_SYSTEM_PROMPT } from '@/lib/ai/chart-context';
import type { ZiweiChart } from '@/lib/ziwei/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface InterpretBody {
  chart?: ZiweiChart;
  messages?: { role: 'user' | 'assistant'; content: string }[];
}

export async function POST(req: Request) {
  let body: InterpretBody;
  try {
    body = (await req.json()) as InterpretBody;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.chart || !Array.isArray(body.chart.palaces)) {
    return Response.json({ error: 'chart_required' }, { status: 400 });
  }
  const history = (body.messages ?? []).filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim(),
  );
  if (history.length === 0) {
    return Response.json({ error: 'messages_required' }, { status: 400 });
  }

  const cfg = resolveAiConfig();
  if (!cfg) return aiNotConfiguredResponse();

  const chartContext = buildChartContext(body.chart);
  const messages: ChatMessage[] = [
    { role: 'system', content: `${INTERPRET_SYSTEM_PROMPT}\n\n【命盘数据】\n${chartContext}` },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];
  return toFrontendSse(streamChatCompletion(cfg, messages, req.signal));
}
