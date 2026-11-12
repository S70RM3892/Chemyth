-- Chemyth のアカウントと、端末をまたいだセーブの共有。
--
-- メールは使わない。アカウント名と合言葉だけで登録する（Supabase の標準のログインは、確認メールが要り、
-- 標準の送信機能はプロジェクトのチーム員の宛先にしか送れないので、遊ぶ人が自由に登録できない）。
--
-- 表は、外から見えないスキーマ chemyth_private に置く。外へ出すのは public の関数だけで、どれも合言葉か
-- ログインの印（トークン）を確かめてから動く。合言葉は bcrypt のハッシュで、トークンは SHA-256 のハッシュで持つ。

create schema if not exists chemyth_private;
revoke all on schema chemyth_private from public, anon, authenticated;

create table if not exists chemyth_private.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 16),
  -- 小文字にそろえた名前。大文字・小文字だけが違う名前は、同じ名前として扱う
  name_key text not null unique,
  pass_hash text not null,
  -- 続けて合言葉を間違えた回数と、ログインを止めている期限
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists chemyth_private.sessions (
  token_hash bytea primary key,
  account_id uuid not null references chemyth_private.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz not null default now()
);
create index if not exists sessions_account_idx on chemyth_private.sessions (account_id);

create table if not exists chemyth_private.saves (
  account_id uuid not null references chemyth_private.accounts (id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  -- セーブの中身（端末で圧縮した文字列）
  data text not null check (char_length(data) <= 1500000),
  -- 一覧に出す要約（達成数・研究点・時間など）
  summary jsonb not null default '{}'::jsonb check (pg_column_size(summary) <= 4000),
  -- 書き換えるたびに 1 増える。端末は、最後に見た番号を添えて書き込み、食い違えば上書きしない
  rev bigint not null default 1,
  device text not null default '' check (char_length(device) <= 40),
  updated_at timestamptz not null default now(),
  primary key (account_id, slot)
);

-- 同じ接続元からの登録の数（1 日ごと）。接続元の番号そのものは持たず、ハッシュだけを持つ
create table if not exists chemyth_private.signups (
  ip_hash text not null,
  day date not null,
  n int not null default 0,
  primary key (ip_hash, day)
);

alter table chemyth_private.accounts enable row level security;
alter table chemyth_private.sessions enable row level security;
alter table chemyth_private.saves enable row level security;
alter table chemyth_private.signups enable row level security;
revoke all on all tables in schema chemyth_private from public, anon, authenticated;

-- ---- 中で使う関数（外からは呼べない）----

create or replace function chemyth_private.ip_hash()
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to('chemyth:' || coalesce(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1), 'unknown'), 'utf8')), 'hex')
$$;

-- トークンから、アカウントを求める。180 日使われなかったトークンは無効
create or replace function chemyth_private.account_of(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_id uuid;
  v_used timestamptz;
begin
  if p_token is null or char_length(p_token) <> 64 then return null; end if;
  v_hash := sha256(convert_to(p_token, 'utf8'));
  select s.account_id, s.used_at into v_id, v_used from chemyth_private.sessions s where s.token_hash = v_hash;
  if v_id is null or v_used < now() - interval '180 days' then return null; end if;
  -- 使った日付の書き換えは、1 日に 1 回で足りる
  if v_used < now() - interval '1 day' then
    update chemyth_private.sessions set used_at = now() where token_hash = v_hash;
  end if;
  return v_id;
end
$$;

-- 新しいトークンを作って返す。1 つのアカウントのトークンは 10 個まで（古いものから捨てる）
create or replace function chemyth_private.new_session(p_account uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from chemyth_private.sessions s
   where s.account_id = p_account
     and (s.used_at < now() - interval '180 days'
       or s.token_hash in (select t.token_hash from chemyth_private.sessions t where t.account_id = p_account order by t.used_at desc offset 9));
  insert into chemyth_private.sessions (token_hash, account_id) values (sha256(convert_to(v_token, 'utf8')), p_account);
  return v_token;
end
$$;

revoke all on all functions in schema chemyth_private from public, anon, authenticated;

-- ---- 外へ出す関数 ----
-- 失敗は、例外ではなく {"error": "..."} で返す（例外にすると、間違えた回数の記録まで取り消されてしまう）

-- 登録する。名前は 3〜16 文字（空白なし）、合言葉は 8 文字以上
create or replace function public.chemyth_account_register(p_name text, p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_n int;
begin
  if char_length(v_name) < 3 or char_length(v_name) > 16 or v_name ~ '[[:space:][:cntrl:]]' then
    return jsonb_build_object('error', 'bad_name');
  end if;
  if p_pass is null or char_length(p_pass) < 8 or octet_length(p_pass) > 72 then
    return jsonb_build_object('error', 'bad_pass');
  end if;
  if exists (select 1 from chemyth_private.accounts a where a.name_key = lower(v_name)) then
    return jsonb_build_object('error', 'name_taken');
  end if;
  -- 同じ接続元からは、1 日に 10 個まで
  insert into chemyth_private.signups as g (ip_hash, day, n) values (chemyth_private.ip_hash(), current_date, 1)
    on conflict (ip_hash, day) do update set n = g.n + 1
    returning g.n into v_n;
  if v_n > 10 then return jsonb_build_object('error', 'too_many'); end if;
  begin
    insert into chemyth_private.accounts (name, name_key, pass_hash)
    values (v_name, lower(v_name), extensions.crypt(p_pass, extensions.gen_salt('bf', 10)))
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('error', 'name_taken');
  end;
  return jsonb_build_object('ok', true, 'name', v_name, 'token', chemyth_private.new_session(v_id));
end
$$;

-- ログインする。5 回続けて間違えると、しばらく（30 秒から、間違えるたびに倍、最長 1 時間）ログインできない
create or replace function public.chemyth_account_login(p_name text, p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a chemyth_private.accounts%rowtype;
  v_fails int;
begin
  select * into a from chemyth_private.accounts x where x.name_key = lower(btrim(coalesce(p_name, ''))) for update;
  if not found then
    -- 名前があるかどうかを、かかる時間から探られないように、同じだけ計算する
    perform extensions.crypt(coalesce(p_pass, ''), extensions.gen_salt('bf', 10));
    return jsonb_build_object('error', 'bad_login');
  end if;
  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('error', 'locked', 'wait', ceil(extract(epoch from a.locked_until - now()))::int);
  end if;
  if p_pass is not null and octet_length(p_pass) <= 72 and a.pass_hash = extensions.crypt(p_pass, a.pass_hash) then
    update chemyth_private.accounts set fails = 0, locked_until = null where id = a.id;
    return jsonb_build_object('ok', true, 'name', a.name, 'token', chemyth_private.new_session(a.id));
  end if;
  v_fails := a.fails + 1;
  update chemyth_private.accounts
     set fails = v_fails,
         locked_until = case when v_fails >= 5 then now() + least(interval '1 hour', interval '30 seconds' * power(2, least(v_fails - 5, 10))) end
   where id = a.id;
  return jsonb_build_object('error', 'bad_login');
end
$$;

-- ログアウトする（この端末のトークンを捨てる）
create or replace function public.chemyth_account_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is not null and char_length(p_token) = 64 then
    delete from chemyth_private.sessions where token_hash = sha256(convert_to(p_token, 'utf8'));
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- 合言葉を変える。ほかの端末は、ログインし直しになる
create or replace function public.chemyth_account_password(p_token text, p_old text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := chemyth_private.account_of(p_token);
  a chemyth_private.accounts%rowtype;
begin
  if v_id is null then return jsonb_build_object('error', 'signed_out'); end if;
  if p_new is null or char_length(p_new) < 8 or octet_length(p_new) > 72 then return jsonb_build_object('error', 'bad_pass'); end if;
  select * into a from chemyth_private.accounts x where x.id = v_id for update;
  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('error', 'locked', 'wait', ceil(extract(epoch from a.locked_until - now()))::int);
  end if;
  if p_old is null or octet_length(p_old) > 72 or a.pass_hash <> extensions.crypt(p_old, a.pass_hash) then
    update chemyth_private.accounts set fails = a.fails + 1,
           locked_until = case when a.fails + 1 >= 5 then now() + least(interval '1 hour', interval '30 seconds' * power(2, least(a.fails + 1 - 5, 10))) end
     where id = v_id;
    return jsonb_build_object('error', 'bad_login');
  end if;
  update chemyth_private.accounts set pass_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), fails = 0, locked_until = null where id = v_id;
  delete from chemyth_private.sessions where account_id = v_id and token_hash <> sha256(convert_to(p_token, 'utf8'));
  return jsonb_build_object('ok', true);
end
$$;

-- アカウントを消す（預けたセーブも消える）。合言葉で確かめる
create or replace function public.chemyth_account_delete(p_token text, p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := chemyth_private.account_of(p_token);
  v_hash text;
begin
  if v_id is null then return jsonb_build_object('error', 'signed_out'); end if;
  select x.pass_hash into v_hash from chemyth_private.accounts x where x.id = v_id for update;
  if p_pass is null or octet_length(p_pass) > 72 or v_hash <> extensions.crypt(p_pass, v_hash) then
    return jsonb_build_object('error', 'bad_login');
  end if;
  delete from chemyth_private.accounts where id = v_id;
  return jsonb_build_object('ok', true);
end
$$;

-- 預けてあるセーブの一覧（中身は返さない）
create or replace function public.chemyth_save_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := chemyth_private.account_of(p_token);
begin
  if v_id is null then return jsonb_build_object('error', 'signed_out'); end if;
  return jsonb_build_object('ok', true,
    'name', (select a.name from chemyth_private.accounts a where a.id = v_id),
    'saves', coalesce((
      select jsonb_agg(jsonb_build_object('slot', s.slot, 'rev', s.rev, 'at', floor(extract(epoch from s.updated_at) * 1000)::bigint,
                                          'device', s.device, 'bytes', char_length(s.data), 'summary', s.summary) order by s.slot)
      from chemyth_private.saves s where s.account_id = v_id), '[]'::jsonb));
end
$$;

-- セーブを 1 つ取り出す
create or replace function public.chemyth_save_get(p_token text, p_slot int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := chemyth_private.account_of(p_token);
  s chemyth_private.saves%rowtype;
begin
  if v_id is null then return jsonb_build_object('error', 'signed_out'); end if;
  select * into s from chemyth_private.saves x where x.account_id = v_id and x.slot = p_slot;
  if not found then return jsonb_build_object('error', 'empty'); end if;
  return jsonb_build_object('ok', true, 'slot', s.slot, 'rev', s.rev, 'at', floor(extract(epoch from s.updated_at) * 1000)::bigint,
                            'device', s.device, 'summary', s.summary, 'data', s.data);
end
$$;

-- セーブを預ける。p_base_rev は、この端末が最後に見た番号（初めてなら 0）。
-- ほかの端末が先に書き換えていたら、上書きせずに {"error": "conflict", ...} を返す。p_force で、それでも上書きする
create or replace function public.chemyth_save_put(p_token text, p_slot int, p_data text, p_base_rev bigint, p_device text, p_summary jsonb, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := chemyth_private.account_of(p_token);
  s chemyth_private.saves%rowtype;
  v_rev bigint;
  v_at timestamptz;
begin
  if v_id is null then return jsonb_build_object('error', 'signed_out'); end if;
  if p_slot is null or p_slot < 1 or p_slot > 3 then return jsonb_build_object('error', 'bad_slot'); end if;
  if p_data is null or char_length(p_data) < 1 or char_length(p_data) > 1500000 then return jsonb_build_object('error', 'too_big'); end if;
  if p_summary is not null and pg_column_size(p_summary) > 4000 then return jsonb_build_object('error', 'too_big'); end if;
  select * into s from chemyth_private.saves x where x.account_id = v_id and x.slot = p_slot for update;
  if found and not coalesce(p_force, false) and s.rev <> coalesce(p_base_rev, 0) then
    return jsonb_build_object('error', 'conflict', 'rev', s.rev, 'at', floor(extract(epoch from s.updated_at) * 1000)::bigint, 'device', s.device, 'summary', s.summary);
  end if;
  insert into chemyth_private.saves as t (account_id, slot, data, summary, device)
  values (v_id, p_slot, p_data, coalesce(p_summary, '{}'::jsonb), left(coalesce(p_device, ''), 40))
  on conflict (account_id, slot) do update
    set data = excluded.data, summary = excluded.summary, device = excluded.device, rev = t.rev + 1, updated_at = now()
  returning t.rev, t.updated_at into v_rev, v_at;
  return jsonb_build_object('ok', true, 'rev', v_rev, 'at', floor(extract(epoch from v_at) * 1000)::bigint);
end
$$;

-- 預けたセーブを 1 つ消す
create or replace function public.chemyth_save_delete(p_token text, p_slot int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := chemyth_private.account_of(p_token);
begin
  if v_id is null then return jsonb_build_object('error', 'signed_out'); end if;
  delete from chemyth_private.saves where account_id = v_id and slot = p_slot;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.chemyth_account_register(text, text) from public;
revoke all on function public.chemyth_account_login(text, text) from public;
revoke all on function public.chemyth_account_logout(text) from public;
revoke all on function public.chemyth_account_password(text, text, text) from public;
revoke all on function public.chemyth_account_delete(text, text) from public;
revoke all on function public.chemyth_save_list(text) from public;
revoke all on function public.chemyth_save_get(text, int) from public;
revoke all on function public.chemyth_save_put(text, int, text, bigint, text, jsonb, boolean) from public;
revoke all on function public.chemyth_save_delete(text, int) from public;
grant execute on function public.chemyth_account_register(text, text) to anon, authenticated;
grant execute on function public.chemyth_account_login(text, text) to anon, authenticated;
grant execute on function public.chemyth_account_logout(text) to anon, authenticated;
grant execute on function public.chemyth_account_password(text, text, text) to anon, authenticated;
grant execute on function public.chemyth_account_delete(text, text) to anon, authenticated;
grant execute on function public.chemyth_save_list(text) to anon, authenticated;
grant execute on function public.chemyth_save_get(text, int) to anon, authenticated;
grant execute on function public.chemyth_save_put(text, int, text, bigint, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.chemyth_save_delete(text, int) to anon, authenticated;
