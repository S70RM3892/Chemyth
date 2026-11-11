-- Chemyth のランキング。
-- 表には直接さわらせず、関数 2 つだけを公開する。端末の識別子は外へ返さない。

create table if not exists public.chemyth_scores (
  device uuid primary key,
  name text not null check (char_length(name) between 1 and 12),
  done int not null check (done between 0 and 500),
  points int not null check (points between 0 and 1000000),
  play_ms bigint not null check (play_ms >= 0),
  updated_at timestamptz not null default now()
);

alter table public.chemyth_scores enable row level security;
revoke all on public.chemyth_scores from anon, authenticated;

-- 自分の成績を登録・更新する
create or replace function public.chemyth_submit(p_device uuid, p_name text, p_done int, p_points int, p_play_ms bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chemyth_scores (device, name, done, points, play_ms)
  values (p_device, left(btrim(p_name), 12), greatest(0, least(p_done, 500)), greatest(0, least(p_points, 1000000)), greatest(0, p_play_ms))
  on conflict (device) do update
    set name = excluded.name, done = excluded.done, points = excluded.points, play_ms = excluded.play_ms, updated_at = now();
end
$$;

-- 上位を返す。達成数が多い順、同じなら研究点が多い順、それも同じなら時間が短い順
create or replace function public.chemyth_top(p_device uuid default null, p_limit int default 50)
returns table (rank bigint, name text, done int, points int, play_ms bigint, me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select rank() over (order by s.done desc, s.points desc, s.play_ms asc),
         s.name, s.done, s.points, s.play_ms, coalesce(s.device = p_device, false)
  from public.chemyth_scores s
  order by 1, s.updated_at
  limit least(greatest(p_limit, 1), 100)
$$;

revoke all on function public.chemyth_submit(uuid, text, int, int, bigint) from public;
revoke all on function public.chemyth_top(uuid, int) from public;
grant execute on function public.chemyth_submit(uuid, text, int, int, bigint) to anon, authenticated;
grant execute on function public.chemyth_top(uuid, int) to anon, authenticated;
