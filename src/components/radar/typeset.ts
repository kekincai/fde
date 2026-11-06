/**
 * Newspaper typesetting helpers: kanji numerals for vertical text, the dated
 * masthead line, full-width conversion for short vertical labels.
 */
import type { Article } from '../../data/articles';
import { parseDate } from './model';

const digits = '〇一二三四五六七八九';

/** Positional kanji below 100 (十三, 六), digit by digit from 100 (九八〇, 一五八). */
export function kanjiNum(value: number | undefined | null): string {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n >= 100) return String(n).split('').map((d) => digits[Number(d)]).join('');
  if (n < 10) return digits[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens > 1 ? digits[tens] : ''}十${ones ? digits[ones] : ''}`;
}

/** Digit-by-digit kanji, for years (二〇二六). */
export function kanjiDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => digits[Number(d)]);
}

/** Converts ASCII letters, digits and spaces to full width for vertical labels (ＦＤＥ, Ｐ０). */
export function zen(value: string): string {
  return value.replace(/[!-~]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).replace(/ /g, '　');
}

const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

type JstParts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number };

export function jstParts(date: Date): JstParts {
  const jst = new Date(date.getTime() + 9 * 3_600_000);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1, day: jst.getUTCDate(), weekday: jst.getUTCDay(), hour: jst.getUTCHours(), minute: jst.getUTCMinutes() };
}

/** 二〇二六年（令和八年）十一月六日　金曜日 */
export function paperDate(date = new Date(), { era = true } = {}): string {
  return `${paperDay(date, { era })}　${paperWeekday(date)}`;
}

/** 二〇二六年（令和八年）十一月六日 — the date without the weekday. */
export function paperDay(date = new Date(), { era = true } = {}): string {
  const p = jstParts(date);
  const reiwa = p.year - 2018;
  return `${kanjiDigits(p.year)}年${era ? `（令和${kanjiNum(reiwa)}年）` : ''}${kanjiNum(p.month)}月${kanjiNum(p.day)}日`;
}

/** 金曜日 */
export function paperWeekday(date = new Date()): string {
  return `${weekdays[jstParts(date).weekday]}曜日`;
}

/** 十一月六日 — for bylines inside vertical text. */
export function kanjiMonthDay(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '';
  const p = jstParts(date);
  return `${kanjiNum(p.month)}月${kanjiNum(p.day)}日`;
}

/** 11月6日 — the same for horizontal text. */
export function monthDay(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '';
  const p = jstParts(date);
  return `${p.month}月${p.day}日`;
}

/** 午前六時 / 午後二時半 — collection times inside vertical text. */
export function kanjiTime(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '収集中';
  const p = jstParts(date);
  const half = p.hour < 12 ? '午前' : '午後';
  const hour = p.hour % 12;
  return `${half}${kanjiNum(hour)}時${p.minute >= 30 ? '半' : ''}`;
}

/** 創刊: the first issue appeared on 2026-08-09 (JST). */
const founded = Date.UTC(2026, 7, 9);

export type Issue = {
  /** Noon JST of the day printed on the issue. */
  date: Date;
  /** 朝刊 (morning) or 夕刊 (evening). */
  kind: '朝刊' | '夕刊';
  /** 版: lower numbers are early editions, the highest is the 最終版. */
  han: number;
  /** 号: issues since 創刊, counted separately for 朝刊 and 夕刊. */
  number: number;
};

/**
 * Collections run at 3, 9, 15 and 21 o'clock JST and map onto a printed
 * paper's deadlines: 21時 goes into the next morning's early edition,
 * 3時 is the 朝刊 final, 9時 and 15時 are the 夕刊 early and final editions.
 */
export function issueOf(collectedAt?: Date | null, now = new Date()): Issue {
  const at = collectedAt ?? now;
  const p = jstParts(at);
  let dayOffset = 0;
  let kind: Issue['kind'];
  let han: number;
  if (p.hour >= 21) { kind = '朝刊'; han = 12; dayOffset = 1; }
  else if (p.hour < 3) { kind = '朝刊'; han = 12; }
  else if (p.hour < 9) { kind = '朝刊'; han = 14; }
  else if (p.hour < 15) { kind = '夕刊'; han = 3; }
  else { kind = '夕刊'; han = 4; }
  const day = Date.UTC(p.year, p.month - 1, p.day + dayOffset);
  return {
    date: new Date(day + 3 * 3_600_000),
    kind,
    han,
    number: Math.max(1, Math.round((day - founded) / 86_400_000) + 1)
  };
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** Pillars in reading order (Customer first). On a vertical page they are laid out right to left. */
export const pillarOrder = ['Customer', 'Build', 'Deploy', 'Govern', 'Organization'] as const;

export const pillarOrdinals = ['第一', '第二', '第三', '第四', '第五'];

/**
 * Splits a generated recommended action into at most `max` short items for
 * 「一、二、三」 lists. Falls back to the whole text as one item.
 */
export function actionItems(text: string, max = 3): string[] {
  const parts = text
    .split(/(?:\n+|(?<=[。．])\s*|(?:^|\s)[0-9０-９一二三四五][.、．)）]\s*)/u)
    .map((part) => part.replace(/^[・\-*\s]+/, '').trim())
    .filter((part) => part.length > 3);
  return (parts.length ? parts : [text.trim()]).filter(Boolean).slice(0, max);
}

/** Splits a title into a main headline and a 袖見出し at the first natural break. */
export function splitHeadline(title: string): { main: string; sub: string } {
  const match = title.match(/^(.{6,40}?)[\s　]*[：:｜|―—–\-]\s*(.{4,})$/u) ?? title.match(/^(.{6,40}?)[。！？!?]\s*(.{4,})$/u);
  if (match) return { main: match[1].trim(), sub: match[2].trim() };
  return { main: title, sub: '' };
}

/** Best-scored article first; ties go to the newest collection. */
export function byScore(a: Article, b: Article): number {
  return b.score - a.score || (b.collectedAt || '').localeCompare(a.collectedAt || '');
}
