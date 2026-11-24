"""백업(raw/products, raw/details, media_index) → 위젯용 상품별 JSON data/p/<상품번호>.json.
사진·동영상 주소는 MEDIA_BASE + 백업 파일 경로 (지금은 로컬 서버 /media/, 나중에 저장소 주소로 바꿈)."""
import json, os, sys, glob, re
BK = os.path.expanduser("~/danarobe-review/backup")
# 사용: build_widget_data.py [사진주소기준] [출력폴더] [대표사진주소기준]
#  로컬 미리보기: 인자 없음 → /media/ (backup/media 를 로컬 서버가 제공)
#  테스트 배포:  origin docs/data/p https://danarobe.github.io/danarobe-review/posters/
#               → 사진·동영상은 아직 살아 있는 원래 주소(알파 저장소), 대표 사진만 우리 쪽
MEDIA_BASE = sys.argv[1] if len(sys.argv) > 1 else "/media/"
OUT = os.path.abspath(os.path.expanduser(sys.argv[2])) if len(sys.argv) > 2 else os.path.expanduser("~/danarobe-review/data/p")
POSTER_BASE = sys.argv[3] if len(sys.argv) > 3 else MEDIA_BASE
os.makedirs(OUT, exist_ok=True)
media = {}
for m in json.load(open(os.path.join(BK, "media_index.json"))):
    if m["status"] in ("ok", "skip"):
        media.setdefault(m["review_id"], {}).setdefault(m["order"], {})[m["kind"]] = m["url"] if MEDIA_BASE == "origin" else MEDIA_BASE + m["file"][len("media/"):]
def option(o):
    # "컬러=핑크뮤트, 사이즈=S (55~77)" → "핑크뮤트/S (55~77)" (알파 화면과 같게)
    return "/".join(p.split("=", 1)[-1].strip() for p in re.split(r",\s*(?=[^,=]+=)", o)) if o else ""
summary = {}
for f in glob.glob(os.path.join(BK, "raw/products/*.json")):
    pno = os.path.basename(f)[:-5]
    det = json.load(open(os.path.join(BK, "raw/details", pno + ".json")))
    out = []
    for r in json.load(open(f))["reviews"]:
        d = det.get(str(r["id"]), {})
        ms = []
        for i in sorted(media.get(r["id"], {})):
            x = media[r["id"]][i]
            if "video" in x:
                poster = f"{str(r['id'])[:3]}/{r['id']}_{i}_poster.jpg"  # tools: qlmanage 로 뽑은 대표 사진
                ms.append({"t": "v", "src": x["video"], "thumb": (POSTER_BASE + poster.split("/")[1] if MEDIA_BASE == "origin" else MEDIA_BASE + poster) if os.path.exists(os.path.join(BK, "media", poster)) else ""})
            elif "photo" in x: ms.append({"t": "p", "src": x["photo"]})
        out.append({
            "id": r["id"], "d": r["created_at"][:19], "r": r["ratings"], "o": option(r.get("product_option")),
            "c": r["content"], "u": r.get("user_info") or "***", "v": bool(r.get("is_verified")),
            "s": [[s["label"], s["answer"]] for s in r.get("surveys") or []],
            "m": ms, "re": [[c.get("writer") or "다나로브", c.get("content", "")] for c in r.get("comments") or []],
            "b": [b.get("badge_name") for b in d.get("badges") or [] if b.get("badge_name") and b.get("badge_name") != "NEW"],
            "l": d.get("like_count") or 0,
        })
    out.sort(key=lambda x: x["d"], reverse=True)
    n = len(out); dist = {k: sum(1 for x in out if x["r"] == k) for k in range(5, 0, -1)}
    p = out[0] and json.load(open(f))["reviews"][0]["product"]
    doc = {"product_no": int(pno), "name": p.get("product_name"), "image": p.get("tiny_image"),
           "count": n, "avg": round(sum(x["r"] for x in out) / n, 1) if n else 0, "dist": dist,
           "media_count": sum(1 for x in out if x["m"]), "reviews": out}
    json.dump(doc, open(os.path.join(OUT, pno + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    summary[pno] = [n, doc["avg"]]
json.dump(summary, open(os.path.join(OUT, "..", "summary.json"), "w"), separators=(",", ":"))
sizes = sorted(os.path.getsize(p) for p in glob.glob(OUT + "/*.json"))
print("products", len(summary), "reviews", sum(v[0] for v in summary.values()), "max file KB", sizes[-1] // 1024, "total MB", sum(sizes) // 1e6)
