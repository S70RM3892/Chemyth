/** 研究：研究点で開く、工場づくりの道具と能力。段が上がるほど高く、同じ組（group）の中ではどちらか一方しか選べない */
export interface Research {
  id: string;
  name: string;
  /** 段。段 n を開くには、それまでに (n − 1) × 2 個の研究を終えている必要がある */
  tier: 1 | 2 | 3;
  cost: number;
  text: string;
  /** 先に終えておく研究 */
  needs?: string[];
  /** 二者択一の組。組の中で選べるのは 1 つ。あとから切り替えるには、もう一度払う */
  group?: string;
}

export const RESEARCH: Research[] = [
  { id: 'lanes3', tier: 1, cost: 60, name: '3 本引き', text: 'ベルトを 3 本まとめて引ける（最初は 2 本まで）。量産のラインを 1 回のなぞりで敷ける。' },
  { id: 'tunnel', tier: 1, cost: 60, name: '長い地下ベルト', text: '地下ベルトが届く距離が 7 マスから 12 マスに伸びる。' },
  { id: 'logic', tier: 1, cost: 80, name: '信号', text: '「検知器」と「弁」が使える。検知器は、詰まりや特定の物質の通過を信号にする。弁は、信号が来ているときだけ流す（または止める）。' },
  { id: 'lanes4', tier: 2, cost: 120, needs: ['lanes3'], name: '4 本引き', text: 'ベルトを 4 本まとめて引ける。' },
  { id: 'floor2', tier: 2, cost: 150, name: '2 階', text: '設備の上にもう 1 層建てられる。「昇降機」で 1 階と 2 階をつなぐ。採取機と貨物駅は 1 階にしか置けない。' },
  { id: 'express', tier: 2, cost: 120, group: 'train', name: '急行', text: '列車が 1.5 倍の速さで走る。遠い資源地から少しずつ運ぶ工場に向く。' },
  { id: 'heavy', tier: 2, cost: 120, group: 'train', name: '重連', text: '1 編成に積める数が 24 個から 40 個に増える。近い駅のあいだで大量に運ぶ工場に向く。' },
  { id: 'yard', tier: 3, cost: 160, name: '操車場', text: '駅にためられる数が 60 個から 120 個に、1 駅の編成が 3 つから 5 つに増える。' },
  { id: 'overclock', tier: 3, cost: 200, group: 'plant', name: '増速運転', text: '装置（蒸留塔・反応器・電解槽・電池・捕集器）が 1.25 倍の速さで動く。' },
  { id: 'intake', tier: 3, cost: 200, group: 'plant', name: '大口採取', text: '採取機が 1.5 倍の速さで採る。' },
];

export const researchById = (id: string) => RESEARCH.find((r) => r.id === id);
