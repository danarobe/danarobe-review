"""저장된 리뷰의 사진·동영상 원본을 media/ 아래에 받는다. 이미 받은 파일은 건너뜀. 결과 목록은 media_index.json."""
import json, os, sys, glob, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
ROOT = sys.argv[1]; MED = os.path.join(ROOT, "..", "media")
H = {"User-Agent": "Mozilla/5.0", "Referer": "https://danarobe.com/"}
jobs = []
for f in glob.glob(os.path.join(ROOT, "products", "*.json")):
    for r in json.load(open(f))["reviews"]:
        for i, m in enumerate(r.get("ordered_media") or []):
            for key in ("photo_url", "video_url", "thumbnail_video_url"):
                u = m.get(key)
                if not u and key == "photo_url": u = m.get("photo_platform_url")
                if not u: continue
                ext = os.path.splitext(urllib.parse.urlparse(u).path)[1] or ".bin"
                kind = {"photo_url": "photo", "video_url": "video", "thumbnail_video_url": "videothumb"}[key]
                jobs.append((r["id"], i, kind, u, os.path.join(MED, str(r["id"])[:3], f"{r['id']}_{i}_{kind}{ext}")))
def dl(j):
    rid, i, kind, u, path = j
    if os.path.exists(path) and os.path.getsize(path) > 0: return j, "skip", os.path.getsize(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    err = None
    for t in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=120) as r, open(path + ".part", "wb") as w:
                while True:
                    b = r.read(1 << 16)
                    if not b: break
                    w.write(b)
            os.replace(path + ".part", path); return j, "ok", os.path.getsize(path)
        except Exception as e:
            err = str(e); time.sleep(1 + t * 3)
    return j, "fail:" + err, 0
print("files:", len(jobs), flush=True)
idx = []; fails = []; total = 0
with ThreadPoolExecutor(8) as ex:
    for n, (j, st, sz) in enumerate(ex.map(dl, jobs), 1):
        idx.append({"review_id": j[0], "order": j[1], "kind": j[2], "url": j[3], "file": os.path.relpath(j[4], os.path.join(ROOT, "..")), "status": st, "bytes": sz})
        total += sz
        if st.startswith("fail"): fails.append(idx[-1])
        if n % 2000 == 0: print(f"{n}/{len(jobs)} {total/1e9:.1f}GB fails={len(fails)}", flush=True)
json.dump(idx, open(os.path.join(ROOT, "..", "media_index.json"), "w"), ensure_ascii=False)
print("done", len(jobs), f"{total/1e9:.2f}GB", "fails", len(fails), fails[:5])
