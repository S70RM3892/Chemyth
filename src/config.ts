/** オンラインのランキングの接続先（Supabase）。
 *  url と key を空にすると、この端末のノート同士の順位だけを出す。
 *  key は公開してよい publishable（anon）キーを入れる。書き込みは supabase/migrations の関数経由でしかできない */
export const RANKING = {
  url: 'https://ryqkdquyxztityoxeyge.supabase.co',
  key: 'sb_publishable_Fswnf2NmO2a3MXcoKr_lTg_Mfml5gsH',
};
