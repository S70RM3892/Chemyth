import { describe, expect, it } from 'vitest';
import {
  CAPTIONS, NOTICE, SOURCES, caption, captionSrc, collectCaption, dHCaption, flameCaption, hasCaption, plumeCaptionKeys, plumeCaptions, processCaption, storeCaption,
} from '../src/content/captions';
import { KNOWLEDGE } from '../src/content/knowledge';
import { ANALYZER, BURN, COLOUR_WORDS, FLAME_TESTS, PLUMES, STORE, colourWordsIn } from '../src/content/looks';
import { RECIPES } from '../src/content/recipes';
import { T_CLAMP } from '../src/content/spectra';
import { DH, PROCESS_T } from '../src/content/thermo';

/** SPEC2 §10.14 の文（日本語の文が正）。ここにもう一度書き写して持つ */
const S_CAPTIONS: Record<string, string> = {
  burner: '青い炎：空気を調節したバーナー（赤っぽい炎は不完全燃焼）',
  flame: '炎色反応：{El} は{word}',
  'burn:S': '硫黄は青い炎を出して燃え、SO₂ になる',
  'burn:CO': 'CO は青い炎を出して燃え、CO₂ になる',
  'burn:P4': '黄リンは明るい炎を出して燃え、白煙（P₄O₁₀）を出す',
  'noBurn:Cu': '銅は炎を出さずに酸化され、表面が黒い CuO になる',
  beilstein: '青緑の炎：ハロゲン（F 以外）を含む（バイルシュタイン試験）',
  mirror: '銀鏡反応：還元されて生じた銀が、試験管の内側に付く',
  tyndall: 'チンダル現象：コロイド粒子が光を散乱し、光の通り道が輝いて見える（となりの真の溶液では見えない）',
  incand: '{Tcap}：熱で光っている（約 525 ℃から赤く見え始める）',
  noglow: '{Tcap}：まだほとんど光らない',
  moltenNaCl: '赤く光るのは高温のため（融解した NaCl そのものは無色）',
  indicatorPP: 'フェノールフタレインを加えてある（塩基性で赤）',
  indicatorMO: 'メチルオレンジを加えてある（酸性で赤、中和が進むと黄）',
  heavyGas: '{gas}：空気（平均分子量 28.8）より重い。同じ温度で比べると低くたまる',
  lightGas: '{gas}：空気より軽い。同じ温度で比べると昇る',
  neutralGas: '{gas}：空気とほぼ同じ重さ',
  hotGas: '熱い気体は、まず昇る（重い・軽いは同じ温度で比べる）',
  colourless: '無色の気体（輪は目印）',
  steam: '白く見えるのは冷えてできた小さな水滴（湯気）。水蒸気そのものは無色',
  so3Fume: '白く見えるのは空気中の水分と反応してできた硫酸の霧（SO₃ 自体は無色）',
  nh4cl: 'NH₃ + HCl → NH₄Cl（白煙）',
  no2: '無色の NO は、空気中の O₂ と反応して赤褐色の NO₂ になる',
  collectWater: '水上置換：水に溶けにくい気体',
  collectUp: '上方置換：水に溶けやすく、空気より軽い気体',
  collectDown: '下方置換：水に溶けやすく、空気より重い気体',
  electrolysis21: '同じ温度・圧力で、体積比 H₂ : O₂ = 2 : 1',
  ammine: '過剰の NH₃：Cu²⁺ は深青色の [Cu(NH₃)₄]²⁺。Zn²⁺・Ag⁺ も錯イオンになって溶ける（無色）',
  amphoteric: '過剰の NaOH：Al・Zn・Pb の水酸化物は溶ける。Fe(OH)₃ は残る',
  h2sFe: 'H₂S で Fe³⁺ は Fe²⁺ に還元される（あとで HNO₃ で酸化して戻す）',
  prussian: '濃青色沈殿：Fe³⁺ と [Fe(CN)₆]⁴⁻',
  dH: '{equation}　ΔH = {dH} kJ',
  storeNa: 'ナトリウム：灯油の中に保存',
  storeP4: '黄リン：空気中で自然発火するので、水の中に保存',
  storeHF: 'フッ化水素酸：ガラスを溶かすので、ポリエチレンの容器',
  storeBrown: '光で分解するので、褐色びんに保存',
  storeNaOH: 'NaOH：ガラスを侵すので、すり合わせのガラス栓は使わない。潮解性があり CO₂ を吸うので密栓',
  cuCat: '銅は 赤（Cu）⇄ 黒（CuO）をくり返す：触媒はもとに戻る',
  ninhydrin: 'ニンヒドリン反応：アミノ酸をニンヒドリン水溶液と温めると紫色になる',
  notice: '影と光：紙のスキンは、部屋の窓から入る実際の京都の太陽（朝は左上から、夕方は右上から）。工場は北向きの天窓、研究所は天井の灯りで、光はいつも画面の上から。地図の方角（上が北）とは別。夜は机の灯り・ろうそく・天井灯。このゲームでは、物質の色はいつも白い光の下での色（教科書の色）で描く。時刻・光・画質の設定では変えない。',
};

/** 出しうる文をすべて（埋めたあと）。地図・札・図鑑に出るもの */
function allTexts(): { key: string; text: string; src: string[] }[] {
  const out: { key: string; text: string; src: string[] }[] = [];
  for (const k of Object.keys(CAPTIONS)) if (!/\{\w+\}/.test(CAPTIONS[k].text)) out.push({ key: k, text: caption(k), src: captionSrc(k) });
  for (const el of Object.keys(FLAME_TESTS)) out.push(flameCaption(el)!);
  for (const r of RECIPES) for (const c of [processCaption(r.id), dHCaption(r.id), collectCaption(r.id)]) if (c) out.push(c);
  for (const id of Object.keys(PLUMES)) out.push(...plumeCaptions(id));
  for (const id of ['NH4Cl', 'P4O10']) out.push(...plumeCaptions(id));
  for (const id of Object.keys(STORE)) out.push(storeCaption(id)!);
  return out;
}

describe('説明文の表（§10.14）', () => {
  it('文は §10.14 のとおり。表にない鍵は使わない', () => {
    expect(Object.keys(CAPTIONS).sort()).toEqual(Object.keys(S_CAPTIONS).sort());
    for (const [k, t] of Object.entries(S_CAPTIONS)) expect(CAPTIONS[k].text, k).toBe(t);
    expect(NOTICE).toBe(S_CAPTIONS.notice);
    expect(() => caption('no-such-key')).toThrow();
    expect(() => caption('flame:Xx')).toThrow();
    expect(() => caption('heavyGas')).toThrow();      // {gas} が埋まらない文は出さない
    expect(hasCaption('flame:Sr')).toBe(true);
    expect(hasCaption('flame:Fe')).toBe(false);
    expect(CAPTIONS['noBurn:Cu'].p1 && CAPTIONS.cuCat.p1 && CAPTIONS.ninhydrin.p1).toBe(true);
  });

  it('どの文にも出典の鍵があり、その鍵は §11.2 の出典の表にある', () => {
    for (const [k, c] of Object.entries(CAPTIONS)) { expect(c.src.length, k).toBeGreaterThan(0); for (const s of c.src) expect(SOURCES[s], `${k} ${s}`).toBeTruthy(); }
    for (const c of allTexts()) { expect(c.src.length, c.key).toBeGreaterThan(0); for (const s of c.src) expect(SOURCES[s], `${c.key} ${s}`).toBeTruthy(); }
  });

  it('文の決まり：置換は溶けやすさから、重い・軽いは同じ温度で、P₄ は燐光と言わない、ナトリウム灯と 589 を並べない、バイルシュタインは F 以外', () => {
    const texts = allTexts();
    expect(texts.length).toBeGreaterThan(80);
    for (const { key, text } of texts) {
      if (/上方置換|下方置換/.test(text)) expect(text, key).toContain('水に溶け');
      // 浮く・たまるの文（置換の文は捕集法の定義で、上の決まりに従う）
      if (/重い|軽い/.test(text) && !/置換/.test(text)) expect(text, key).toContain('同じ温度');
      expect(text, key).not.toContain('燐光');
      expect(/ナトリウム灯/.test(text) && /589/.test(text), key).toBe(false);
      // 色の言葉は §10.13 のものだけ
      for (const w of colourWordsIn(text)) expect(COLOUR_WORDS, `${key}：${w}`).toContain(w);
    }
    expect(caption('beilstein')).toContain('F 以外');
    expect(ANALYZER.has_cl.word).toContain('F 以外');
  });

  it('チンダル現象は「散乱」と言い、コロイドが「光る」とは言わない', () => {
    expect(caption('tyndall')).toContain('散乱');
    expect(caption('tyndall')).not.toContain('光る');
  });

  it('燃える 3 つの反応の札の文がある（S・CO・P₄）', () => {
    expect([BURN['sulfur-burn'].caption, BURN['co-burn'].caption, BURN['p4-burn'].caption]).toEqual(['burn:S', 'burn:CO', 'burn:P4']);
    for (const b of Object.values(BURN)) if (b.caption) expect(hasCaption(b.caption), b.caption).toBe(true);
    expect(caption('burn:S')).toContain('青い炎');
  });

  it('白い煙：湯気と SO₃ の霧には「水滴」「霧」と言う文だけ（重い・軽いの文より先、ほかの気体の文は出さない）', () => {
    for (const id of Object.keys(PLUMES)) {
      if (!PLUMES[id].white || id === 'NH4Cl' || id === 'P4O10') continue;
      const lines = plumeCaptions(id);
      expect(lines.length, id).toBeGreaterThan(0);
      for (const l of lines) expect(/水滴|霧/.test(l.text), `${id} ${l.text}`).toBe(true);
    }
    expect(plumeCaptionKeys('H2O')).toEqual(['steam']);
    expect(plumeCaptionKeys('SO3')).toEqual(['so3Fume']);
    expect(plumeCaptionKeys('NH4Cl')).toEqual(['nh4cl']);
    expect(plumeCaptionKeys('P4O10')).toEqual(['burn:P4']);
    expect(plumeCaptions('Cl2').map((l) => l.text)).toEqual(['Cl₂：空気（平均分子量 28.8）より重い。同じ温度で比べると低くたまる']);
    expect(plumeCaptions('NH3').map((l) => l.text)).toEqual(['NH₃：空気より軽い。同じ温度で比べると昇る', '無色の気体（輪は目印）']);
    expect(plumeCaptionKeys('NO')).toEqual(['no2', 'neutralGas', 'colourless']);
    expect(plumeCaptionKeys('HCN')).toEqual(['neutralGas', 'colourless']);
  });

  it('温度の文：光るかどうかは G、表示の上限で切った温度は温度として書かない', () => {
    expect(processCaption('haber-bosch')!.text).toBe('約 500 ℃：まだほとんど光らない');
    expect(processCaption('blast-furnace')!.text).toBe('約 1500 ℃：熱で光っている（約 525 ℃から赤く見え始める）');
    expect(processCaption('blast-furnace')!.src).toEqual(['D1', 'SU']);
    expect(processCaption('thermite')!.text).toBe('約 2500 ℃（鉄がとけるほどの高温）：熱で光っている（約 525 ℃から赤く見え始める）');
    expect(processCaption('lead-roast')).toBeNull();
    for (const [id, row] of Object.entries(PROCESS_T)) {
      const c = processCaption(id);
      if (row.T === undefined) { expect(c, id).toBeNull(); continue; }
      if (row.T >= T_CLAMP) expect(c!.text, id).not.toContain(`${T_CLAMP}`);
    }
    // 札や図鑑の ΔH の文にも、上限の温度は出ない
    for (const t of allTexts()) expect(t.text.includes(`${T_CLAMP} ℃`), t.key).toBe(false);
  });

  it('ΔH の文は状態つきの式と整数の ΔH（§6.C C8 の例のとおり）', () => {
    expect(dHCaption('haber-bosch')!.text).toBe('N₂(気) + 3H₂(気) → 2NH₃(気)　ΔH = −92 kJ');
    expect(dHCaption('lime-kiln')!.text).toBe('CaCO₃(固) → CaO(固) + CO₂(気)　ΔH = 179 kJ');
    expect(dHCaption('lime-kiln')!.src).toEqual(['OS', 'ET']);
    expect(dHCaption('soda-ash')!.src).toContain('WNaHCO3');
    expect(dHCaption('cracking')).toBeNull();
    for (const id of Object.keys(DH)) { const c = dHCaption(id); if (c) expect(c.text, id).toMatch(/^.+→.+　ΔH = −?\d+ kJ$/); }
  });

  it('炎色反応・捕集・保存の文', () => {
    expect(flameCaption('Na')!.text).toBe('炎色反応：Na は黄色');
    expect(flameCaption('Sr')!.text).toBe('炎色反応：Sr は紅色（深赤色）');
    expect(flameCaption('Fe')).toBeNull();
    expect(collectCaption('collect-O2')!.key).toBe('collectWater');
    expect(collectCaption('collect-NO')!.key).toBe('collectWater');
    expect(collectCaption('collect-NH3')!.key).toBe('collectUp');
    expect(collectCaption('collect-HCl')!.key).toBe('collectDown');
    // CO₂ は水に少し溶けるだけ（水上置換でも集められる）なので、「水に溶けやすく」の文は出さない（§12 の 4）
    expect(collectCaption('collect-CO2')).toBeNull();
    expect(collectCaption('haber-bosch')).toBeNull();
    expect(storeCaption('Na')!.text).toBe('ナトリウム：灯油の中に保存');
    expect(storeCaption('KMnO4')!.key).toBe('storeBrown');
    expect(storeCaption('NaCl')).toBeNull();
  });

  it('ニンヒドリンの色の言葉は、ゲームの札（org-ninhydrin）と分析器の表と同じ紫色', () => {
    const card = KNOWLEDGE.find((k) => k.id === 'org-ninhydrin')!;
    const word = colourWordsIn(card.why)[0];
    expect(word).toBe('紫色');
    expect(colourWordsIn(caption('ninhydrin'))).toEqual([word]);
    expect(ANALYZER.ninhydrin.word).toBe(word);
  });

  it('お知らせは、物質を白い光の下での色で描くと言う（光で色が変わらないとは言わない）', () => {
    expect(NOTICE).toContain('白い光の下');
    expect(NOTICE).toContain('上が北');
    expect(NOTICE).not.toContain('光や画質で変わらない');
  });
});
