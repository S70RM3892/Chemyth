import { describe, expect, it } from 'vitest';
import { BURNER, hexRgb, LOOKS, reactionLook } from '../src/content/looks';
import { RECIPES } from '../src/content/recipes';
import { G, whiteHotHex } from '../src/content/spectra';
import { sub } from '../src/content/substances';
import { emissionOf, exhaustOf, plateNotes } from '../src/ui/matterfx';

// 物質の見え方の決まり（SPEC2 §6.M M5・M12・M13・M15、D6）
describe('光るのは自分で光るものだけ', () => {
  it('どの反応の光も、炎・黒体・バーナーの色だけ。物質の色（LOOKS の色）を光にしない', () => {
    const matter = new Set(Object.values(LOOKS).map((l) => hexRgb(l.hex)));
    for (const r of RECIPES) {
      const em = emissionOf(r.id), L = reactionLook(r);
      if (!em || em.a === 0) continue;
      const allowed = [L.burn ? hexRgb(L.burn.flame) : '', L.T !== undefined ? hexRgb(whiteHotHex(L.T)) : '', hexRgb(BURNER.inner)];
      expect(allowed, r.id).toContain(em.rgb);
      if (!L.burn && !(L.T !== undefined && G(L.T) > 0)) expect(matter.has(em.rgb), r.id).toBe(false);
    }
  });
  it('熱で光らない温度（ハーバー・ボッシュ法 500 ℃）は光らない。融解塩の電解（801 ℃）は黒体の色で光る', () => {
    expect(emissionOf('haber-bosch')).toBeNull();
    expect(emissionOf('molten-nacl')!.rgb).toBe(hexRgb(whiteHotHex(801)));
    expect(emissionOf('sulfur-burn')!.rgb).toBe(hexRgb('#4a6bff'));
    // 熱するだけの反応は、バーナーの青い炎（赤っぽい炎は不完全燃焼）
    expect(emissionOf('copper-oxide')!.rgb).toBe(hexRgb(BURNER.inner));
  });
});

describe('稼働中の装置の出口から出るもの', () => {
  it('出すのは気体の生成物か、燃える反応の白煙だけ', () => {
    for (const r of RECIPES) {
      const x = exhaustOf(r.id);
      if (!x) continue;
      const L = reactionLook(r);
      const gas = (() => { try { return sub(x.id).state === 'gas'; } catch { return false; } })();
      expect(gas || (!!L.burn && x.id === 'P4O10') || (!!L.exo && x.id === 'H2O'), `${r.id} → ${x.id}`).toBe(true);
    }
  });
  it('水溶液の中で生じる I₂ は、蒸気として出さない。HI の分解（熱した気体の中）も I₂ は固体の扱いなので H₂ を出す', () => {
    expect(exhaustOf('h2o2-ki')).toBeNull();
    expect(exhaustOf('hi-decomp')!.id).toBe('H2');
    expect(exhaustOf('ostwald-1')!.id).toBe('NO');
    expect(exhaustOf('p4-burn')).toEqual({ id: 'P4O10', hot: true });
    expect(exhaustOf('slaking')).toEqual({ id: 'H2O', hot: true });
  });
});

describe('選んだ装置の札の説明', () => {
  it('絵に見えているもののわけを先に、ΔH をあとに出す', () => {
    expect(plateNotes('sulfur-burn')).toEqual(['硫黄は青い炎を出して燃え、SO₂ になる', 'S(斜方) + O₂(気) → SO₂(気)　ΔH = −297 kJ']);
    expect(plateNotes('molten-nacl')[0]).toBe('赤く光るのは高温のため（融解した NaCl そのものは無色）');
    expect(plateNotes('neutralize-acetate')[0]).toBe('フェノールフタレインを加えてある（塩基性で赤）');
    expect(plateNotes('copper-oxide')[0]).toBe('銅は炎を出さずに酸化され、表面が黒い CuO になる');
    expect(plateNotes('lime-kiln')[0]).toBe('約 900 ℃：熱で光っている（約 525 ℃から赤く見え始める）');
    // 熱しない反応には、バーナーの文を出さない
    expect(plateNotes('haber-bosch')).toEqual(['N₂(気) + 3H₂(気) → 2NH₃(気)　ΔH = −92 kJ']);
  });
});
