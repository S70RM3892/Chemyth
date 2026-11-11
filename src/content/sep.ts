import { agentById, refusal, settle, settleable } from './ions';
import { extract, extractRefusal, extractable, washById } from './extract';
import { migratable, migrate, phOf } from './phoresis';

/**
 * 「混ざったものを、決めた操作で分ける」装置の共通の形。
 * 沈殿槽（金属イオンの系統分離）、分液ろうと（芳香族の抽出）、電気泳動槽（アミノ酸）は、
 * どれも 1 つ受け取って、正面（main）・右手（side）・左手（side2）へ分けて出す。違うのは、分け方の規則だけ。
 */
export type SepKind = 'settler' | 'funnel' | 'phoresis';
export const SEP_KINDS: SepKind[] = ['settler', 'funnel', 'phoresis'];
export const isSep = (k: string): k is SepKind => (SEP_KINDS as string[]).includes(k);
export interface SepOut { main: string | null; side: string | null; side2?: string | null }

/** 設定（試薬や pH）が決まっているか */
export function sepReady(kind: SepKind, setting: string | undefined): boolean {
  return kind === 'settler' ? !!agentById(setting) : kind === 'funnel' ? !!washById(setting) : phOf(setting) !== null;
}
/** その装置が扱う種類の物か */
export function sepAccepts(kind: SepKind, item: string): boolean {
  return kind === 'settler' ? settleable(item) : kind === 'funnel' ? extractable(item) : migratable(item);
}
/** いまの設定では受け取れない理由。受け取れるなら null */
export function sepRefusal(kind: SepKind, item: string, setting: string | undefined): string | null {
  if (kind === 'settler') { const a = agentById(setting); return a ? refusal(item, a) : null; }
  if (kind === 'funnel') { const a = washById(setting); return a ? extractRefusal(item, a) : null; }
  return null;
}
export function sepRun(kind: SepKind, item: string, setting: string | undefined): SepOut {
  if (kind === 'settler') { const r = settle(item, agentById(setting)!); return { main: r.liquid, side: r.solid }; }
  if (kind === 'funnel') return extract(item, washById(setting)!);
  return migrate(item, phOf(setting)!);
}
/** 出口の場所：正面・左（main）、右手・手前（side）、左手・手前（side2）。電気泳動槽だけ 3 つ使う */
export const sepSlots = (kind: SepKind): number[] => (kind === 'phoresis' ? [0, 2, 3] : [0, 2]);
/** 出口の呼び名 */
export const SEP_PORTS: Record<SepKind, string[]> = { settler: ['ろ液', '沈殿'], funnel: ['上層', '水層'], phoresis: ['残る', '陽極', '陰極'] };
