"""알파 관리자 엑셀(csv)들을 합쳐 위젯 백업에 없는 리뷰(=숨김 리뷰 등)를 찾고, 그 사진·동영상을 받는다.
엑셀의 사진 주소는 7일 뒤 만료되는 서명 주소라 받은 즉시 실행해야 함.
결과: backup/alpha_excel/hidden_reviews.json, backup/media_hidden/<리뷰번호>_<순서>.<확장자>
※ 엑셀에는 실명·회원ID·주문번호가 있어 이 폴더는 공개 저장소에 올리면 안 됨."""
import csv, json, glob, os, time, urllib.request, urllib.parse
BK = os.path.expanduser("~/danarobe-review/backup")
ours = set()
key = lambda d, rt, c: (d, str(rt), "".join(c.split())[:20])
for f in glob.glob(f"{BK}/raw/products/*.json"):
    for r in json.load(open(f))["reviews"]:
        ours.add(key(r["created_at"][2:16].replace("T", " "), r["ratings"], r["content"]))
rows = {}
for f in sorted(glob.glob(f"{BK}/alpha_excel/*.csv")):
    for r in csv.DictReader(open(f, encoding="utf-8-sig")):
        rows[r["리뷰번호"]] = r
hidden = [r for r in rows.values() if key(r["리뷰작성일시"], r["리뷰평점"], r["리뷰내용"]) not in ours]
os.makedirs(f"{BK}/media_hidden", exist_ok=True)
fails = 0; got = 0
for r in hidden:
    files = []
    urls = [("photo", r.get(f"포토URL{i}")) for i in range(1, 6)] + [("video", r.get("동영상URL1"))]
    for n, (kind, u) in enumerate(x for x in urls if x[1]):
        ext = os.path.splitext(urllib.parse.urlparse(u).path)[1] or ".bin"
        path = f"{BK}/media_hidden/{r['리뷰번호']}_{n}{ext}"
        if not (os.path.exists(path) and os.path.getsize(path)):
            for t in range(4):
                try:
                    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=120) as res:
                        open(path, "wb").write(res.read()); got += 1; break
                except Exception as e:
                    err = str(e); time.sleep(1 + t * 2)
            else:
                fails += 1; print("fail", r["리뷰번호"], n, err[:80]); continue
        files.append({"kind": kind, "file": os.path.relpath(path, BK)})
    r["_files"] = files
json.dump(hidden, open(f"{BK}/alpha_excel/hidden_reviews.json", "w"), ensure_ascii=False, indent=0)
print("excel reviews", len(rows), "not in widget backup", len(hidden), "new files", got, "fails", fails)
