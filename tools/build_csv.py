"""백업 JSON → reviews_all.csv (엑셀에서 바로 열리게 UTF-8 BOM)."""
import json, os, sys, glob, csv
ROOT = sys.argv[1]; BASE = os.path.join(ROOT, "..")
media = {}
p = os.path.join(BASE, "media_index.json")
if os.path.exists(p):
    for m in json.load(open(p)):
        media.setdefault(m["review_id"], []).append(m)
rows = []
for f in glob.glob(os.path.join(ROOT, "products", "*.json")):
    pno = os.path.basename(f)[:-5]
    dp = os.path.join(ROOT, "details", pno + ".json")
    det = json.load(open(dp)) if os.path.exists(dp) else {}
    for r in json.load(open(f))["reviews"]:
        d = det.get(str(r["id"]), {})
        ms = media.get(r["id"], [])
        rows.append({
            "리뷰ID": r["id"], "작성일": r["created_at"][:19].replace("T", " "),
            "상품번호": r["product"]["product_no"], "상품명": r["product"]["product_name"],
            "옵션": r.get("product_option") or "", "별점": r["ratings"], "내용": r["content"],
            "작성자표시": r.get("user_info"), "로그인": r.get("login_provider") or "",
            "구매인증": "Y" if r.get("is_verified") else "", "표시플랫폼": d.get("platform_display", ""),
            "좋아요": d.get("like_count", ""), "배지": ", ".join(str(b.get("badge_name", b)) if isinstance(b, dict) else str(b) for b in d.get("badges") or []),
            "설문": " / ".join(f"{s['label']}:{s['answer']}" for s in r.get("surveys") or []),
            "답글": "\n---\n".join(f"[{c.get('writer')}] {c.get('content')}" for c in r.get("comments") or []),
            "사진수": sum(1 for m in ms if m["kind"] == "photo"), "동영상수": sum(1 for m in ms if m["kind"] == "video"),
            "백업파일": " | ".join(m["file"] for m in ms if m["kind"] != "videothumb"),
        })
rows.sort(key=lambda x: x["작성일"])
with open(os.path.join(BASE, "reviews_all.csv"), "w", newline="", encoding="utf-8-sig") as w:
    wr = csv.DictWriter(w, fieldnames=list(rows[0])); wr.writeheader(); wr.writerows(rows)
print("rows", len(rows), "first", rows[0]["작성일"], "last", rows[-1]["작성일"])
