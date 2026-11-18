-- 投票日和：陣営ログイン用のデータベース設定
-- Supabase の「SQL Editor」にこのファイルの中身を貼り付けて、1回だけ実行してください。

-- 陣営アカウント（ログインした人1人につき1行）
create table if not exists public.campaigns (
  id uuid primary key references auth.users on delete cascade,
  email text,
  applicant_name text not null,          -- 申込者の氏名
  applicant_role text,                   -- 立場（本人・陣営スタッフなど）
  phone text not null,                   -- 本人確認の連絡先
  candidate_name text not null,          -- 候補者名（告示・報道どおり）
  election_name text not null,           -- 選挙名（サイトの表記どおり）
  district text not null default '全域', -- 選挙区名（1区だけの選挙は「全域」）
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  plan text not null default 'free' check (plan in ('free','std','pre')),
  kata text,                             -- 肩書
  catch_copy text,                       -- キャッチコピー（スタンダード以上）
  policy text,                           -- 政策・メッセージ（スタンダード以上）
  activity text,                         -- 活動実績（プレミアム）
  youtube text,                          -- YouTube の URL（プレミアム）
  sns text,                              -- SNS の URL（1行に1つ。スタンダード以上）
  photo_path text,                       -- 写真（photos バケット内のパス）
  admin_note text,                       -- 運営メモ（陣営からは見えない・変更できない）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 運営（管理者）。ここに自分のユーザーIDを1行入れると運営画面が使えます。
create table if not exists public.admins (user_id uuid primary key references auth.users on delete cascade);

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

alter table public.campaigns enable row level security;
alter table public.admins enable row level security;

drop policy if exists "campaigns read own" on public.campaigns;
drop policy if exists "campaigns insert own" on public.campaigns;
drop policy if exists "campaigns update own" on public.campaigns;
drop policy if exists "campaigns delete admin" on public.campaigns;
drop policy if exists "admins read self" on public.admins;
create policy "campaigns read own" on public.campaigns for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "campaigns insert own" on public.campaigns for insert to authenticated with check (id = auth.uid() and status = 'pending' and plan = 'free');
create policy "campaigns update own" on public.campaigns for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "campaigns delete admin" on public.campaigns for delete to authenticated using (public.is_admin());
create policy "admins read self" on public.admins for select to authenticated using (user_id = auth.uid());

-- 陣営が変えてはいけない項目を守り、プランで使えない項目を空にする
create or replace function public.campaigns_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at := now();
  if not public.is_admin() then
    new.id := old.id; new.email := old.email; new.status := old.status; new.plan := old.plan;
    new.admin_note := old.admin_note; new.created_at := old.created_at;
    if old.status = 'approved' then
      new.candidate_name := old.candidate_name; new.election_name := old.election_name; new.district := old.district;
    end if;
  end if;
  if new.plan = 'free' then new.catch_copy := null; new.policy := null; new.sns := null; end if;
  if new.plan <> 'pre' then new.activity := null; new.youtube := null; end if;
  new.catch_copy := left(new.catch_copy, 40);
  if new.plan = 'std' then new.policy := left(new.policy, 2000); end if;
  return new;
end $$;
drop trigger if exists campaigns_guard on public.campaigns;
create trigger campaigns_guard before update on public.campaigns for each row execute function public.campaigns_guard();

-- サイトに表示してよい項目だけを、承認済みの陣営について公開する
create or replace view public.public_campaigns as
  select id, candidate_name, election_name, district, plan, kata,
    case when plan <> 'free' then catch_copy end as catch_copy,
    case when plan <> 'free' then policy end as policy,
    case when plan = 'pre' then activity end as activity,
    case when plan = 'pre' then youtube end as youtube,
    case when plan <> 'free' then sns end as sns,
    photo_path, updated_at
  from public.campaigns where status = 'approved';
grant select on public.public_campaigns to anon, authenticated;

-- 写真（公開・5MBまで・JPEG/PNG/WebP）。自分のフォルダにだけ保存できる
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "photos insert own" on storage.objects;
drop policy if exists "photos update own" on storage.objects;
drop policy if exists "photos delete own" on storage.objects;
create policy "photos insert own" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos update own" on storage.objects for update to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos delete own" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
