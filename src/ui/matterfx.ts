import { caption, collectCaption, dHCaption, processCaption } from '../content/captions';
import { BURNER, hexRgb, PLUMES, reactionLookById } from '../content/looks';
import { recipeById } from '../content/recipes';
import { G as glowOfT, whiteHotHex } from '../content/spectra';
import { sub } from '../content/substances';

/**
 * 物質の見え方のうち、描き方に依らない決まり（tests/matter.test.ts で確かめる）。
 * - 光るのは自分で光るものだけ（SPEC2 D6）：燃える反応の炎、熱で光る物（黒体の色）、加熱のバーナーの青い炎。物質の色（液や気体の色）を光にしない
 * - 稼働中の装置の出口から出すのは、気体の生成物だけ（溶けて液に残る I₂ などは出さない）。燃える反応の白煙（P₄O₁₀）は出す
 * - 選んだ装置の札の説明：絵に見えているもののわけ（指示薬・燃える炎・熱で光る温度・青いバーナー・集め方）と ΔH
 */

const gasState = (id: string) => { try { return sub(id).state === 'gas'; } catch { return false; } };
/** 煙として描ける物質か：気体か、煙の表（白煙・霧）にあるもの */
export const plumeable = (id: string) => !!PLUMES[id] || gasState(id);

/** 選んだ装置の札の説明（2 行まで）：絵に見えているもののわけ、ΔH */
const notesMemo = new Map<string, string[]>();
export function plateNotes(id: string): string[] {
  const hit = notesMemo.get(id);
  if (hit) return hit;
  const L = reactionLookById(id), out: string[] = [];
  if (L) {
    const g = L.T !== undefined ? glowOfT(L.T) : 0;
    const seen = L.indicator ? caption(L.indicator.caption)
      : L.burn?.caption ? caption(L.burn.caption)
      : id === 'copper-oxide' ? caption('noBurn:Cu')
      : id === 'molten-nacl' ? caption('moltenNaCl')
      : !L.burn && g > 0 ? processCaption(id)?.text ?? ''
      : L.heat && !L.burn ? caption('burner')
      : collectCaption(id)?.text ?? '';
    if (seen) out.push(seen);
    const dh = dHCaption(id);
    if (dh) out.push(dh.text);
  }
  notesMemo.set(id, out);
  return out;
}
/** 稼働中の装置の出口から出る気体（気体の生成物か、白煙・霧の表にある生成物。発熱の大きい反応は湯気）。熱い出口か */
const exhaustMemo = new Map<string, { id: string; hot: boolean } | null>();
export function exhaustOf(recipe: string | undefined): { id: string; hot: boolean } | null {
  if (!recipe) return null;
  if (exhaustMemo.has(recipe)) return exhaustMemo.get(recipe)!;
  const L = reactionLookById(recipe), r = recipeById(recipe);
  let out: { id: string; hot: boolean } | null = null;
  if (L && r) {
    const hot = L.heat || !!L.burn || !!L.exo || (L.T !== undefined && glowOfT(L.T) > 0);
    // 気体の生成物（溶けて液に残る I₂ などは出さない）。燃える反応の白煙（P₄O₁₀）は出す
    const id = r.outputs.map(([s2]) => s2).find((s2) => s2 !== 'e' && (gasState(s2) || (!!L.burn && !!PLUMES[s2]?.white)));
    out = id ? { id, hot } : L.exo ? { id: 'H2O', hot: true } : null;
  }
  exhaustMemo.set(recipe, out);
  return out;
}

/**
 * 自分で光るもの：燃える反応の炎、熱で光る物（黒体の色）、加熱のバーナーの青い炎。shimmer は上の空気のゆらぎの強さ
 * （燃える・熱で光る・発熱の大きい反応だけ）
 */
export function emissionOf(recipe: string | undefined): { rgb: string; a: number; shimmer: number } | null {
  const L = reactionLookById(recipe);
  if (!L) return null;
  if (L.burn) return { rgb: hexRgb(L.burn.flame), a: L.burn.bed ? 0.4 : 0.45, shimmer: 0.85 };
  const g = L.T !== undefined ? glowOfT(L.T) : 0;
  if (g > 0) return { rgb: hexRgb(whiteHotHex(L.T!)), a: 0.15 + 0.4 * g, shimmer: 0.85 };
  if (L.heat) return { rgb: hexRgb(BURNER.inner), a: 0.15, shimmer: 0.5 };
  if (L.exo) return { rgb: '0,0,0', a: 0, shimmer: 0.5 };
  return null;
}
