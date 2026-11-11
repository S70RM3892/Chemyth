import { describe, expect, it } from 'vitest';
import { DRILLS, checkStep, inspectDrill, mulberry32, type Drill, type DrillStep } from '../src/content/drills';

const SEEDS = 200;
const UNITS = ['b31', 'b32', 'b33', 'b34', 'c11', 'c12', 'c13', 'c14', 'c15', 'c21', 'c22', 'c23', 'c24', 'c25', 'c26', 'c42', 'c44', 'c45'];
const R = 8.31e3;
const F = 9.65e4;
const NA = 6.02e23;

/** 相対誤差で比べる */
function near(actual: number, expected: number, rel = 1e-9): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(Math.abs(expected) * rel, 1e-12));
}

/**
 * ある生成器を SEEDS 個の種で回し、数値を答える小問の答え・元の数値・ドリル・数値の小問を渡す。
 * 式を選ぶ小問（choices）は a と num に入れない。
 */
function each(id: string, fn: (a: number[], p: Record<string, number>, d: Drill, num: DrillStep[]) => void): void {
  for (let seed = 0; seed < SEEDS; seed++) {
    const { drill, params } = inspectDrill(id, mulberry32(seed));
    const num = drill.steps.filter((s) => !s.choices);
    fn(num.map((s) => s.answer), params, drill, num);
  }
}

/**
 * x が 2ᵃ × 3ᵇ × 10ᶜ の形なら、log₁₀2 = 0.30、log₁₀3 = 0.48 だけで出した log₁₀x を返す。
 * そう書けないなら null（与えた対数の値では手計算できない）。
 */
function tableLog(x: number): number | null {
  let best: number | null = null;
  let cost = Infinity;
  for (let a = -10; a <= 10; a++) {
    for (let b = -8; b <= 8; b++) {
      const c = Math.log10(x / (2 ** a * 3 ** b));
      if (Math.abs(c - Math.round(c)) < 1e-7 && Math.abs(a) + Math.abs(b) < cost) {
        cost = Math.abs(a) + Math.abs(b);
        best = 0.3 * a + 0.48 * b + Math.round(c);
      }
    }
  }
  return best;
}

/** pH の小問が、与えた対数の値だけで許容範囲に届くか。q は 10^(−2·pH)（平方根が入っても 2・3・5 で表せる量） */
function reachable(step: DrillStep): void {
  const lg = tableLog(10 ** (-2 * step.answer));
  expect(lg).not.toBeNull();
  expect(checkStep(step, -(lg as number) / 2)).toBe(true);
}

describe('ドリル：共通', () => {
  it('20 個以上あり、id が重複せず、単元 id が正しい', () => {
    expect(DRILLS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(DRILLS.map((g) => g.id)).size).toBe(DRILLS.length);
    for (const g of DRILLS) {
      expect(UNITS).toContain(g.unit);
      expect([1, 2, 3]).toContain(g.level);
      expect(g.title.length).toBeGreaterThan(0);
    }
  });

  it('指定された 18 単元のうち 14 以上をカバーする', () => {
    expect(new Set(DRILLS.map((g) => g.unit)).size).toBeGreaterThanOrEqual(14);
  });

  it('mulberry32 は種で決まり、[0,1) に収まる', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    let differs = false;
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x !== c()) differs = true;
    }
    expect(differs).toBe(true);
  });

  it('checkStep は相対許容誤差で判定する', () => {
    const s: DrillStep = { text: 't', answer: 200, unit: '', how: 'h' };
    expect(checkStep(s, 200)).toBe(true);
    expect(checkStep(s, 203.9)).toBe(true);
    expect(checkStep(s, 196.1)).toBe(true);
    expect(checkStep(s, 204.1)).toBe(false);
    expect(checkStep(s, 195.9)).toBe(false);
    expect(checkStep(s, NaN)).toBe(false);
    expect(checkStep({ ...s, tol: 0.05 }, 209)).toBe(true);
    expect(checkStep({ ...s, answer: -136 }, -136)).toBe(true);
    expect(checkStep({ ...s, answer: -136 }, 136)).toBe(false);
    expect(checkStep({ ...s, answer: 0 }, 0)).toBe(true);
    expect(checkStep({ ...s, answer: 0 }, 0.01)).toBe(false);
  });

  for (const g of DRILLS) {
    it(`${g.id}：${SEEDS} 個の種で形が整っている`, () => {
      const variants = new Set<string>();
      for (let seed = 0; seed < SEEDS; seed++) {
        const d = g.make(mulberry32(seed));
        expect(d.id).toBe(g.id);
        expect(d.title).toBe(g.title);
        expect(d.unit).toBe(g.unit);
        expect(d.steps.length).toBeGreaterThanOrEqual(4);
        expect(d.steps.length).toBeLessThanOrEqual(7);
        const texts = [d.intro, ...d.steps.flatMap((s) => [s.text, s.how, s.unit, ...(s.choices ?? [])])];
        for (const t of texts) {
          expect(typeof t).toBe('string');
          expect(t).not.toMatch(/NaN|undefined|Infinity|null|\[object/);
          // 生の浮動小数（0.30000000000000004 など）や JS の指数表記が文に出ていない
          expect(t).not.toMatch(/\d\.\d{7,}/);
          expect(t).not.toMatch(/\de[+-]?\d/);
        }
        expect(d.intro.length).toBeGreaterThan(20);
        for (const s of d.steps) {
          expect(s.text.length).toBeGreaterThan(0);
          expect(s.how.length).toBeGreaterThan(0);
          expect(Number.isFinite(s.answer)).toBe(true);
          if (s.choices) {
            // 選択式：4 つの異なる選択肢、答えは 0〜3 の番号、単位なし
            expect(s.choices.length).toBe(4);
            expect(new Set(s.choices).size).toBe(4);
            for (const c of s.choices) expect(c.length).toBeGreaterThan(0);
            expect(Number.isInteger(s.answer)).toBe(true);
            expect(s.answer).toBeGreaterThanOrEqual(0);
            expect(s.answer).toBeLessThan(4);
            expect(s.unit).toBe('');
            expect(s.tol).toBeUndefined();
            for (let i = 0; i < 4; i++) expect(checkStep(s, i)).toBe(i === s.answer);
            expect(checkStep(s, s.answer + 0.01)).toBe(false);
          }
          if (s.tol !== undefined) {
            expect(s.tol).toBeGreaterThan(0);
            expect(s.tol).toBeLessThanOrEqual(0.05);
          }
          // a×10ⁿ の形で答えさせるときは、文にも同じ指数が書いてある
          if (s.unit.startsWith('×10')) expect(s.text).toContain(s.unit.split(' ')[0]);
          expect(checkStep(s, s.answer)).toBe(true);
          expect(checkStep(s, s.answer * 1.1 + 1)).toBe(false);
        }
        // 同じ種なら同じ問題
        expect(g.make(mulberry32(seed))).toEqual(d);
        expect(inspectDrill(g.id, mulberry32(seed)).drill).toEqual(d);
        variants.add(d.intro);
      }
      // 数値がちゃんと変わる
      expect(variants.size).toBeGreaterThanOrEqual(5);
    });

    it(`${g.id}：途中の答えを有効数字 3 桁に丸めて進んでも許容範囲に入る`, () => {
      for (let seed = 0; seed < SEEDS; seed++) {
        const exact = g.make(mulberry32(seed));
        const chained = inspectDrill(g.id, mulberry32(seed), true).drill;
        expect(chained.intro).toBe(exact.intro);
        exact.steps.forEach((s, i) => {
          const v = chained.steps[i].answer;
          expect(checkStep(s, v)).toBe(true);
          expect(checkStep(s, Number(v.toPrecision(3)))).toBe(true);
        });
      }
    });
  }
});

describe('ドリル：化学としての検算', () => {
  it('n2o4-kp：解離度は 0〜1、Kp は 4α²P/(1−α²) と一致し、ルシャトリエの原理に従う', () => {
    const KP: Record<number, number> = { 300: 1.7e4, 320: 7.2e4, 340: 2.6e5 };
    each('n2o4-kp', ([n2, alpha, pNO2, kp, alpha2, V2], p) => {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
      expect(alpha2).toBeGreaterThan(0);
      expect(alpha2).toBeLessThan(1);
      near(n2 * 1e-2, p.n0 * (1 + alpha));
      near(pNO2 * 1e4, ((2 * alpha) / (1 + alpha)) * p.P);
      near(kp * 1e4, (4 * alpha * alpha * p.P) / (1 - alpha * alpha));
      near(kp * 1e4, (4 * alpha2 * alpha2 * p.P2) / (1 - alpha2 * alpha2));
      // 現実の Kp に近い（与えた全圧を 3 桁に丸めたぶんだけずれる）
      near(kp * 1e4, KP[p.T], 0.15);
      if (p.P2 > p.P) expect(alpha2).toBeLessThan(alpha);
      else expect(alpha2).toBeGreaterThan(alpha);
      near(p.P2 * V2, p.n0 * (1 + alpha2) * R * p.T);
      // 圧力を上げたら体積は減る
      expect((V2 - p.V) * (p.P2 - p.P)).toBeLessThan(0);
    });
  });

  it('vapor-n2-water：高温ではすべて気体、低温では一部が液体で、水の質量が保存される', () => {
    each('vapor-n2-water', ([pwHi, PHi, pwHyp, nv, liq, PLo], p) => {
      expect(pwHi * 1e4).toBeLessThan(p.vpH);
      expect(pwHyp * 1e4).toBeGreaterThan(p.vpL);
      expect(liq).toBeGreaterThan(0);
      expect(liq).toBeLessThan(p.mw);
      near(liq + 18 * nv, p.mw);
      near(nv, (p.vpL * p.V) / (R * p.TL));
      // 窒素の分圧だけ見ればシャルルの法則（体積一定で T に比例）
      near(PLo * 1e4 - p.vpL, ((PHi - pwHi) * 1e4 * p.TL) / p.TH);
      near((PHi - pwHi) * 1e4, (p.nN * R * p.TH) / p.V);
      expect(PLo).toBeLessThan(PHi);
      near(pwHyp / pwHi, p.TL / p.TH);
    });
  });

  it('weak-acid-titration：pH は単調に上がり、厳密解とほぼ一致し、与えた対数で届く', () => {
    each('weak-acid-titration', ([Ve, pH0, pHhalf, pHq, pHe, pHx], p, _d, num) => {
      near(p.c * p.V, p.cb * Ve);
      for (const x of [pH0, pHhalf, pHq, pHe, pHx]) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(14);
      }
      expect(pH0).toBeLessThan(Math.min(pHhalf, pHq));
      expect(Math.max(pHhalf, pHq)).toBeLessThan(pHe);
      expect(pHe).toBeGreaterThan(7);
      expect(pHe).toBeLessThan(pHx);
      if (p.frac < 0.5) expect(pHq).toBeLessThan(pHhalf);
      else expect(pHq).toBeGreaterThan(pHhalf);
      near(pHhalf, -Math.log10(p.Ka));
      // 近似なしの二次方程式 h² + Ka·h − Ka·c = 0
      const h = (-p.Ka + Math.sqrt(p.Ka * p.Ka + 4 * p.Ka * p.c)) / 2;
      expect(Math.abs(pH0 - -Math.log10(h))).toBeLessThan(0.02);
      // 中和点：加水分解 x²/(cs − x) = Kw/Ka
      const kb = 1e-14 / p.Ka;
      const oh = (-kb + Math.sqrt(kb * kb + 4 * kb * p.cs)) / 2;
      expect(Math.abs(pHe - (14 + Math.log10(oh)))).toBeLessThan(0.01);
      // 中和点の塩の濃度
      near(p.cs, (p.c * p.V) / (p.V + Ve));
      // 過剰の NaOH
      near(10 ** (pHx - 14), (p.cb * p.x) / (p.V + Ve + p.x));
      num.slice(1).forEach(reachable);
    });
  });

  it('ksp-mohr：溶解度積を満たし、AgCl が先に沈殿する', () => {
    each('ksp-mohr', ([a1, a2, a3, a4, vt, mg], p) => {
      near(a1 * 1e-9 * p.c1, p.K1);
      near((a2 * 1e-5) ** 2 * p.c2, p.K2);
      near(a3 * 1e-6 * a2 * 1e-5, p.K1);
      expect(a1 * 1e-9).toBeLessThan(a2 * 1e-5);
      near((a4 * 1e-3) / 100, (a3 * 1e-6) / p.c1);
      // 残る Cl⁻ は 0.1 % 未満
      expect(a4 * 1e-3).toBeLessThan(0.1);
      near(vt * p.cAg, p.c1 * p.vs);
      expect(vt).toBeGreaterThanOrEqual(5);
      expect(vt).toBeLessThanOrEqual(40);
      near(mg / 143.5, p.c1 * p.vs);
    });
  });

  it('metal-crystal：充填率は fcc 74 %、bcc 68 %、密度は実測値に近い', () => {
    const DENS: Record<number, number> = { 63.5: 8.96, 27: 2.7, 108: 10.5, 197: 19.3, 23: 0.97, 55.8: 7.87, 39.1: 0.86 };
    each('metal-crystal', ([Z, cn, r, n22, rho, fill], p) => {
      expect(Z).toBe(p.fcc ? 4 : 2);
      expect(cn).toBe(p.fcc ? 12 : 8);
      near(fill, p.fcc ? 74.05 : 68.02, 2e-4);
      // 最近接原子間距離 2r
      near(2 * r, p.fcc ? p.a / Math.SQRT2 : (Math.sqrt(3) * p.a) / 2);
      const vol = (p.a * 1e-8) ** 3;
      near(n22 * 1e22 * vol, Z);
      near(rho, (Z * p.M) / (NA * vol));
      near(rho, DENS[p.M], 0.02);
      near(fill / 100, (Z * (4 / 3) * Math.PI * r ** 3) / p.a ** 3);
    });
  });

  it('ionic-crystal：密度は実測値に近く、半径比は限界半径比より大きい', () => {
    const DENS: Record<number, number> = { 58.5: 2.16, 74.6: 1.99, 40.3: 3.58, 25.9: 2.64, 168.4: 3.99, 212.8: 4.44, 259.8: 4.51 };
    each('ionic-crystal', ([Z, cn, d, rc, rho, lim], p) => {
      expect(Z).toBe(p.rock ? 4 : 1);
      expect(cn).toBe(p.rock ? 6 : 8);
      near(lim, p.rock ? 0.4142 : 0.7321, 1e-4);
      near(d, p.rock ? p.a / 2 : (Math.sqrt(3) * p.a) / 2);
      near(rc + p.ra, d);
      expect(rc).toBeGreaterThan(0);
      expect(rc / p.ra).toBeGreaterThan(lim);
      near(rho, (Z * p.M) / (NA * (p.a * 1e-8) ** 3));
      near(rho, DENS[p.M], 0.015);
    });
  });

  it('series-electrolysis：どの極でも電子の物質量が一致する', () => {
    each('series-electrolysis', ([a1, cu, ag, o2, pH, cCu], p, _d, num) => {
      const ne = a1 * 1e-2;
      near(ne * F, p.I * p.t);
      near((cu / 63.5) * 2, ne);
      near(ag / 108, ne);
      near((o2 / 22400) * 4, ne);
      near(10 ** -pH * p.Vs, ne);
      near((p.c0 - cCu) * p.Vs * 2, ne);
      expect(cCu).toBeGreaterThan(0);
      // Ag⁺ が足りている
      expect(p.c0 * p.Vs).toBeGreaterThan(ne);
      expect(pH).toBeGreaterThan(0);
      expect(pH).toBeLessThan(7);
      reachable(num[4]);
    });
  });

  it('lead-acid：電子 2 mol あたり負極 +96 g、正極 +64 g、合計 160 g で、電解液の減少と一致する', () => {
    each('lead-acid', ([ne, neg, pos, acid, water, w1], p) => {
      near(ne * F, p.I * p.t);
      near((neg / ne) * 2, 96);
      near((pos / ne) * 2, 64);
      near(((neg + pos) / ne) * 2, 160);
      // PbSO₄ 303、Pb 207、PbO₂ 239
      near((neg / ne) * 2, 303 - 207);
      near((pos / ne) * 2, 303 - 239);
      near(acid / 98, ne);
      near(water / 18, ne);
      // 質量保存：電極が増えたぶん電解液が減る
      near(acid - water, neg + pos);
      near(w1, (((p.m0 * p.w0) / 100 - 98 * ne) / (p.m0 - 80 * ne)) * 100);
      expect(w1).toBeGreaterThan(0);
      expect(w1).toBeLessThan(p.w0);
    });
  });

  it('fuel-cell：効率は 2FE ÷ 286 kJ で、水素の量によらない', () => {
    each('fuel-cell', ([ne, q4, t3, en, heat, eff], p) => {
      near(ne, (2 * p.vH) / 22.4);
      near(q4 * 1e4, ne * F);
      near(en * 1000, p.E * p.I * t3 * 1e3);
      near(heat, (286 * p.vH) / 22.4);
      near(eff, ((2 * F * p.E) / 286000) * 100);
      expect(eff).toBeGreaterThan(30);
      expect(eff).toBeLessThan(60);
    });
  });

  it('combustion-enthalpy：燃焼エンタルピーは文献値に近く、熱量と酸素の量が合う', () => {
    const LIT = [-890, -1561, -2219, -1411, -1300];
    const CH: [number, number][] = [[1, 4], [2, 6], [3, 8], [2, 4], [2, 2]];
    each('combustion-enthalpy', ([dA, dB, Q, dT, o2], p) => {
      near(dA, LIT[p.ia], 0.003);
      near(dB, LIT[p.ib], 0.003);
      expect(dA).toBeLessThan(0);
      expect(dB).toBeLessThan(0);
      near(p.nA + p.nB, p.V / 22.4);
      near(p.nA * p.rb, p.nB * p.ra);
      near(Q, -(p.nA * dA + p.nB * dB));
      near(dT * 4.18 * p.mw * 1000, Q * 1000 * (p.eta / 100));
      expect(dT).toBeGreaterThanOrEqual(10);
      expect(dT).toBeLessThanOrEqual(60);
      // O 原子の数：O₂ = CO₂ + H₂O/2
      const [ac, ah] = CH[p.ia];
      const [bc, bh] = CH[p.ib];
      near(o2 / 22.4, p.nA * ac + p.nB * bc + (p.nA * ah + p.nB * bh) / 4);
    });
  });

  it('bond-energy-nh3：求めた結合エネルギーで ΔH を逆算すると元に戻る', () => {
    each('bond-energy-nh3', ([dH, brk, ENH, ENNs, heat], p) => {
      expect(dH).toBe(-92);
      near(brk, p.ENN + 3 * p.EHH);
      near(p.ENN + 3 * p.EHH - 6 * ENH, -92);
      near(p.ENN + 2 * p.EHH - (ENNs + 4 * ENH), 95);
      expect(ENH).toBeGreaterThan(385);
      expect(ENH).toBeLessThan(395);
      // N–N 単結合は 160 kJ/mol 前後
      expect(ENNs).toBeGreaterThan(145);
      expect(ENNs).toBeLessThan(175);
      near(heat, ((p.vH / 22.4) * 92) / 3);
    });
  });

  it('hess-carbon-cycle：昇華エンタルピーと結合エネルギーが生成エンタルピーを再現する', () => {
    each('hess-carbon-cycle', ([atom, subl, ECC, ECd, dHyd, heat], p) => {
      near(atom, 4 * p.ECH);
      near(subl + 2 * p.EHH - 4 * p.ECH, -75);
      near(2 * subl + 3 * p.EHH - (ECC + 6 * p.ECH), -84);
      near(2 * subl + 2 * p.EHH - (ECd + 4 * p.ECH), 52);
      // 生成エンタルピーの差と一致
      near(dHyd, -84 - 52);
      // プロパンの生成エンタルピーの見積もりは 2 × (−84) − (−75) = −93（実測 −105 に近い）
      near(3 * subl + 4 * p.EHH - (2 * ECC + 8 * p.ECH), -93);
      expect(subl).toBeGreaterThan(700);
      expect(subl).toBeLessThan(730);
      expect(ECC).toBeGreaterThan(320);
      expect(ECC).toBeLessThan(340);
      expect(ECd).toBeGreaterThan(570);
      expect(ECd).toBeLessThan(610);
      expect(ECd).toBeLessThan(2 * ECC);
      near(heat, (136 * p.vE) / 22.4);
    });
  });

  it('first-order-h2o2：k は厳密な一次反応の式とほぼ一致し、半減期ごとに半分になる', () => {
    each('first-order-h2o2', ([a1, a2, half, cn, o2, a6], p) => {
      const k = a2 * 1e-2;
      near(a1 * 1e-2 * p.t1, p.c0 - p.c1);
      near(k, Math.log(p.c0 / p.c1) / p.t1, 0.005);
      near(half, Math.log(2) / k, 0.001);
      near(cn, p.c0 * Math.exp(-k * p.nh * half), 0.001);
      near(cn, p.c0 / 2 ** p.nh);
      near((o2 / 22400) * 2, ((p.c0 - cn) * p.vmL) / 1000);
      near(a6 * 1e-3, k * cn);
      // 濃度が下がったので速度も下がっている
      expect(a6 * 1e-3).toBeLessThan(a1 * 1e-2);
    });
  });

  it('freezing-electrolyte：分子量と電離度が、問題を作った元の値に戻る', () => {
    each('freezing-electrolyte', ([mol1, M, mForm, i, alpha], p) => {
      near(mol1 * 1.85, p.dt1);
      near(M, p.MX, 0.015);
      near(mForm, p.y / p.Mel / (p.W / 1000));
      expect(i).toBeGreaterThan(1);
      expect(i).toBeLessThan(p.nu);
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
      expect(Math.abs(alpha - p.alphaTrue)).toBeLessThan(0.03);
      // 粒子の数から直接：Δt = Kf × m × (1 + (ν − 1)α)
      near(1.85 * mForm * (1 + (p.nu - 1) * alpha), p.dt2);
    });
  });

  it('freezing-dimer：会合度が元の値に戻り、粒子の数が合う', () => {
    each('freezing-dimer', ([kf, mp, Mapp, beta, a5], p) => {
      near(kf, 5.12, 0.01);
      expect(beta).toBeGreaterThan(0);
      expect(beta).toBeLessThan(1);
      expect(Math.abs(beta - p.betaTrue)).toBeLessThan(0.03);
      expect(Mapp).toBeGreaterThan(60);
      expect(Mapp).toBeLessThan(120);
      const n0 = p.y / 60;
      // 単量体 + 二量体 = 粒子の総数
      near(n0 * (1 - beta) + a5 * 1e-3, (mp * p.W) / 1000);
      // 酢酸分子の数の保存
      near(n0 * (1 - beta) + 2 * a5 * 1e-3, n0);
      near(mp * kf, p.dt2);
    });
  });

  it('osmotic-polymer：分子量が元の値に戻る', () => {
    each('osmotic-polymer', ([a1, a2, deg, h, a5, a6], p) => {
      const V = p.vmL / 1000;
      near(a2 * 1e4, p.Mtrue, 0.01);
      near(a1 * 1e-4 * R * p.T, p.Pi);
      near(deg * 44, a2 * 1e4);
      near(h * 98, p.Pi);
      near(a5 * 1e5, (p.x / 180 / V) * R * p.T);
      near(a6 * 1e-4, 1.85 * a1 * 1e-4);
      // グルコースなら浸透圧は 100 倍以上
      expect((a5 * 1e5) / p.Pi).toBeGreaterThan(100);
    });
  });

  it('henry-co2：気体部分と水中の CO₂ の和が、入れた量に等しい', () => {
    each('henry-co2', ([a1, P1, a3, P2, mass, pct], p) => {
      near(a1 * 1e-2, (1e5 * p.Vg) / (R * p.T));
      near((P1 * 1e5 * p.Vg) / (R * p.T) + p.k * p.Vw * P1, p.n);
      near((P2 * 1e5 * p.Vg2) / (R * p.T) + p.k * p.Vw * P2, p.n);
      near(a3 * 1e-2, p.k * p.Vw * P1);
      near(mass / 44, p.k * p.Vw * P2);
      near(pct, ((mass / 44) / p.n) * 100);
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThan(100);
      // ボイルの法則どおりにはならない（溶解平衡が動く）
      if (p.Vg2 > p.Vg) {
        expect(P2).toBeLessThan(P1);
        expect(P2).toBeGreaterThan((P1 * p.Vg) / p.Vg2);
      } else {
        expect(P2).toBeGreaterThan(P1);
        expect(P2).toBeLessThan((P1 * p.Vg) / p.Vg2);
      }
    });
  });

  it('buffer-acetate：酸で下がり塩基で上がるが、純水よりずっと変化が小さい', () => {
    each('buffer-acetate', ([a1, pH, pHA, pHB, pHW, a6], p, _d, num) => {
      const pKa = -Math.log10(p.Ka);
      near(pH, pKa + Math.log10(p.b / p.a));
      near(a1 * 1e-5, 10 ** -pH);
      near(pHA, pKa + Math.log10((p.b - p.x) / (p.a + p.x)));
      near(pHB, pKa + Math.log10((p.b + p.x) / (p.a - p.x)));
      expect(pHA).toBeLessThan(pH);
      expect(pHB).toBeGreaterThan(pH);
      near(pHW, -Math.log10(p.x));
      expect(pH - pHA).toBeLessThan(7 - pHW);
      expect(pH - pHA).toBeLessThan(1);
      const y = a6 * 1e-2;
      near((p.a + y) / (p.b - y), 10);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(p.b);
      for (const s of num.slice(1, 5)) {
        expect(s.answer).toBeGreaterThan(0);
        expect(s.answer).toBeLessThan(14);
        reachable(s);
      }
    });
  });

  it('two-step-neutralization：2 つの終点から元の NaOH と Na₂CO₃ が戻る', () => {
    each('two-step-neutralization', ([a1, a2, mc, pct, co2, orig], p) => {
      near(a1 * 1e-4, p.n2);
      near(a2 * 1e-4, p.n1);
      // 塩酸の総量 = NaOH + 2 × Na₂CO₃
      near((p.cHCl * (p.V1 + p.V2)) / 1000, p.n1 + 2 * p.n2);
      near(mc, p.n2 * p.fac * 106);
      const pctCarb = (mc / p.m) * 100;
      expect(pct + pctCarb).toBeLessThan(100);
      expect(pct + pctCarb).toBeGreaterThan(90);
      near(co2 / 22400, p.n2 * p.fac);
      // Na の数の保存
      near(orig / 40, (p.n1 + 2 * p.n2) * p.fac);
      expect(p.V1).toBeGreaterThan(p.V2);
      expect(p.V1 + p.V2).toBeLessThanOrEqual(50);
    });
  });

  it('redox-kmno4-h2o2：電子の授受が合い、濃度が元の値に戻る', () => {
    each('redox-kmno4-h2o2', ([a1, a2, a3, a4, orig, pct], p) => {
      const cK = a3 * 1e-2;
      near(a1 * 1e-2, p.mOx / 126 / 0.1);
      // MnO₄⁻ が受け取る電子 = シュウ酸が出す電子
      near((5 * cK * p.V1) / 1000, a2 * 1e-3);
      near(a2 * 1e-3, 2 * a1 * 1e-2 * 0.01);
      // MnO₄⁻ が受け取る電子 = H₂O₂ が出す電子
      near((5 * cK * p.V2) / 1000, 2 * a4 * 1e-2 * 0.01);
      near(cK, p.cKtrue, 0.005);
      near(a4 * 1e-2, p.cHtrue, 0.005);
      near(orig, a4 * 1e-2 * 10);
      near(pct, (orig * 34) / 10);
      // 市販のオキシドールは約 3 %
      expect(pct).toBeGreaterThan(2.5);
      expect(pct).toBeLessThan(3.5);
    });
  });

  it('elemental-analysis：元素の質量の和が試料に等しく、分子式と不飽和度が合う', () => {
    each('elemental-analysis', ([mC, mO, eM, Mexp, nC, dou], p) => {
      const mH = (p.h2o * 2) / 18;
      near(mC + mH + mO, p.sample);
      // 原子数の比
      near(mC / 12 / (mO / 16), p.c / p.o);
      near(mH / (mC / 12), p.h / p.c);
      near(Mexp, p.M, 0.01);
      expect(p.M % eM).toBe(0);
      expect(nC).toBe(p.c);
      expect(Number.isInteger(dou)).toBe(true);
      expect(dou).toBeGreaterThanOrEqual(0);
      expect(dou).toBe((2 * p.c + 2 - p.h) / 2);
      near(p.M, 12 * p.c + p.h + 16 * p.o);
    });
  });

  it('fat-saponification-iodine：分子量と C=C の数が元の値に戻る', () => {
    each('fat-saponification-iodine', ([a1, M, i2, n, h2, gly], p) => {
      near(M, p.Mtrue, 0.01);
      near(a1 * 1e-3 * M, 3);
      expect(n).toBe(p.n);
      // けん化価 = 3 × 56.1 × 1000 ÷ M、ヨウ素価 = 100 × n × 253.8 ÷ M
      near(p.sv, (3 * 56.1 * 1000) / p.Mtrue, 0.003);
      near(p.iv, (100 * p.n * 253.8) / p.Mtrue, 0.003);
      // 丸める前の値も整数に近い
      expect(Math.abs((i2 * M) / 100 - n)).toBeLessThan(0.05);
      near(h2 / 22.4, (n * p.m) / M);
      near(gly / 92, p.m / M);
    });
  });

  it('condensation-polymer：単量体の質量 − 水の質量 = 高分子の質量', () => {
    each('condensation-polymer', ([unit, deg, bonds, acid, other, water], p) => {
      expect([226, 192]).toContain(unit);
      near(unit, p.acidM + p.otherM - 36);
      near(deg, p.degTrue);
      near(bonds, 2 * deg);
      near(acid + other - water, p.m);
      near(acid / p.acidM, other / p.otherM);
      near(water / 18, (2 * p.m) / unit);
      near(deg * unit, p.Mavg);
    });
  });

  it('vinylon-acetal：アセタール化の割合が元の値に戻り、質量が合う', () => {
    each('vinylon-acetal', ([nOH, pvac, nF, pct, formalin], p) => {
      near(nOH, p.m / 44);
      near(pvac / 86, nOH);
      near(p.m + 12 * nF, p.m2);
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThan(100);
      expect(Math.abs(pct - p.fTrue * 100)).toBeLessThan(1.5);
      // 生成物を単位ごとに数える：残った単位 44、アセタール化された 2 単位で C₅H₈O₂ = 100
      const fr = pct / 100;
      near(nOH * ((1 - fr) * 44 + (fr / 2) * 100), p.m2);
      near((formalin * p.conc) / 100 / 30, nF);
    });
  });

  it('starch-fermentation：加水分解と発酵の前後で質量が保存される', () => {
    each('starch-fermentation', ([deg, water, glu, eth, co2], p) => {
      near(deg * 162, p.Mst);
      near(p.m + water, glu);
      near(eth + (co2 / 22.4) * 44, (glu * p.y) / 100);
      near(eth / 46, co2 / 22.4);
      near(eth / 46, ((glu / 180) * 2 * p.y) / 100);
    });
  });

  it('glycine-isoelectric：等電点では陽イオンと陰イオンが同じ濃度になる', () => {
    each('glycine-isoelectric', ([pK1, pI, a3, rLo, rHi, pct], p, _d, num) => {
      const pK2 = -Math.log10(p.K2);
      near(pK1, -Math.log10(p.K1));
      near(pI, (pK1 + pK2) / 2);
      const h = 10 ** -pI;
      // [A⁺]/[A±] = [H⁺]/K₁、[A⁻]/[A±] = K₂/[H⁺]
      near(a3 * 1e-4, h / p.K1, 1e-8);
      near(a3 * 1e-4, p.K2 / h, 1e-8);
      near(rLo, 10 ** (pK1 - p.pHlo), 1e-8);
      near(rHi, 10 ** (p.pHhi - pK2), 1e-8);
      near(pct, (rHi / (1 + rHi)) * 100);
      // この pH で陽イオンを無視してよいこと
      expect(10 ** -p.pHhi / p.K1).toBeLessThan(1e-5);
      expect(pI).toBeGreaterThan(5.5);
      expect(pI).toBeLessThan(6.5);
      reachable(num[0]);
      reachable(num[1]);
    });
  });

  it('mixed-gas-combustion：C・H・O の原子の数が合い、水は液体として残る', () => {
    each('mixed-gas-combustion', ([x, y, P0, cons, P1, liq], p) => {
      near(x, p.xT, 1e-8);
      near(y, p.yT, 1e-8);
      near(p.ac * x + p.bc * y, p.nC, 1e-8);
      near(p.ah * x + p.bh * y, 2 * p.nH, 1e-8);
      near(2 * cons, 2 * p.nC + p.nH, 1e-8);
      expect(cons).toBeLessThan(p.nO);
      near(P0 * 1e5, ((x + y + p.nO) * R * 300) / p.V, 1e-8);
      near(P1 * 1e5 - 3.6e3, ((p.nO - cons + p.nC) * R * 300) / p.V, 1e-8);
      expect(P1).toBeLessThan(P0);
      // すべて気体だと蒸気圧を超える → 液体がある
      expect((p.nH * R * 300) / p.V).toBeGreaterThan(3.6e3);
      expect(liq).toBeGreaterThan(0);
      expect(liq).toBeLessThan(18 * p.nH);
      near(18 * p.nH - liq, ((3.6e3 * p.V) / (R * 300)) * 18, 1e-8);
    });
  });

  it('dumas-molar-mass：分子量が元の値に戻る', () => {
    each('dumas-molar-mass', ([a1, M, nC, dens, rel], p) => {
      near(M, p.Mtrue, 0.01);
      near(a1 * 1e-3, (p.P * (p.vmL / 1000)) / (R * p.T));
      expect(nC).toBe(p.nC);
      // 密度 = PM/RT
      near(dens, (p.P * M) / (R * p.T));
      near(rel, M / 28.8);
      expect(rel).toBeGreaterThan(1);
    });
  });

  it('dissociation-general：数値の小問が元の解離度に戻り、Kc が濃度から直接求めた値と一致する', () => {
    each('dissociation-general', ([alpha, kc2], p) => {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
      expect(Math.abs(alpha - p.alphaTrue)).toBeLessThan(0.01);
      const A = (p.n * (1 - alpha)) / p.V;
      const B = (2 * p.n * alpha) / p.V;
      near(kc2 * 1e-2, (B * B) / A);
      // 分圧の和が全圧に等しい
      near((A + B) * R * p.T, p.P);
    });
  });

  it('weak-acid-general：近似の電離度が厳密解に近く、うすめると pH が上がり電離度も上がる', () => {
    each('weak-acid-general', ([a6, pH2], p, _d, num) => {
      const exact = (c: number): number => (-p.Ka + Math.sqrt(p.Ka * p.Ka + 4 * p.Ka * c)) / (2 * c);
      const alpha = a6 * 1e-2;
      near(alpha, exact(p.c), 0.02);
      expect(alpha).toBeLessThan(0.05);
      const c2 = p.c / p.N;
      // うすめたあとも近似が使える
      expect(exact(c2)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(pH2 - -Math.log10(c2 * exact(c2)))).toBeLessThan(0.02);
      // うすめる前より pH は高い（log₁₀N の半分だけ）
      near(pH2 - -Math.log10(Math.sqrt(p.c * p.Ka)), Math.log10(p.N) / 2);
      expect(pH2).toBeLessThan(7);
      reachable(num[1]);
    });
  });

  it('extraction-partition：分けて抽出するほど水層に残る量が減り、分配係数を満たす', () => {
    each('extraction-partition', ([pct1, pct2, got], p) => {
      // 1 回の抽出を物質収支から直接解く：水層 c、有機層 Kc
      const once = (v: number): number => {
        const c = 1 / (p.V1 + p.K * v);
        near((p.K * c * v) + c * p.V1, 1);
        return c * p.V1;
      };
      near(pct1 / 100, once(p.V2));
      near(pct2 / 100, once(p.V2 / 2) ** 2);
      near(got, p.m * (1 - once(p.V2 / 3) ** 3));
      expect(pct2).toBeLessThan(pct1);
      expect(100 * (1 - got / p.m)).toBeLessThan(pct2);
      expect(got).toBeGreaterThan(0);
      expect(got).toBeLessThan(p.m);
      // どれだけ細かく分けても exp(−KV₂/V₁) より少なくはならない
      expect(1 - got / p.m).toBeGreaterThan(Math.exp((-p.K * p.V2) / p.V1));
    });
  });

  it('raoult-vapor-pressure：分子量が元の値に戻り、ラウールの法則を満たす', () => {
    each('raoult-vapor-pressure', ([a3, n2, M], p) => {
      const n1 = p.W / 18;
      near(M, p.Mtrue, 0.015);
      near(n2, p.n2True, 0.015);
      // p = p₀ × 溶媒のモル分率
      near(p.p0 - p.dp, (p.p0 * n1) / (n1 + n2));
      near(a3 * 1e-2, n2 / (n1 + n2));
      expect(a3 * 1e-2).toBeLessThan(0.04);
      near(M * n2, p.w);
    });
  });

  it('検算のない生成器がない', () => {
    // このファイルの「化学としての検算」で扱った id
    const checked = [
      'n2o4-kp', 'vapor-n2-water', 'weak-acid-titration', 'ksp-mohr', 'metal-crystal', 'ionic-crystal', 'series-electrolysis',
      'lead-acid', 'fuel-cell', 'combustion-enthalpy', 'bond-energy-nh3', 'hess-carbon-cycle', 'first-order-h2o2',
      'freezing-electrolyte', 'freezing-dimer', 'osmotic-polymer', 'henry-co2', 'buffer-acetate', 'two-step-neutralization',
      'redox-kmno4-h2o2', 'elemental-analysis', 'fat-saponification-iodine', 'condensation-polymer', 'vinylon-acetal',
      'starch-fermentation', 'glycine-isoelectric', 'mixed-gas-combustion', 'dumas-molar-mass',
      'dissociation-general', 'weak-acid-general', 'extraction-partition', 'raoult-vapor-pressure',
    ];
    expect(DRILLS.map((g) => g.id).sort()).toEqual([...checked].sort());
  });
});

// ───────────────────────── 式を選ぶ小問 ─────────────────────────

const SUPER: Record<string, string> = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/**
 * 選択肢の式を数値にする小さな計算機。
 * 並べて書いた積（4α²P、n(1 + α)）、/、+、−、かっこ、√、²・³・ⁿ、a×10ⁿ の数を読む。
 * 積と商は左から順に計算する（PV/(RT) は (P×V)÷(R×T)）。変数は env の名前のうち最も長く一致するもの。
 */
function evalExpr(src: string, env: Record<string, number>): number {
  const names = Object.keys(env).sort((a, b) => b.length - a.length);
  const s = src.replace(/\s+/g, '');
  let i = 0;
  const startsFactor = (): boolean => i < s.length && (/[0-9(√]/.test(s[i]) || names.some((n) => s.startsWith(n, i)));
  const primary = (): number => {
    if (s[i] === '(') {
      i++;
      const v = expr();
      if (s[i] !== ')') throw new Error(`式が読めない（かっこ）: ${src}`);
      i++;
      return v;
    }
    if (s[i] === '√') {
      i++;
      return Math.sqrt(primary());
    }
    const m = /^\d+(\.\d+)?(×10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      const [mant, ex] = m[0].split('×10');
      return Number(mant) * (ex ? 10 ** Number(ex.split('').map((ch) => SUPER[ch]).join('')) : 1);
    }
    const name = names.find((n) => s.startsWith(n, i));
    if (name === undefined) throw new Error(`式が読めない（${s.slice(i)}）: ${src}`);
    i += name.length;
    return env[name];
  };
  const postfix = (): number => {
    let v = primary();
    for (;;) {
      if (s[i] === '²') v = v ** 2;
      else if (s[i] === '³') v = v ** 3;
      else if (s[i] === 'ⁿ') v = v ** env.n;
      else return v;
      i++;
    }
  };
  const term = (): number => {
    let v = postfix();
    for (;;) {
      if (s[i] === '/') {
        i++;
        v /= postfix();
      } else if (s[i] === '×') {
        i++;
        v *= postfix();
      } else if (startsFactor()) v *= postfix();
      else return v;
    }
  };
  function expr(): number {
    let v = term();
    for (;;) {
      if (s[i] === '+') {
        i++;
        v += term();
      } else if (s[i] === '−') {
        i++;
        v -= term();
      } else return v;
    }
  }
  const out = expr();
  if (i !== s.length) throw new Error(`式が読めない（残り ${s.slice(i)}）: ${src}`);
  return out;
}

/** 選択肢から、式でない飾り（「Kp = 」「倍」など）を外す */
const bare = (c: string): string => c.replace(/^Kp = /, '').replace(/倍.*$/, '');

interface ChoiceSpec {
  /** 式に出てくる文字の値 */
  env: Record<string, number>;
  /** 式とは別の道筋で求めた値 */
  expected: number;
  /** 近似式のときだけ、許す相対誤差 */
  tol?: number;
}
type SpecFn = (p: Record<string, number>, a: number[]) => ChoiceSpec;

/** 生成器ごとに、式を選ぶ小問を出てくる順に。null は式でない（文章の）選択肢 */
const CHOICE_SPECS: Record<string, (SpecFn | null)[]> = {
  'n2o4-kp': [
    // 分圧から直接：p(NO₂)² ÷ (P − p(NO₂))
    (p, a) => ({ env: { α: a[1], P: p.P }, expected: (a[2] * 1e4) ** 2 / (p.P - a[2] * 1e4) }),
  ],
  'weak-acid-titration': [
    (p, a) => ({ env: { c: p.c, Ka: p.Ka, Kw: 1e-14 }, expected: 10 ** -a[1] }),
  ],
  'ksp-mohr': [
    // [Ag⁺]²[CrO₄²⁻] = Ksp を満たす値を二分法で探す
    (p) => {
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2;
        if (mid * mid * p.c2 < p.K2) lo = mid;
        else hi = mid;
      }
      return { env: { Ksp: p.K2, c: p.c2 }, expected: lo, tol: 1e-9 };
    },
  ],
  'lead-acid': [
    // 電解液の減少 = 両極の増加
    (_p, a) => ({ env: { x: a[0] }, expected: a[1] + a[2] }),
  ],
  'first-order-h2o2': [
    // c = c₀e^(−kt) が c₀/2 になる t を二分法で探す
    (p, a) => {
      const k = a[1] * 1e-2;
      let lo = 0;
      let hi = 1000;
      for (let n = 0; n < 200; n++) {
        const mid = (lo + hi) / 2;
        if (p.c0 * Math.exp(-k * mid) > p.c0 / 2) lo = mid;
        else hi = mid;
      }
      return { env: { k, 'c₀': p.c0, 'logₑ2': Math.log(2) }, expected: lo, tol: 1e-9 };
    },
  ],
  'freezing-electrolyte': [
    // 粒子を数える：残った式量単位 (1 − α) とイオン να
    (p, a) => ({ env: { α: a[4] }, expected: 1 - a[4] + p.nu * a[4] }),
  ],
  'freezing-dimer': [
    // 凝固点降下から出した粒子の物質量
    (p, a) => ({ env: { n: p.y / 60, β: a[3] }, expected: (a[1] * p.W) / 1000 }),
  ],
  'osmotic-polymer': [
    (p, a) => ({ env: { w: p.x, R, T: p.T, Π: p.Pi, V: p.vmL / 1000 }, expected: a[1] * 1e4 }),
  ],
  'henry-co2': [
    (p, a) => ({ env: { P: a[1] * 1e5, V: p.Vg, W: p.Vw, k: p.k, R, T: p.T }, expected: p.n }),
  ],
  'dissociation-general': (() => {
    const env = (p: Record<string, number>, a: number[]): Record<string, number> => {
      const A = (p.n * (1 - a[0])) / p.V;
      const B = (2 * p.n * a[0]) / p.V;
      return { n: p.n, α: a[0], R, T: p.T, V: p.V, P: p.P, Kc: (B * B) / A };
    };
    const pA = (p: Record<string, number>, a: number[]): number => ((p.n * (1 - a[0])) / p.V) * R * p.T;
    const pB = (p: Record<string, number>, a: number[]): number => ((2 * p.n * a[0]) / p.V) * R * p.T;
    return [
      (p, a) => ({ env: env(p, a), expected: (p.P * p.V) / (R * p.T) }),
      (p, a) => ({ env: env(p, a), expected: p.P }),
      (p, a) => ({ env: env(p, a), expected: env(p, a).Kc }),
      (p, a) => ({ env: env(p, a), expected: pB(p, a) ** 2 / pA(p, a) }),
      (p, a) => ({ env: env(p, a), expected: pB(p, a) ** 2 / pA(p, a) }),
    ] as SpecFn[];
  })(),
  'weak-acid-general': (() => {
    const exact = (Ka: number, c: number): number => (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * c)) / (2 * c);
    return [
      // 厳密な電離度を入れると Ka に戻る
      (p) => ({ env: { c: p.c, α: exact(p.Ka, p.c), Ka: p.Ka }, expected: p.Ka }),
      (p) => ({ env: { c: p.c, Ka: p.Ka }, expected: exact(p.Ka, p.c), tol: 0.02 }),
      null,
      (p) => ({ env: { c: p.c, Ka: p.Ka }, expected: p.c * exact(p.Ka, p.c), tol: 0.02 }),
      (p) => ({ env: {}, expected: exact(p.Ka, p.c / p.N) / exact(p.Ka, p.c), tol: 0.03 }),
    ] as (SpecFn | null)[];
  })(),
  'extraction-partition': (() => {
    // 1 回の抽出を数値でたどる：水層の濃度 c、有機層の濃度 Kc になるまで少しずつ移す代わりに、物質収支を解く
    const once = (K: number, V1: number, v: number): number => V1 / (V1 + K * v);
    const many = (p: Record<string, number>, n: number): number => {
      let left = 1;
      for (let k = 0; k < n; k++) left *= once(p.K, p.V1, p.V2 / n);
      return left;
    };
    const env = (p: Record<string, number>): Record<string, number> => ({ K: p.K, 'V₁': p.V1, 'V₂': p.V2, n: 5 });
    return [
      (p) => ({ env: env(p), expected: many(p, 1) }),
      (p) => ({ env: env(p), expected: many(p, 2) }),
      (p) => ({ env: env(p), expected: many(p, 5) }),
    ] as SpecFn[];
  })(),
  'raoult-vapor-pressure': (() => {
    const env = (p: Record<string, number>, a: number[]): Record<string, number> => ({
      W: p.W, w: p.w, 'M₀': 18, M: a[2], 'p₀': p.p0, Δp: p.dp, 'n₁': p.W / 18, 'n₂': a[1],
    });
    return [
      (p, a) => ({ env: env(p, a), expected: 1 - a[0] * 1e-2 }),
      (p, a) => ({ env: env(p, a), expected: p.dp }),
      (p, a) => ({ env: env(p, a), expected: a[2] }),
    ] as SpecFn[];
  })(),
};

describe('ドリル：式を選ぶ小問', () => {
  it('計算機が式を正しく読む', () => {
    const env = { α: 0.5, P: 2e5, n: 3, R: 8, T: 300, V: 4, K: 4, 'V₁': 100, 'V₂': 50, Ka: 1e-5, c: 0.1, 'c₀': 2, k: 0.5, 'logₑ2': Math.log(2) };
    near(evalExpr('4α²P/(1 − α²)', env), (4 * 0.25 * 2e5) / 0.75);
    near(evalExpr('n(1 + α)RT/V', env), (3 * 1.5 * 8 * 300) / 4);
    near(evalExpr('4nα²/((1 − α)V)', env), (4 * 3 * 0.25) / (0.5 * 4));
    near(evalExpr('PV/(RT) + αP/(1.0×10⁵)', env), (2e5 * 4) / 2400 + 1);
    near(evalExpr('√(cKa)', env), 1e-3);
    near(evalExpr('√(Ka/c)/2', env), 0.005);
    near(evalExpr('(2V₁/(2V₁ + KV₂))²', env), 0.25);
    near(evalExpr('(nV₁/(nV₁ + KV₂))ⁿ', env), 0.6 ** 3);
    near(evalExpr('(logₑ2)/k', env), Math.log(2) / 0.5);
    near(evalExpr('c₀/(2k)', env), 2);
    near(evalExpr('1/2', env), 0.5);
    expect(() => evalExpr('4α²Q', env)).toThrow();
    expect(() => evalExpr('(1 + α', env)).toThrow();
  });

  it('式を選ぶ小問をもつ生成器が 12 以上あり、すべてに検算の定義がある', () => {
    const withChoice = DRILLS.filter((g) => g.make(mulberry32(1)).steps.some((s) => s.choices)).map((g) => g.id);
    expect(withChoice.length).toBeGreaterThanOrEqual(12);
    expect([...withChoice].sort()).toEqual(Object.keys(CHOICE_SPECS).sort());
  });

  for (const id of Object.keys(CHOICE_SPECS)) {
    it(`${id}：正しい式だけが、別の道筋で求めた値と一致する`, () => {
      const specs = CHOICE_SPECS[id];
      const positions = specs.map(() => new Set<number>());
      const wording = specs.map(() => new Set<string>());
      for (let seed = 0; seed < SEEDS; seed++) {
        const { drill, params } = inspectDrill(id, mulberry32(seed));
        const a = drill.steps.filter((s) => !s.choices).map((s) => s.answer);
        const cs = drill.steps.filter((s) => s.choices);
        expect(cs.length).toBe(specs.length);
        cs.forEach((s, k) => {
          const choices = s.choices as string[];
          positions[k].add(s.answer);
          wording[k].add([...choices].sort().join(' | '));
          // 解説に正しい式が書いてある
          expect(s.how).toContain(bare(choices[s.answer]).trim());
          const spec = specs[k];
          if (!spec) return;
          const { env, expected, tol = 1e-9 } = spec(params, a);
          expect(Number.isFinite(expected)).toBe(true);
          choices.forEach((c, idx) => {
            const v = evalExpr(bare(c), env);
            expect(Number.isFinite(v)).toBe(true);
            const err = Math.abs(v - expected) / Math.abs(expected);
            if (idx === s.answer) expect(err).toBeLessThanOrEqual(tol);
            // 間違いの選択肢は、この問題の数値でもはっきり違う値になる
            else expect(err).toBeGreaterThan(Math.max(5 * tol, 1e-3));
          });
        });
      }
      // 正解の位置が種によって変わる
      for (const set of positions) expect(set.size).toBeGreaterThanOrEqual(3);
      // 選択肢の中身（並べ替える前）は、数値によらない式なら 1 通り
      for (const set of wording) expect(set.size).toBeLessThanOrEqual(5);
    });
  }
});
