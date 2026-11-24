# 다나로브 리뷰 (알파리뷰 대체)

알파리뷰(월 구독 97,900원 + 트래픽 약 13만 원)를 자체 리뷰 화면으로 바꾸는 프로젝트.
조건: **기존 알파리뷰 리뷰는 하나도 없어지면 안 되고 그대로 보여야 함.**

## 폴더
| 위치 | 내용 |
|---|---|
| `backup/` | 알파리뷰 전체 백업 (2026-11-23, 리뷰 18,743건·사진·동영상). 자세한 건 `backup/README.md` |
| `tools/` | 백업·데이터 만들기 스크립트 |
| `data/p/<상품번호>.json` | 위젯이 읽는 상품별 리뷰 (`tools/build_widget_data.py` 로 백업에서 생성) |
| `widget/review.js·review.css` | 상품 상세 페이지 리뷰 화면 |
| `server/` | 로컬 미리보기 서버 (포트 3008) |
| `research/` | 2026-11-05 조사 기록 |

## 미리보기
```bash
node ~/danarobe-review/server/index.mjs
```
→ http://localhost:3008/test.html?product_no=1383

## 리뷰 화면에 있는 것 (2026-11-23)
- 리뷰 작성 안내 + [리뷰 작성] 버튼 (쓰기 화면은 다음 단계)
- 별점 요약: 평균, 점수별 막대(누르면 그 점수만)
- 포토 리뷰 모음: PC 5칸 × 2줄 넘기기, 휴대폰 옆으로 밀기
- 공지 한 줄
- 리뷰 목록: 포토&동영상만, 추천순/최신순/별점 높은순/낮은순, 직접검색, 별점 필터, 10개씩 쪽 넘기기
- 리뷰 한 건: 작성자(가림)·구매 인증·재구매 배지·키/몸무게·작성일, 상품·옵션, 본문(길면 더보기), 사진·동영상, 우리 답글
- 크게 보기 창: 사진·동영상 넘기기(화살표·키보드·휴대폰 밀기), 본문, 답글
- 상세페이지 탭 숫자: `class="dr-review-count"` 요소에 리뷰 수를 채움
- 동영상 대표 사진: 맥 `qlmanage` 로 뽑은 `backup/media/.../<id>_<n>_poster.jpg`

## 쇼핑몰에 붙이는 방법 (예정)
```html
<div id="dnrb-review" data-product-no="{$product_no}"></div>
<link rel="stylesheet" href="https://…/widget/review.css">
<script src="https://…/widget/review.js" defer></script>
```
`window.DNRB_REVIEW_CONFIG = { dataBase, writeUrl, rewardText, notice }` 로 설정 변경.

## 테스트 스킨 설치 기록 (2026-11-24)
- 테스트 스킨 skin15 (skin_no 20, "주문서 테스트 (결제슉 대체)")의 `/product/detail.html` 에서
  알파 위젯 줄(`<div class="alpha_widget" data-code="cb1eb48a" …>` + `<!-- 🌈 알파리뷰 -->`) **바로 아래**에 묶음 하나를 넣음:
  안내 띠("▼ 여기부터 새 리뷰 화면") + `<div id="dnrb-review" data-product-no="{$product_no}">` + review.css + review.js (GitHub Pages).
- 넣기 전 파일 SHA-256 앞자리 `1e5b1a676843b902` (62,138자). 되돌리기 = `<!-- 다나로브 리뷰 … -->` ~ `<!-- /다나로브 리뷰 -->` 묶음 삭제.
- 확인 주소: https://www.danarobe.com/skin-skin15/product/detail.html?product_no=1383
- 손님 화면(대표 skin16)은 손대지 않음 — danarobe.com 상세에 dnrb-review 없음 확인.
- 배포: `docs/` → https://danarobe.github.io/danarobe-review/ (저장소 danarobe/danarobe-review, 공개). 테스트 데이터의 사진·동영상은 아직 알파 저장소 원래 주소, 동영상 대표 사진만 `docs/posters/`.
  다시 만들기: `python3 -I tools/build_widget_data.py origin docs/data/p https://danarobe.github.io/danarobe-review/posters/` 후 `cp widget/* docs/widget/` → 커밋·푸시.
- GitHub Pages 는 10분 캐시라 고친 직후엔 브라우저에 옛 CSS/JS 가 남을 수 있음. 운영 적용 땐 주소에 버전(?v=)을 붙일 것.

## 리뷰 쓰기 (2026-11-24)
- 화면: 위젯의 [리뷰 작성] 또는 상품 주소에 `?dr_write=1` (알림톡·주문내역 링크용) → 쓰기 창.
- 구매 확인
  - 회원: 쇼핑몰 페이지의 카페24 SDK(`CAFE24API.init({client_id: 워크스페이스 앱 UzeJXo…})`.getCustomerIDInfo)로 회원 아이디 → 서버가 카페24 주문(최근 180일, 80일씩 나눠 조회)에서 이 상품의 배송중·배송완료·구매확정(N30/N40/N50) 품목 확인.
  - 비회원·네이버페이: 주문번호 + 주문자 휴대폰(카페24 주문의 buyer.cellphone 과 일치해야 함).
  - 확인되면 서버가 2시간짜리 서명 허가(token)를 줌. 주문 품목 하나에 리뷰 하나(order_item_code unique).
  - 비회원 확인 시도는 `dr_attempts` 에 **확인 전에 먼저 기록하고 센다**(동시에 여러 번 보내도 한도 못 넘음, 맞히면 기록 삭제). 접속 위치는 Cloudflare 의 `cf-connecting-ip` 만 믿음(손님이 못 바꿈 — 11-24 실측; x-forwarded-for 마지막 값은 Supabase 내부 주소라 쓰면 안 됨). 1시간에 같은 접속 10번·같은 접속+주문 5번·주문 전체 20번. 하루 지난 기록 자동 삭제.
  - 올린 파일은 등록 때 실제 크기를 다시 확인(사진 15MB·동영상 100MB 넘으면 지우고 거절).
  - ⚠ **운영 적용 전 꼭 고칠 것** — 회원 아이디는 브라우저가 알려 주는 값이라 남의 아이디를 넣으면 그 사람 주문으로 쓸 수 있음(그 사람 주문 품목 옵션만 보임, 돈 이득 없음). 운영 전 보완 후보: 회원도 주문번호 한 번 확인.
- 내용: 별점(필수), 10~2,000자, 빠른 문구 칩, 사진 5장(브라우저에서 긴 쪽 1600px JPEG로 줄임)·동영상 1개(100MB), 키·몸무게(선택).
- 저장: Supabase(eeffmbusaqaadeojjlnc) 표 `dr_reviews`(RLS, 정책 없음) + 보관함 `review-media`(공개 읽기, 함수가 준 1회용 주소로만 올림). SQL `supabase/reviews.sql`.
- 함수 `review-api` (`supabase/functions/review-api/index.ts`, 배포: `supabase functions deploy review-api --project-ref eeffmbusaqaadeojjlnc --no-verify-jwt`). 카페24는 **주문 읽기만**.
- 위젯은 정적 예전 리뷰 + `review-api?action=list` 새 리뷰를 합쳐 보여줌(개수·평균·분포 다시 계산).
- 적립금: 아직 자동 지급 안 함 — `reward_status='pending'` 으로 쌓임. 지급 방식은 다음 단계에서 결정.
- 점검(11-24): 실제 회원·비회원 주문으로 확인·사진 올리기·등록·중복 막기·짧은 글 막기·목록 반영까지 확인 후 시험 글 2건과 사진 삭제(표 0건·보관함 0개).

## 남은 일
1. 테스트 스킨에서 실제 상품 페이지에 붙여 알파와 비교
2. 데이터·사진 저장 위치 결정 (전송료 0원인 Cloudflare R2 후보 / 카페24)
3. 적립금 지급 방식 결정·연결, 네이버페이 구매평 가져오기, 리뷰 요청 알림톡 링크(?dr_write=1)
4. 관리자 화면 (목록·검색·숨김·답글·베스트)
5. 전환 직전 백업 한 번 더 → 알파 위젯 제거 → 알파 해지
