"""상품별 알파리뷰 전체(본문·별점·옵션·사진주소·댓글·설문)를 받아 raw/products/<번호>.json 으로 저장.
이미 개수가 맞게 저장된 상품은 건너뛴다(이어받기 가능). 읽기 전용."""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
B = "https://review-widget.alphwidget.com/v2/api-widget"
H = {"Referer": "https://danarobe.com/", "User-Agent": "Mozilla/5.0"}
WC = "e2e8aefd"
ROOT = sys.argv[1]
OUT = os.path.join(ROOT, "products"); os.makedirs(OUT, exist_ok=True)

def get(url):
    err = None
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30) as r:
                return json.load(r)
        except Exception as e:
            err = e; time.sleep(1 + i * 3)
    raise RuntimeError(f"{url}: {err}")

def fetch(pno, expect):
    path = os.path.join(OUT, f"{pno}.json")
    if os.path.exists(path):
        old = json.load(open(path))
        if len(old["reviews"]) >= expect:
            return pno, expect, len(old["reviews"]), "skip"
    meta = get(f"{B}/meta?product_no={pno}&widget_code={WC}")
    reviews = {}
    for p in range(1, meta["total_page"] + 1):
        d = get(f"{B}?product_no={pno}&widget_code={WC}&page={p}")
        if not isinstance(d, list): break
        for r in d: reviews.setdefault(r["id"], r)
    ids = list(reviews)
    for i in range(0, len(ids), 10):
        q = ",".join(map(str, ids[i:i+10]))
        for kind in ("comments", "surveys"):
            for x in get(f"{B}/reviews/{kind}?widget_code={WC}&review_ids={q}&is_dummy=false"):
                if x["review_id"] in reviews:
                    reviews[x["review_id"]][kind] = x.get(kind, [])
    json.dump({"product_no": pno, "meta": meta, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
               "reviews": list(reviews.values())}, open(path + ".tmp", "w"), ensure_ascii=False)
    os.replace(path + ".tmp", path)
    return pno, meta["total_count"], len(reviews), "ok"

metas = {}
for f in sys.argv[2:]:
    metas.update({int(k): v["total_count"] for k, v in json.load(open(f)).items() if v.get("total_count")})
todo = sorted(metas)
bad = []; done = 0
with ThreadPoolExecutor(6) as ex:
    for pno, exp, got, st in ex.map(lambda p: fetch(p, metas[p]), todo):
        done += 1
        if got < exp: bad.append((pno, exp, got))
        if done % 100 == 0: print(f"{done}/{len(todo)}", flush=True)
print("products:", len(todo), "short:", len(bad), bad[:20])
