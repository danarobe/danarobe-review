"""리뷰 상세(좋아요 수·배지·키워드·표시 플랫폼 등)를 리뷰마다 받아 raw/details/<상품번호>.json 에 저장. 이어받기 가능."""
import json, os, sys, glob, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
ROOT = sys.argv[1]; OUT = os.path.join(ROOT, "details"); os.makedirs(OUT, exist_ok=True)
H = {"Referer": "https://danarobe.com/", "User-Agent": "Mozilla/5.0"}
def get(rid):
    url = f"https://review-widget.alphwidget.com/v2/api-widget/reviews/{rid}?mall_id=wnqka5000&shop_no=1"
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30) as r:
                return json.load(r)
        except Exception as e:
            err = str(e); time.sleep(1 + i * 3)
    return {"error": err}
def one(f):
    pno = os.path.basename(f)[:-5]; out = os.path.join(OUT, pno + ".json")
    revs = json.load(open(f))["reviews"]
    if os.path.exists(out) and len(json.load(open(out))) == len(revs): return 0
    res = {r["id"]: get(r["id"]) for r in revs}
    json.dump(res, open(out, "w"), ensure_ascii=False)
    return sum(1 for v in res.values() if "error" in v or "id" not in v)
files = sorted(glob.glob(os.path.join(ROOT, "products", "*.json")))
bad = 0
with ThreadPoolExecutor(4) as ex:
    for n, b in enumerate(ex.map(one, files), 1):
        bad += b
        if n % 100 == 0: print(f"{n}/{len(files)} bad={bad}", flush=True)
print("done files", len(files), "bad", bad)
