/**
 * 端末をまたいだセーブの同期の、判断の部分（通信も画面も持たない）。
 * 預けたセーブには番号（rev）があり、書き換えるたびに 1 増える。端末は「最後に見た番号」と「それから手元で書き換えたか」を覚えておき、
 * この 2 つと、預けてある側のいまの番号を比べて、送るか・受け取るか・人に選ばせるかを決める。
 */
export interface SyncMeta { /** この端末が最後に見た番号 */ rev: number; /** それから手元で書き換えた */ dirty: boolean }
export interface SaveBrief { done: number; points: number; playMs: number; savedAt: number; chapter: number }
/** summary.gone：どこかの端末で、この枠を消した印（中身はない）。消したことを、ほかの端末へ伝えるために残す */
export interface CloudSave { slot: number; rev: number; at: number; device: string; bytes: number; summary: Partial<SaveBrief> & { gone?: boolean } }
export type SyncAction = 'none' | 'upload' | 'download' | 'conflict' | 'erase';

/** 中身が同じとみなせるか（達成数・研究点・遊んだ時間・保存した時刻がすべて同じ） */
export const sameSave = (a: Partial<SaveBrief> | null | undefined, b: Partial<SaveBrief> | null | undefined) =>
  !!a && !!b && a.done === b.done && a.points === b.points && a.playMs === b.playMs && a.savedAt === b.savedAt;

/**
 * 1 つの枠について、どうするかを決める。
 * local：この端末のセーブの要約（なければ null）。meta：この端末の覚え書き。cloud：預けてある側（なければ undefined）。
 */
export function syncPlan(local: Partial<SaveBrief> | null, meta: SyncMeta | undefined, cloud: CloudSave | undefined): SyncAction {
  if (!cloud) return local ? 'upload' : 'none';
  // ほかの端末で消された枠：この端末で書き換えていなければ、こちらも消す。書き換えていたら、消さずに預け直す
  if (cloud.summary.gone) return !local ? 'none' : meta && !meta.dirty && cloud.rev > meta.rev ? 'erase' : 'upload';
  if (!local) return 'download';
  if (!meta) return sameSave(local, cloud.summary) ? 'none' : 'conflict';   // 両方にあるが、つながりがわからない
  if (cloud.rev === meta.rev) return meta.dirty ? 'upload' : 'none';
  // ほかの端末が先へ進めている。手元を書き換えていなければ受け取り、書き換えていれば人に選ばせる
  if (cloud.rev > meta.rev) return meta.dirty ? 'conflict' : 'download';
  return 'conflict';                                                          // 預けた側が作り直されている
}

/** セーブの文字列を、送るために縮める。gzip が使えれば 'gz:' ＋ base64、使えなければ 'raw:' ＋ そのまま */
export async function pack(json: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return 'raw:' + json;
  const buf = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return 'gz:' + btoa(bin);
}
export async function unpack(data: string): Promise<string | null> {
  try {
    if (data.startsWith('raw:')) return data.slice(4);
    if (!data.startsWith('gz:') || typeof DecompressionStream === 'undefined') return null;
    const bin = atob(data.slice(3)), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } catch { return null; }
}
