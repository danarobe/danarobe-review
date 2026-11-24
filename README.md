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

## 남은 일
1. 테스트 스킨에서 실제 상품 페이지에 붙여 알파와 비교
2. 데이터·사진 저장 위치 결정 (전송료 0원인 Cloudflare R2 후보 / 카페24)
3. 리뷰 쓰기 (구매자 확인, 사진·동영상 올리기, 적립금)
4. 관리자 화면 (목록·검색·숨김·답글·베스트)
5. 전환 직전 백업 한 번 더 → 알파 위젯 제거 → 알파 해지
