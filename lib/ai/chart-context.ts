/**
 * Convert a ZiweiChart (as posted by the frontend panels) into a compact,
 * faithful text brief for the AI interpreter. Only facts present in the
 * chart object are rendered, plus patterns from the repo's own detector.
 */
import { detectPatterns, getMingGongSummary } from '@/lib/ziwei/patterns';
import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import type { ZiweiChart } from '@/lib/ziwei/types';

function starText(s: { name: string; brightnessRaw?: string; siHua?: string }): string {
  return `${s.name}${s.brightnessRaw ?? ''}${s.siHua ? `(化${s.siHua})` : ''}`;
}

export function buildChartContext(chart: ZiweiChart, label = '命主'): string {
  const li = chart.lunarInfo;
  const lines: string[] = [];
  const bi = chart.birthInfo;
  lines.push(
    `${label}：${bi.gender === 'male' ? '男' : '女'}，公历 ${bi.year}-${bi.month}-${bi.day}，时辰 ${BRANCHES[bi.hour]}时` +
      (bi.city ? `，出生地 ${bi.province ?? ''}${bi.city}` : ''),
  );
  lines.push(
    `农历 ${li.lunarYear}年${li.isLeapMonth ? '闰' : ''}${Math.abs(li.lunarMonth)}月${li.lunarDay}日，生年干支 ${STEMS[li.yearStem]}${BRANCHES[li.yearBranch]}` +
      (li.fourPillars ? `，四柱(节气) ${li.fourPillars.join(' ')}` : ''),
  );
  lines.push(
    `命宫在${BRANCHES[chart.mingGongBranch]}，身宫在${BRANCHES[chart.shenGongBranch]}，${chart.wuxingJuName}，紫微在${BRANCHES[chart.ziweiPos]}，` +
      `命主 ${chart.mingZhu ?? '-'}，身主 ${chart.shenZhu ?? '-'}，${chart.yinYangGender ?? ''}，虚岁 ${chart.currentAge}`,
  );
  const summary = getMingGongSummary(chart);
  lines.push(
    `命宫主星：${summary.stars.join('、') || '空宫'}${summary.keywords.length ? `（关键词：${summary.keywords.join('、')}）` : ''}`,
  );
  lines.push('十二宫：');
  const ordered = [...chart.palaces].sort(
    (a, b) => ((chart.mingGongBranch - a.branch + 12) % 12) - ((chart.mingGongBranch - b.branch + 12) % 12),
  );
  for (const p of ordered) {
    const majors = p.stars.filter((s) => s.type === 'major').map(starText);
    const others = p.stars.filter((s) => s.type !== 'major').map(starText);
    const flags = [
      p.isShenGong ? '身宫' : '',
      p.daXianAge ? `大限 ${p.daXianAge[0]}-${p.daXianAge[1]}岁` : '',
      p.isCurrentDaXian ? '★当前大限' : '',
      p.isEmpty ? `空宫，借对宫${p.borrowedFromName ?? ''}主星 ${p.borrowedStars?.join('、') ?? ''}` : '',
    ]
      .filter(Boolean)
      .join('，');
    lines.push(
      `- ${p.name}（${STEMS[p.stem]}${BRANCHES[p.branch]}）${flags ? ` [${flags}]` : ''}：主星 ${majors.join('、') || '无'}${others.length ? `；辅星煞曜 ${others.join('、')}` : ''}`,
    );
  }
  const cur = chart.daXians[chart.currentDaXianIndex];
  if (cur) lines.push(`当前大限：${cur.startAge}-${cur.endAge}岁，${cur.palaceName}（${BRANCHES[cur.palaceBranch]}）`);
  try {
    const patterns = detectPatterns(chart);
    if (patterns.length) {
      lines.push('引擎检出格局：');
      for (const pt of patterns) lines.push(`- ${pt.name}（${pt.level}）：${pt.description}`);
    }
  } catch { /* pattern detection is best-effort context only */ }
  return lines.join('\n');
}

export const INTERPRET_SYSTEM_PROMPT = `你是一位严谨的紫微斗数命理师，依据倪海厦《天纪》紫微斗数体系解读命盘。

规则：
1. 只能依据用户给出的命盘数据（十二宫星曜、亮度、四化、大限、格局）立论，不得虚构命盘上不存在的星曜、宫位或四化。数据里没有的配置，明确说命盘未见，不要补。
2. 引用倪海厦观点时只可转述其体系立场（如命宫为本、三方四正、对宫借星、空宫借对宫主星、四化为命运之手、大限十年一运），不得编造带集数、时间码或引号的「原话」。
3. 用户消息里给了输出结构（如【命格定性】【主星解读】分节）时，严格按该结构输出；没有给结构时，先定性、再分宫论据、最后给实际建议。
4. 六亲宫（父母、兄弟、子女）按倪师自己的提醒只作较弱参考，要在相关段落里点明这一点。
5. 健康话题只谈传统命理角度的留意方向，不作医学诊断，建议以正规体检为准。
6. 结论给出倾向和依据即可，不下绝对断语；结尾一句提醒：以上为传统命理文化视角，仅供参考。
7. 用提问者使用的语言回答。中文提问用中文，术语直接用中文星名宫名；英文提问用英文，命理专名用拼音加英文括注。`;

export const HEMING_SYSTEM_PROMPT = `你是一位严谨的紫微斗数命理师，依据倪海厦《天纪》紫微斗数体系做双人合盘分析。

规则：
1. 只能依据给出的两张命盘数据立论，不得虚构任何一方不存在的星曜、宫位或四化。
2. 合盘主线：一方的夫妻宫与另一方命宫主星的呼应、两方命宫三方四正的互补或冲突、桃花星与煞曜的互动、当前大限是否同步。
3. 引用倪海厦观点时只可转述体系立场，不得编造带出处或引号的「原话」。
4. 给出契合点与摩擦点两面，不只报喜；建议要落到相处方式上，可操作。
5. 不下「必合/必分」的绝对断语；结尾一句提醒：以上为传统命理文化视角，仅供参考。
6. 用提问者使用的语言回答。中文提问用中文；英文提问用英文，命理专名用拼音加英文括注。`;
