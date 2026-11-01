/**
 * POST /api/heming — locally implemented AI synastry (合盘) analysis.
 *
 * Contract (from app/heming/page.tsx):
 *   request:  { chartA: ZiweiChart, chartB: ZiweiChart, question?: string }
 *   response: SSE stream, lines `data: {"delta":{"text":"..."}}`,
 *             terminated by `data: [DONE]`.
 */
import { aiNotConfiguredResponse, resolveAiConfig, streamChatCompletion, toFrontendSse, type ChatMessage } from '@/lib/ai/provider';
import { buildChartContext, HEMING_SYSTEM_PROMPT } from '@/lib/ai/chart-context';
import type { ZiweiChart } from '@/lib/ziwei/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HemingBody {
  chartA?: ZiweiChart;
  chartB?: ZiweiChart;
  question?: string;
}

const DEFAULT_TASK = `请按以下结构输出合盘分析：

**【缘分定性】**
一句话概括两人的缘分格局与关系基调。

**【命宫互参】**
双方命宫主星的呼应：性格是互补、相似还是相冲，依据星曜说明。

**【夫妻宫互看】**
各自夫妻宫的主星、四化落在对方命盘上的呼应，对感情模式的影响。

**【大限同步】**
双方当前大限的走向是否同频，近十年的共同课题。

**【摩擦点】**
煞曜、化忌与桃花星带来的主要摩擦，点明宫位依据。

**【相处建议】**
具体可操作的相处与经营建议。`;

export async function POST(req: Request) {
  let body: HemingBody;
  try {
    body = (await req.json()) as HemingBody;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.chartA?.palaces || !body.chartB?.palaces) {
    return Response.json({ error: 'chartA_and_chartB_required' }, { status: 400 });
  }

  const cfg = resolveAiConfig();
  if (!cfg) return aiNotConfiguredResponse();

  const nameA = body.chartA.birthInfo.name || '甲方';
  const nameB = body.chartB.birthInfo.name || '乙方';
  const contextA = buildChartContext(body.chartA, nameA);
  const contextB = buildChartContext(body.chartB, nameB);
  const question = body.question?.trim();
  const messages: ChatMessage[] = [
    { role: 'system', content: HEMING_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `【${nameA}命盘】\n${contextA}\n\n【${nameB}命盘】\n${contextB}\n\n${question ? `用户问题：${question}\n\n请围绕这个问题做合盘分析，结构可参考：\n${DEFAULT_TASK}` : DEFAULT_TASK}`,
    },
  ];
  return toFrontendSse(streamChatCompletion(cfg, messages, req.signal));
}
