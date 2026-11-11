/**
 * 金属イオンの系統分離。
 * 何種類もの金属イオンが混ざった溶液に、試薬を決まった順で加え、沈殿として 1 つずつ取り除く。
 * ここでは、高校の教科書に載っている 8 種のイオンと、系統分離で使う試薬だけを扱う。
 * 沈殿が 2 種類以上まじって、教科書の手順では分け直せないものは「混ざった沈殿」（sludge）にする。
 */

export type IonKey = 'Ag' | 'Pb' | 'Cu' | 'Fe' | 'Al' | 'Zn' | 'Ca' | 'Na';
/** 系統分離で取り除かれる順 */
export const ION_ORDER: IonKey[] = ['Ag', 'Pb', 'Cu', 'Fe', 'Al', 'Zn', 'Ca', 'Na'];
export const ION_LABEL: Record<IonKey, string> = { Ag: 'Ag⁺', Pb: 'Pb²⁺', Cu: 'Cu²⁺', Fe: 'Fe³⁺', Al: 'Al³⁺', Zn: 'Zn²⁺', Ca: 'Ca²⁺', Na: 'Na⁺' };

/** 混合溶液の id：'ions:Ag.Cu' のように、イオンを決まった順に並べる */
export const ionsId = (keys: IonKey[]): string => 'ions:' + ION_ORDER.filter((k) => keys.includes(k)).join('.');
export function ionsOf(id: string): IonKey[] | null {
  if (!id.startsWith('ions:')) return null;
  const keys = id.slice(5).split('.');
  if (!keys.length || keys.some((k) => !(ION_ORDER as string[]).includes(k)) || new Set(keys).size !== keys.length) return null;
  const sorted = ION_ORDER.filter((k) => keys.includes(k));
  return sorted.join('.') === keys.join('.') ? sorted : null;
}

/** 教科書の手順で分け直せる、2 種類まじりの沈殿 */
export const MUD_CL = 'mud-cl', MUD_OH = 'mud-oh', SLUDGE = 'sludge';

export interface Agent {
  id: string;
  name: string;
  /** 系統分離の何属を沈殿させる試薬か */
  group?: number;
  /** この試薬で沈殿するイオンと、沈殿の化学式 */
  ppt: Partial<Record<IonKey, string>>;
  /** 沈殿はするが、何ができるかを 1 つに決められないイオン。残っていると「混ざった沈殿」になる */
  dirty?: IonKey[];
  /** どうなるかを教科書の範囲で言い切れないイオン。これが残っている溶液には、この試薬を使わせない */
  unsure?: IonKey[];
  /** 沈殿を溶かし分ける：まじった沈殿 → 溶け残る固体と、溶け出すイオン */
  dissolve?: Record<string, { solid: string; ion: IonKey }>;
  /** 設定するときの問い。pool の中から、沈殿する（溶ける）ものをすべて選ぶ */
  quiz: { text: string; pool: string[]; answer: string[] };
  /** 正解したあとに見せる解説 */
  note: string;
}

const ALL = ION_ORDER.map((k) => ION_LABEL[k]);

export const AGENTS: Agent[] = [
  {
    id: 'hcl', name: '希塩酸', group: 1,
    ppt: { Ag: 'AgCl', Pb: 'PbCl2' },
    quiz: { text: '8 種のイオンがすべて入った溶液に、希塩酸を加える。沈殿するイオンをすべて選べ。', pool: ALL, answer: ['Ag⁺', 'Pb²⁺'] },
    note: '第 1 属。Cl⁻ で沈殿するのは Ag⁺（AgCl・白色）と Pb²⁺（PbCl₂・白色）だけ。PbCl₂ は熱水に溶けるので、熱水を注げば AgCl と分けられる。',
  },
  {
    id: 'h2s-acid', name: '硫化水素（酸性のまま通じる）', group: 2,
    ppt: { Ag: 'Ag2S', Pb: 'PbS', Cu: 'CuS' },
    quiz: { text: '8 種のイオンがすべて入った酸性の溶液に、硫化水素を通じる。沈殿するイオンをすべて選べ。', pool: ALL, answer: ['Ag⁺', 'Pb²⁺', 'Cu²⁺'] },
    note: '第 2 属。酸性でも硫化物が沈殿するのは、イオン化傾向の小さい Cu²⁺・Ag⁺・Pb²⁺ など（CuS・Ag₂S・PbS はどれも黒色）。Ag⁺ と Pb²⁺ を先に希塩酸で除いておけば、ここで沈殿するのは CuS だけになる。Zn²⁺ と Fe²⁺ は酸性では沈殿しない。',
  },
  {
    id: 'nh3', name: 'アンモニア水（過剰）', group: 3,
    ppt: { Fe: 'Fe(OH)3', Al: 'Al(OH)3', Pb: 'Pb(OH)2' },
    quiz: { text: '8 種のイオンがすべて入った溶液に、アンモニア水を過剰に加える。沈殿したまま残るイオンをすべて選べ。', pool: ALL, answer: ['Pb²⁺', 'Fe³⁺', 'Al³⁺'] },
    note: '第 3 属。煮沸して H₂S を追い出し、硝酸で Fe²⁺ を Fe³⁺ に戻してから加える。Fe(OH)₃（赤褐色）と Al(OH)₃（白色）が沈殿する。Ag⁺・Cu²⁺・Zn²⁺ は、いったん沈殿しても過剰のアンモニア水に錯イオンとなって溶ける（[Ag(NH₃)₂]⁺ 無色、[Cu(NH₃)₄]²⁺ 深青色、[Zn(NH₃)₄]²⁺ 無色）。',
  },
  {
    id: 'h2s-base', name: '硫化水素（塩基性で通じる）', group: 4,
    ppt: { Ag: 'Ag2S', Pb: 'PbS', Cu: 'CuS', Fe: 'FeS', Zn: 'ZnS' },
    dirty: ['Al'],
    quiz: { text: '第 1〜3 属を取り除いたあとの、アンモニアで塩基性にしたろ液（Zn²⁺・Ca²⁺・Na⁺）に、硫化水素を通じる。沈殿するイオンをすべて選べ。', pool: ['Zn²⁺', 'Ca²⁺', 'Na⁺'], answer: ['Zn²⁺'] },
    note: '第 4 属。中性・塩基性では S²⁻ の濃度が高くなり、酸性では沈殿しなかった Zn²⁺ が ZnS（白色）になる。Fe²⁺ も FeS（黒色）になる。先に除いていない Cu²⁺ などが残っていると、一緒に沈殿して混ざる。',
  },
  {
    id: 'co3', name: '炭酸アンモニウム水溶液', group: 5,
    ppt: { Ca: 'CaCO3' },
    dirty: ['Ag', 'Pb', 'Cu', 'Fe', 'Al', 'Zn'],
    quiz: { text: '第 1〜4 属を取り除いたあとのろ液（Ca²⁺・Na⁺）に、炭酸アンモニウム水溶液を加える。沈殿するイオンをすべて選べ。', pool: ['Ca²⁺', 'Na⁺'], answer: ['Ca²⁺'] },
    note: '第 5 属。Ca²⁺ が CaCO₃（白色）になる。残る Na⁺ はどの試薬でも沈殿しないので、ろ液の炎色反応（黄色）で確かめる（第 6 属）。重金属のイオンが残っていると、それらも炭酸塩や水酸化物になって混ざる。',
  },
  {
    id: 'naoh', name: '水酸化ナトリウム水溶液（過剰）',
    ppt: { Ag: 'Ag2O', Cu: 'Cu(OH)2', Fe: 'Fe(OH)3' },
    unsure: ['Ca'],
    dissolve: { [MUD_OH]: { solid: 'Fe(OH)3', ion: 'Al' } },
    quiz: { text: 'Ag⁺・Pb²⁺・Cu²⁺・Fe³⁺・Al³⁺・Zn²⁺・Na⁺ が入った溶液に、水酸化ナトリウム水溶液を過剰に加える。沈殿したまま残るイオンをすべて選べ。', pool: ALL.filter((x) => x !== 'Ca²⁺'), answer: ['Ag⁺', 'Cu²⁺', 'Fe³⁺'] },
    note: '両性の金属のイオン Al³⁺・Zn²⁺・Pb²⁺ は、いったん水酸化物が沈殿しても、過剰の NaOH に溶ける（[Al(OH)₄]⁻ など）。だから Fe(OH)₃ と Al(OH)₃ のまじった沈殿に加えると、Al(OH)₃ だけが溶けて分けられる。Ag⁺ は Ag₂O（褐色）、Cu²⁺ は Cu(OH)₂（青白色）、Fe³⁺ は Fe(OH)₃（赤褐色）として残る。',
  },
  {
    id: 'hot', name: '熱水',
    ppt: {},
    dissolve: { [MUD_CL]: { solid: 'AgCl', ion: 'Pb' } },
    quiz: { text: 'AgCl と PbCl₂ のまじった沈殿に、熱水を注ぐ。溶けるものを選べ。', pool: ['AgCl', 'PbCl₂'], answer: ['PbCl₂'] },
    note: 'PbCl₂ は冷水には溶けにくいが、熱水には溶ける。AgCl は熱水にも溶けない。ろ液に出てきた Pb²⁺ は、クロム酸カリウム水溶液で PbCrO₄（黄色）にして確かめる。',
  },
  {
    id: 'cro4', name: 'クロム酸カリウム水溶液',
    ppt: { Ag: 'Ag2CrO4', Pb: 'PbCrO4' },
    unsure: ['Cu', 'Fe', 'Al', 'Zn'],
    quiz: { text: 'Ag⁺・Pb²⁺・Na⁺ が入った溶液に、クロム酸カリウム水溶液を加える。沈殿するイオンをすべて選べ。', pool: ['Ag⁺', 'Pb²⁺', 'Na⁺'], answer: ['Ag⁺', 'Pb²⁺'] },
    note: 'CrO₄²⁻ で、Pb²⁺ は PbCrO₄（黄色）、Ag⁺ は Ag₂CrO₄（赤褐色）になる。ほかのイオンと分けたあとの確認に使う。',
  },
];
export const agentById = (id: string | undefined) => AGENTS.find((a) => a.id === id);

/** 沈殿槽に入れられるもの：混合溶液と、分け直せるまじりの沈殿 */
export const settleable = (id: string) => id === MUD_CL || id === MUD_OH || ionsOf(id) !== null;
/** この試薬を使えない理由（言い切れないイオンが残っている）。使えるなら null */
export function refusal(item: string, agent: Agent): string | null {
  const bad = (ionsOf(item) ?? []).filter((k) => agent.unsure?.includes(k));
  return bad.length ? `${bad.map((k) => ION_LABEL[k]).join('・')} が残っている溶液に ${agent.name} を加えたときのことは、教科書の範囲では言い切れない。先に取り除け。` : null;
}

export interface Settled { solid: string | null; liquid: string | null }
/** 試薬を加えた結果。solid：ろ紙に残るもの、liquid：ろ液。何も起きなければ、入れたものがそのまま出る */
export function settle(item: string, agent: Agent): Settled {
  const keys = ionsOf(item);
  if (!keys) {
    const d = agent.dissolve?.[item];
    return d ? { solid: d.solid, liquid: ionsId([d.ion]) } : { solid: item, liquid: null };
  }
  const down = keys.filter((k) => agent.ppt[k] !== undefined || agent.dirty?.includes(k)), rest = keys.filter((k) => !down.includes(k));
  const liquid = rest.length ? ionsId(rest) : null;
  if (!down.length) return { solid: null, liquid };
  if (down.some((k) => agent.dirty?.includes(k))) return { solid: SLUDGE, liquid };
  const made = down.map((k) => agent.ppt[k]!);
  if (made.length === 1) return { solid: made[0], liquid };
  const sig = [...made].sort().join('+');
  if (sig === 'AgCl+PbCl2') return { solid: MUD_CL, liquid };
  if (sig === 'Al(OH)3+Fe(OH)3') return { solid: MUD_OH, liquid };
  return { solid: SLUDGE, liquid };
}

/** 指令で使う混合溶液。試薬棚から出る */
export const MIXES: { id: string; name: string; ions: IonKey[] }[] = [
  { id: ionsId(['Ag', 'Cu']), name: '混合溶液 ア', ions: ['Ag', 'Cu'] },
  { id: ionsId(['Cu', 'Fe', 'Zn']), name: '混合溶液 イ', ions: ['Cu', 'Fe', 'Zn'] },
  { id: ionsId(['Ag', 'Pb']), name: '混合溶液 ウ', ions: ['Ag', 'Pb'] },
  { id: ionsId(['Fe', 'Al', 'Ca']), name: '混合溶液 エ', ions: ['Fe', 'Al', 'Ca'] },
  { id: ionsId(['Ag', 'Cu', 'Fe', 'Zn', 'Ca', 'Na']), name: '混合溶液 オ', ions: ['Ag', 'Cu', 'Fe', 'Zn', 'Ca', 'Na'] },
  { id: ionsId(ION_ORDER), name: '混合溶液 カ', ions: [...ION_ORDER] },
];

/** 混合溶液 start から、試薬を何回か使って作れるものすべて（指令が達成できることの確認に使う） */
export function reachableFrom(start: string): Set<string> {
  const seen = new Set<string>([start]), queue = [start];
  while (queue.length) {
    const cur = queue.pop()!;
    if (!settleable(cur)) continue;
    for (const a of AGENTS) {
      if (refusal(cur, a)) continue;
      const r = settle(cur, a);
      for (const x of [r.solid, r.liquid]) if (x && !seen.has(x)) { seen.add(x); queue.push(x); }
    }
  }
  return seen;
}
