/**
 * Muse local CLI for ziwei-doushu (added locally on install, not upstream).
 *
 * Usage (run from the repo root ~/workspace/skills/ziwei-doushu):
 *   npx tsx scripts/muse/ziwei.ts chart --date 1990-01-01 --time 08:30 --gender male [--city 深圳] [--province 广东省] [--longitude 114.05] [--name 张三] [--json]
 *   npx tsx scripts/muse/ziwei.ts chart --date 1990-01-01 --shichen 午 --gender female
 *   npx tsx scripts/muse/ziwei.ts chart --date 1990-01-01 --unknown-time --gender male
 *   npx tsx scripts/muse/ziwei.ts search --query 紫微 [--limit 10]
 *
 * Rules that matter (from upstream code, do not reinvent):
 * - generateChart() takes BirthInfo.hour as a branch index 0-11 (子=0 ... 亥=11), never a clock hour.
 * - Clock time is converted with upstream formToBirthInfo() in lib/ziwei/share.ts:
 *   true-solar branch from longitude (offset = (longitude - 120) * 4 minutes, no equation-of-time),
 *   and 23:00-23:59 (晚子时) advances the chart date by one day while 00:00-00:59 stays on the same day.
 * - Unknown time charts at 子时 (branch 0), matching the upstream form.
 */
import { generateChart } from '../../lib/ziwei/algorithm';
import { detectPatterns, getMingGongSummary } from '../../lib/ziwei/patterns';
import { formToBirthInfo } from '../../lib/ziwei/share';
import { PROVINCES } from '../../lib/ziwei/cities';
import { BRANCHES, STEMS, SHICHEN } from '../../lib/ziwei/constants';
import { searchClassics } from '../../lib/classics/index';
import type { BirthInfo } from '../../lib/ziwei/types';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

function parseGender(v: unknown): 'male' | 'female' {
  const s = String(v ?? '').trim().toLowerCase();
  if (['male', 'm', '男', '男性'].includes(s)) return 'male';
  if (['female', 'f', '女', '女性'].includes(s)) return 'female';
  fail(`--gender must be male/female (or 男/女), got: ${v}`);
}

function parseShichen(v: unknown): number {
  const s = String(v ?? '').trim().replace(/时$/, '');
  const idx = BRANCHES.indexOf(s);
  if (idx >= 0) return idx;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 0 && n <= 11) return n;
  fail(`--shichen must be a branch name (子..亥) or index 0-11, got: ${v}`);
}

function lookupCity(city: string): { province: string; city: string; longitude: number } | null {
  const hits: { province: string; city: string; longitude: number }[] = [];
  for (const p of PROVINCES) {
    for (const c of p.cities) {
      if (c.name === city) hits.push({ province: p.name, city: c.name, longitude: c.longitude });
    }
  }
  if (hits.length === 0) {
    for (const p of PROVINCES) {
      for (const c of p.cities) {
        if (c.name.includes(city) || city.includes(c.name)) hits.push({ province: p.name, city: c.name, longitude: c.longitude });
      }
    }
  }
  if (hits.length === 0) return null;
  if (hits.length > 1) console.error(`WARN: city "${city}" matched ${hits.length} entries, using first: ${hits[0].province} ${hits[0].city} (${hits[0].longitude}E)`);
  return hits[0];
}

function starText(s: { name: string; brightnessRaw?: string; siHua?: string }): string {
  return `${s.name}${s.brightnessRaw ?? ''}${s.siHua ? `[化${s.siHua}]` : ''}`;
}

function runChart(args: Record<string, string | boolean>) {
  const dateStr = String(args.date ?? '');
  const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) fail('--date must be YYYY-MM-DD (Gregorian / 公历), e.g. --date 1990-01-01');
  const [, ys, ms, ds] = m;
  const gender = parseGender(args.gender);
  const name = typeof args.name === 'string' ? args.name : undefined;

  let province = typeof args.province === 'string' ? args.province : '';
  let city = typeof args.city === 'string' ? args.city : '';
  let longitude = typeof args.longitude === 'string' ? Number(args.longitude) : 120;
  if (typeof args.longitude === 'string' && !Number.isFinite(longitude)) fail(`--longitude is not a number: ${args.longitude}`);
  if (city) {
    const hit = lookupCity(city);
    if (!hit) fail(`--city not found in lib/ziwei/cities.ts PROVINCES: ${city}. Pass --longitude instead.`);
    province = province || hit.province;
    city = hit.city;
    if (typeof args.longitude !== 'string') longitude = hit.longitude;
  }

  let birthInfo: BirthInfo;
  let inputNote: string;
  if (args['unknown-time'] === true) {
    birthInfo = formToBirthInfo({
      name: name ?? '', year: ys, month: ms, day: ds,
      clockHour: '8', clockMinute: '0', unknownTime: true,
      province, city, longitude, gender,
    } as never);
    inputNote = '时辰不详，按子时起盘（上游表单口径）';
  } else if (typeof args.shichen === 'string') {
    const branch = parseShichen(args.shichen);
    birthInfo = {
      year: Number(ys), month: Number(ms), day: Number(ds),
      hour: branch, gender, name,
      province: province || undefined, city: city || undefined,
      longitude: province ? longitude : undefined,
    };
    inputNote = `直接指定时辰 ${BRANCHES[branch]}时 (branch ${branch})，不做真太阳时/晚子时换日`;
  } else if (typeof args.time === 'string') {
    const tm = args.time.match(/^(\d{1,2}):(\d{2})$/);
    if (!tm) fail('--time must be HH:MM (24h clock time), e.g. --time 08:30');
    birthInfo = formToBirthInfo({
      name: name ?? '', year: ys, month: ms, day: ds,
      clockHour: tm[1], clockMinute: tm[2], unknownTime: false,
      province, city, longitude, gender,
    } as never);
    inputNote = `钟表时间 ${args.time}，经度 ${longitude}E 经上游 formToBirthInfo 换算（真太阳时经度差 + 晚子时次日）`;
  } else {
    fail('give one of --time HH:MM, --shichen <子..亥|0-11>, or --unknown-time');
  }

  let chart;
  try { chart = generateChart(birthInfo!); }
  catch (e) { fail((e as Error).message); }

  const patterns = detectPatterns(chart!);
  const mingSummary = getMingGongSummary(chart!);

  if (args.json === true) {
    console.log(JSON.stringify({ inputNote, birthInfo: chart!.birthInfo, chart: chart!, patterns, mingSummary }, null, 2));
    return;
  }

  const c = chart!;
  const li = c.lunarInfo;
  const lines: string[] = [];
  lines.push(`紫微斗数命盘${name ? ` · ${name}` : ''}`);
  lines.push(`输入: 公历 ${ys}-${ms.padStart(2, '0')}-${ds.padStart(2, '0')} · ${gender === 'male' ? '男' : '女'}${city ? ` · ${province} ${city} (经度 ${longitude}E)` : ''}`);
  lines.push(`排盘口径: ${inputNote}`);
  lines.push(`实际排盘日: ${c.birthInfo.year}-${String(c.birthInfo.month).padStart(2, '0')}-${String(c.birthInfo.day).padStart(2, '0')} · 时辰 ${BRANCHES[c.birthInfo.hour]}时 (${SHICHEN[c.birthInfo.hour].range})`);
  lines.push(`农历: ${li.lunarYear}年 ${li.isLeapMonth ? '闰' : ''}${Math.abs(li.lunarMonth)}月 ${li.lunarDay}日 · 生年 ${STEMS[li.yearStem]}${BRANCHES[li.yearBranch]}`);
  if (li.fourPillars) lines.push(`四柱(节气): ${li.fourPillars.join(' / ')}`);
  if (li.fourPillarsLunar) lines.push(`四柱(农历): ${li.fourPillarsLunar.join(' / ')}`);
  lines.push(`命宫 ${BRANCHES[c.mingGongBranch]} · 身宫 ${BRANCHES[c.shenGongBranch]} · ${c.wuxingJuName} · 紫微在${BRANCHES[c.ziweiPos]}`);
  lines.push(`命主 ${c.mingZhu ?? '-'} · 身主 ${c.shenZhu ?? '-'} · ${c.yinYangGender ?? ''} · 虚岁 ${c.currentAge} · 当前大限 ${c.currentDaXianIndex >= 0 && c.daXians[c.currentDaXianIndex] ? `${c.daXians[c.currentDaXianIndex].startAge}-${c.daXians[c.currentDaXianIndex].endAge}岁 ${c.daXians[c.currentDaXianIndex].palaceName}` : '未知'}`);
  lines.push(`命宫主星: ${mingSummary.stars.join('、') || '空宫'}${mingSummary.keywords.length ? ` · 关键词 ${mingSummary.keywords.join('、')}` : ''}`);
  lines.push('');
  lines.push('十二宫 (命宫起逆时针):');
  const ordered = [...c.palaces].sort((a, b) => ((c.mingGongBranch - a.branch + 12) % 12) - ((c.mingGongBranch - b.branch + 12) % 12));
  for (const p of ordered) {
    const majors = p.stars.filter(s => s.type === 'major').map(starText);
    const others = p.stars.filter(s => s.type !== 'major').map(starText);
    const flags = [
      p.isMingGong ? '命宫' : '',
      p.isShenGong ? '身宫' : '',
      p.daXianAge ? `大限${p.daXianAge[0]}-${p.daXianAge[1]}` : '',
      p.isCurrentDaXian ? '当前大限' : '',
      p.isEmpty ? `空宫借对宫${p.borrowedFromName ?? ''}(${p.borrowedStars?.join('、') ?? ''})` : '',
    ].filter(Boolean).join(' · ');
    lines.push(`- ${p.name} [${STEMS[p.stem]}${BRANCHES[p.branch]}]${flags ? ` (${flags})` : ''}: 主星 ${majors.join('、') || '无'}${others.length ? ` | 辅煞 ${others.join('、')}` : ''}`);
  }
  lines.push('');
  lines.push('大限:');
  for (const dx of c.daXians) lines.push(`- ${dx.startAge}-${dx.endAge}岁 · ${dx.palaceName} (${BRANCHES[dx.palaceBranch]})`);
  lines.push('');
  lines.push(`格局 (${patterns.length}):`);
  if (patterns.length === 0) lines.push('- 无 (detectPatterns 未检出)');
  for (const pt of patterns) lines.push(`- ${pt.name} [${pt.level}] ${pt.description}${pt.source ? ` (${pt.source})` : ''}`);
  console.log(lines.join('\n'));
}

function runSearch(args: Record<string, string | boolean>) {
  const q = typeof args.query === 'string' ? args.query : '';
  if (!q) fail('--query is required, e.g. --query 紫微');
  const limit = typeof args.limit === 'string' ? Number(args.limit) : 10;
  const hits = searchClassics(q, Number.isFinite(limit) && limit > 0 ? limit : 10);
  if (args.json === true) { console.log(JSON.stringify(hits, null, 2)); return; }
  if (hits.length === 0) { console.log(`古籍原文无命中: ${q}`); return; }
  for (const h of hits as unknown as Record<string, unknown>[]) {
    console.log(JSON.stringify(h));
  }
}

const cmd = process.argv[2];
const args = parseArgs(process.argv.slice(3));
if (cmd === 'chart') runChart(args);
else if (cmd === 'search') runSearch(args);
else {
  console.error('Usage: ziwei.ts chart --date YYYY-MM-DD (--time HH:MM | --shichen 子..亥 | --unknown-time) --gender male|female [--city 城市] [--province 省] [--longitude 120] [--name 姓名] [--json]');
  console.error('       ziwei.ts search --query 关键词 [--limit 10] [--json]');
  process.exit(2);
}
