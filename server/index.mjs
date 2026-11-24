// 다나로브 리뷰 — 로컬 개발 서버 (포트 3008)
// /widget/*  위젯 스크립트·스타일
// /data/*    상품별 리뷰 JSON (tools/build_widget_data.py 로 생성)
// /media/*   백업한 사진·동영상 원본 (backup/media)
// /test.html 상품 번호를 바꿔 가며 보는 미리보기 페이지
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3008);
const MOUNTS = {
  "/widget/": path.join(ROOT, "widget"),
  "/data/": path.join(ROOT, "data"),
  "/media/": path.join(ROOT, "backup", "media"),
  "/": path.join(ROOT, "server", "public"),
};
const TYPES = {
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".MOV": "video/quicktime",
};

http.createServer((req, res) => {
  // 운영 쇼핑몰 화면에 끼워 미리볼 수 있게 (https 페이지 → localhost)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Headers": "*" }); return res.end(); }
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const mount = Object.keys(MOUNTS).find((m) => url.startsWith(m));
  const base = MOUNTS[mount];
  const file = path.join(base, url.slice(mount.length) || "test.html");
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("not found");
  }
  const ext = path.extname(file);
  const type = TYPES[ext] || TYPES[ext.toLowerCase()] || "application/octet-stream";
  const stat = fs.statSync(file);
  const headers = { "Content-Type": type, "Cache-Control": mount === "/media/" ? "public, max-age=86400" : "no-cache" };
  // 동영상 앞뒤 이동(Range) 지원
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range && type.startsWith("video")) {
    const start = Number(range[1] || 0), end = range[2] ? Number(range[2]) : stat.size - 1;
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  if (/json|javascript|css|html/.test(type) && /gzip/.test(req.headers["accept-encoding"] || "")) {
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip" });
    return fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": stat.size, "Accept-Ranges": "bytes" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`다나로브 리뷰 개발 서버: http://localhost:${PORT}/test.html`));
