"""상품 번호 1..N 을 훑어 알파리뷰 리뷰 수(meta)를 기록한다. 읽기 전용."""
import json, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
B = "https://review-widget.alphwidget.com/v2/api-widget/meta"
H = {"Referer": "https://danarobe.com/", "User-Agent": "Mozilla/5.0"}
WC = "e2e8aefd"
def meta(pno):
    url = f"{B}?product_no={pno}&widget_code={WC}"
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=20) as r:
                return pno, json.load(r)
        except Exception as e:
            err = str(e); time.sleep(1 + i * 2)
    return pno, {"error": err}
lo, hi, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
with ThreadPoolExecutor(6) as ex:
    res = dict(ex.map(meta, range(lo, hi + 1)))
json.dump(res, open(out, "w"), ensure_ascii=False)
has = {k: v.get("total_count") for k, v in res.items() if isinstance(v, dict) and v.get("total_count")}
errs = [k for k, v in res.items() if "error" in v or "total_count" not in v]
print("products with reviews:", len(has), "reviews:", sum(has.values()), "max pno with reviews:", max(has) if has else None, "errors/odd:", len(errs), errs[:10])
