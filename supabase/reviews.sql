-- 다나로브 리뷰 (알파리뷰 대체) — 새로 쓰는 리뷰 저장 (2026-11-24)
-- 저장 위치: DNRB 워크스페이스와 같은 Supabase 프로젝트(eeffmbusaqaadeojjlnc).
-- 손님 브라우저는 표에 직접 접근하지 못한다(RLS 켜고 정책 없음). 읽기·쓰기는 모두 review-api 함수(서비스 키)를 거친다.
-- 예전 알파리뷰 18,743건은 여기 넣지 않고 정적 파일(docs/data/p)로 보여준다.

create table if not exists public.dr_reviews (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  product_no int not null,
  order_id text not null,
  order_item_code text not null unique,      -- 주문 품목 하나에 리뷰 하나
  member_id text,                            -- 회원이면 회원 아이디(화면에는 안 보임), 비회원이면 null
  writer_type text not null,                 -- member | guest
  writer_display text not null default '***',
  rating smallint not null check (rating between 1 and 5),
  content text not null,
  option_text text,
  survey jsonb not null default '[]'::jsonb, -- [["키","163"],["몸무게","55"]]
  media jsonb not null default '[]'::jsonb,  -- [{"t":"p"|"v","path":"…"}]
  status text not null default 'published',  -- published | hidden
  reward_status text not null default 'pending', -- pending | paid | none
  reward_amount int,
  admin_reply text,
  ua text
);
create index if not exists dr_reviews_product on public.dr_reviews (product_no, status, created_at desc);
create index if not exists dr_reviews_member on public.dr_reviews (member_id);
alter table public.dr_reviews enable row level security;   -- 정책 없음 = 손님(anon) 직접 접근 불가

-- 사진·동영상 보관함 (읽기는 공개 주소, 올리기는 함수가 발급한 1회용 주소로만)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-media', 'review-media', true, 104857600,
        array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
