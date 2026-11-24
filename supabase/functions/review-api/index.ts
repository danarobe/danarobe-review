// ═══════════════════════════════════════════════
// 다나로브 리뷰 API (알파리뷰 대체) — 2026-11-24
//   GET  ?action=list&product_no=N          → 이 상품의 새 리뷰(게시된 것만, 공개 항목만)
//   POST {action:"eligible", product_no, member_id}            → 회원: 이 상품을 산 주문 품목 찾기
//   POST {action:"eligible", product_no, order_id, phone}      → 비회원·네이버페이: 주문번호 + 주문자 휴대폰
//        → { token, items:[{code, option, date}] }   token = 서명된 2시간짜리 작성 허가
//   POST {action:"upload", token, files:[{type,size}]}         → 사진·동영상 1회용 올리기 주소
//   POST {action:"submit", token, code, rating, content, survey, media:[path]} → 저장
//
// 카페24 쓰기는 하지 않는다(주문 읽기만). 적립금은 reward_status='pending' 으로 남기고 지급은 별도 단계.
// 표 dr_reviews 와 보관함 review-media 는 ../../reviews.sql 참고.
// ═══════════════════════════════════════════════

const MALL_ID = Deno.env.get("CAFE24_MALL_ID")!;
const CLIENT_ID = Deno.env.get("CAFE24_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("CAFE24_CLIENT_SECRET")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = (Deno.env.get("SB_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
const API_BASE = `https://${MALL_ID}.cafe24api.com/api/v2`;
const API_VERSION = "2026-03-01";
const BUCKET = "review-media";
const ALLOWED_ORIGINS = [/^https:\/\/(www\.)?danarobe\.com$/, /^https:\/\/m\.danarobe\.com$/, /^https:\/\/wnqka5000\.cafe24\.com$/, /^http:\/\/localhost:\d+$/];
// 리뷰를 쓸 수 있는 주문 품목 상태: 배송중·배송완료·구매확정 (카페24 order_status)
const OK_STATUS = new Set(["N30", "N40", "N50"]);
const WINDOW_DAYS = 180;          // 주문일 기준 최근 180일 안의 주문만
const MAX_PHOTOS = 5, MAX_VIDEOS = 1;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024, MAX_VIDEO_BYTES = 100 * 1024 * 1024;

// ── 공통 ──
function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.some((r) => r.test(o)) ? o : "https://www.danarobe.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(req), ...extra } });
}
class UserError extends Error {}

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SB_URL}${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw Object.assign(new Error(`supabase ${res.status}: ${text.slice(0, 300)}`), { status: res.status, body });
  return body;
}

// ── 서명 토큰 (HMAC-SHA256, 키 = 서비스 키에서 파생 — 따로 비밀값을 두지 않음) ──
const enc = new TextEncoder();
let hmacKey: CryptoKey | null = null;
async function key() {
  if (hmacKey) return hmacKey;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("dnrb-review-token:" + SB_KEY));
  hmacKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return hmacKey;
}
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function sign(payload: Record<string, unknown>) {
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(p)));
  return p + "." + b64u(s);
}
async function verify(token: string): Promise<any> {
  const [p, s] = String(token || "").split(".");
  if (!p || !s) throw new UserError("작성 허가가 없어요. 처음부터 다시 시도해 주세요.");
  const ok = await crypto.subtle.verify("HMAC", await key(), unb64u(s), enc.encode(p));
  if (!ok) throw new UserError("작성 허가가 올바르지 않아요. 처음부터 다시 시도해 주세요.");
  const body = JSON.parse(new TextDecoder().decode(unb64u(p)));
  if (body.exp < Date.now()) throw new UserError("작성 시간이 지났어요(2시간). 처음부터 다시 시도해 주세요.");
  return body;
}

// ── 카페24 (주문 읽기만) — 토큰 갱신은 워크스페이스 함수들과 같은 방식(api_tokens 공유) ──
async function getToken(): Promise<any> {
  const rows = await sb(`/rest/v1/api_tokens?provider=eq.cafe24&select=*`);
  return rows?.[0] ?? null;
}
async function accessToken(force = false): Promise<string> {
  const t = await getToken();
  if (!t?.refresh_token) throw new Error("카페24 미연동");
  const exp = t.expires_at ? new Date(t.expires_at).getTime() : 0;
  if (!force && exp - Date.now() > 5 * 60 * 1000 && t.access_token) return t.access_token;
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token }),
  });
  const body = await res.json();
  if (!res.ok) {
    await new Promise((r) => setTimeout(r, 1500));
    const latest = await getToken();
    if (latest?.access_token && latest.access_token !== t.access_token) return latest.access_token;
    throw new Error(`카페24 토큰 갱신 실패 ${res.status}`);
  }
  const now = Date.now();
  await sb(`/rest/v1/api_tokens?on_conflict=provider`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      provider: "cafe24",
      access_token: String(body.access_token ?? ""),
      refresh_token: String(body.refresh_token ?? t.refresh_token),
      expires_at: body.expires_at ? new Date(String(body.expires_at)).toISOString() : new Date(now + 2 * 3600e3).toISOString(),
      refresh_expires_at: body.refresh_token_expires_at ? new Date(String(body.refresh_token_expires_at)).toISOString() : new Date(now + 14 * 86400e3).toISOString(),
    }),
  });
  return String(body.access_token);
}
async function c24(path: string): Promise<any> {
  let tok = await accessToken();
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${tok}`, "X-Cafe24-Api-Version": API_VERSION } });
    if (res.status === 401) { tok = await accessToken(true); continue; }
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1200 * (i + 1))); continue; }
    if (res.status === 404) return {};
    if (!res.ok) throw new Error(`카페24 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error("카페24 응답 지연");
}
const ymd = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

// 주문 목록에서 이 상품의 리뷰 가능한 품목만 고른다
function pickItems(orders: any[], productNo: number) {
  const out: any[] = [];
  for (const o of orders) {
    for (const it of (o.items ?? [])) {
      if (Number(it.product_no) !== productNo) continue;
      if (!OK_STATUS.has(String(it.order_status ?? ""))) continue;
      out.push({
        code: String(it.order_item_code), order_id: String(o.order_id),
        option: String(it.option_value || it.option_value_default || "").trim(),
        date: String(o.order_date ?? "").slice(0, 10),
        member_id: String(o.member_id ?? "") || null,
      });
    }
  }
  return out;
}
async function ordersForMember(memberId: string) {
  // 카페24는 조회 기간 3개월 제한 → 80일씩 나눠 조회
  const all: any[] = [];
  const end = new Date();
  for (let back = 0; back < WINDOW_DAYS; back += 80) {
    const b = new Date(end.getTime() - back * 86400e3), a = new Date(b.getTime() - Math.min(80, WINDOW_DAYS - back) * 86400e3);
    for (let offset = 0; offset < 1000; offset += 100) {
      const body = await c24(`/admin/orders?shop_no=1&member_id=${encodeURIComponent(memberId)}&start_date=${ymd(a)}&end_date=${ymd(b)}&date_type=order_date&embed=items&limit=100&offset=${offset}`);
      const os = body.orders ?? [];
      all.push(...os);
      if (os.length < 100) break;
    }
  }
  return all;
}
async function alreadyReviewed(codes: string[]) {
  if (!codes.length) return new Set<string>();
  const rows = await sb(`/rest/v1/dr_reviews?select=order_item_code&order_item_code=in.(${codes.map((c) => `"${c}"`).join(",")})`);
  return new Set((rows ?? []).map((r: any) => String(r.order_item_code)));
}

// ── 동작 ──
async function eligible(body: any) {
  const productNo = Number(body.product_no);
  if (!Number.isInteger(productNo) || productNo <= 0) throw new UserError("상품 번호가 올바르지 않아요.");
  let items: any[] = [], writer: any;
  if (body.member_id) {
    const memberId = String(body.member_id).trim();
    if (!/^[A-Za-z0-9_.@-]{2,64}$/.test(memberId)) throw new UserError("회원 정보를 확인할 수 없어요.");
    items = pickItems(await ordersForMember(memberId), productNo).filter((i) => i.member_id === memberId);
    writer = { type: "member", member_id: memberId };
  } else {
    const orderId = String(body.order_id ?? "").trim();
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    if (!/^\d{8}-\d{7}$/.test(orderId)) throw new UserError("주문번호를 확인해 주세요. 예) 20261124-0001234");
    if (phone.length < 10) throw new UserError("주문하실 때 쓴 휴대폰 번호를 확인해 주세요.");
    const o = (await c24(`/admin/orders?shop_no=1&order_id=${orderId}&embed=items,buyer&limit=1`)).orders?.[0];
    const bp = String(o?.buyer?.cellphone || o?.buyer?.phone || "").replace(/\D/g, "");
    if (!o || !bp || bp !== phone) throw new UserError("주문번호와 휴대폰 번호가 맞는 주문을 찾지 못했어요.");
    const orderDate = new Date(String(o.order_date)).getTime();
    if (Date.now() - orderDate > WINDOW_DAYS * 86400e3) throw new UserError(`주문일로부터 ${WINDOW_DAYS}일이 지나 리뷰를 쓸 수 없어요.`);
    items = pickItems([o], productNo);
    writer = { type: o.member_id ? "member" : "guest", member_id: o.member_id ? String(o.member_id) : null };
  }
  const done = await alreadyReviewed(items.map((i) => i.code));
  const open = items.filter((i) => !done.has(i.code));
  if (!items.length) return { ok: false, reason: "no_order", message: "이 상품을 받으신 주문을 찾지 못했어요. 배송이 시작된 주문부터 리뷰를 쓸 수 있어요." };
  if (!open.length) return { ok: false, reason: "done", message: "이 상품의 주문에는 이미 리뷰를 써 주셨어요. 감사합니다!" };
  const token = await sign({
    v: 1, pn: productNo, w: writer, exp: Date.now() + 2 * 3600e3,
    it: open.map((i) => ({ c: i.code, o: i.order_id, op: i.option })),
  });
  return { ok: true, token, items: open.map((i) => ({ code: i.code, option: i.option, date: i.date })) };
}

async function upload(body: any) {
  const t = await verify(body.token);
  const files = Array.isArray(body.files) ? body.files : [];
  const photos = files.filter((f: any) => String(f.type).startsWith("image/")), videos = files.filter((f: any) => String(f.type).startsWith("video/"));
  if (photos.length > MAX_PHOTOS || videos.length > MAX_VIDEOS || photos.length + videos.length !== files.length) throw new UserError(`사진은 ${MAX_PHOTOS}장, 동영상은 ${MAX_VIDEOS}개까지 올릴 수 있어요.`);
  for (const f of files) {
    const max = String(f.type).startsWith("video/") ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
    if (!(Number(f.size) > 0 && Number(f.size) <= max)) throw new UserError(String(f.type).startsWith("video/") ? "동영상은 100MB까지 올릴 수 있어요." : "사진 한 장은 15MB까지 올릴 수 있어요.");
  }
  const day = ymd(new Date()).replace(/-/g, "/");
  const out = [];
  for (const f of files) {
    const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" } as Record<string, string>)[String(f.type)];
    if (!ext) throw new UserError("올릴 수 없는 파일 형식이에요. (사진: jpg·png·webp·heic / 동영상: mp4·mov·webm)");
    const path = `${day}/${t.pn}/${crypto.randomUUID()}.${ext}`;
    const r = await sb(`/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: "POST", body: "{}" });
    out.push({ path, url: `${SB_URL}/storage/v1${r.url}`, type: f.type });
  }
  // 올린 경로도 서명해서 돌려줌 → submit 때 남의 파일 경로를 끼워 넣지 못하게
  return { ok: true, files: out, media_token: await sign({ v: 1, pn: t.pn, paths: out.map((o) => o.path), exp: Date.now() + 2 * 3600e3 }) };
}

function mask(memberId: string | null, type: string) {
  return "***";
}

async function submit(body: any, req: Request) {
  const t = await verify(body.token);
  const item = (t.it ?? []).find((i: any) => i.c === String(body.code));
  if (!item) throw new UserError("리뷰를 쓸 주문을 골라 주세요.");
  const rating = Number(body.rating);
  if (![1, 2, 3, 4, 5].includes(rating)) throw new UserError("별점을 골라 주세요.");
  const content = String(body.content ?? "").replace(/\r\n/g, "\n").trim();
  if (content.length < 10) throw new UserError("리뷰 내용을 10자 이상 써 주세요.");
  if (content.length > 2000) throw new UserError("리뷰 내용은 2,000자까지 쓸 수 있어요.");
  const survey = (Array.isArray(body.survey) ? body.survey : [])
    .filter((s: any) => Array.isArray(s) && ["키", "몸무게"].includes(String(s[0])) && /^\d{2,3}$/.test(String(s[1] ?? "").trim()))
    .map((s: any) => [String(s[0]), String(s[1]).trim()]);
  let media: any[] = [];
  const paths = Array.isArray(body.media) ? body.media.map(String) : [];
  if (paths.length) {
    const mt = await verify(body.media_token);
    if (mt.pn !== t.pn || !paths.every((p: string) => mt.paths.includes(p))) throw new UserError("사진 정보가 올바르지 않아요. 다시 올려 주세요.");
    // 실제로 올라갔는지 확인
    for (const p of paths) {
      const head = await fetch(`${SB_URL}/storage/v1/object/public/${BUCKET}/${p}`, { method: "HEAD" });
      if (!head.ok) throw new UserError("사진·동영상이 다 올라가지 않았어요. 잠시 후 다시 시도해 주세요.");
    }
    media = paths.map((p: string) => ({ t: /\.(mp4|mov|webm)$/i.test(p) ? "v" : "p", path: p }));
  }
  try {
    const rows = await sb(`/rest/v1/dr_reviews`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        product_no: t.pn, order_id: item.o, order_item_code: item.c,
        member_id: t.w.member_id, writer_type: t.w.type, writer_display: mask(t.w.member_id, t.w.type),
        rating, content, option_text: item.op || null, survey, media,
        ua: (req.headers.get("user-agent") ?? "").slice(0, 200),
      }),
    });
    return { ok: true, id: rows?.[0]?.id };
  } catch (e: any) {
    if (e.status === 409) throw new UserError("이 주문에는 이미 리뷰를 써 주셨어요.");
    throw e;
  }
}

async function list(productNo: number) {
  const rows = await sb(`/rest/v1/dr_reviews?select=id,created_at,rating,content,option_text,writer_display,survey,media,admin_reply&product_no=eq.${productNo}&status=eq.published&order=created_at.desc&limit=500`);
  const pub = `${SB_URL}/storage/v1/object/public/${BUCKET}/`;
  return {
    reviews: (rows ?? []).map((r: any) => ({
      id: "n" + r.id,
      d: new Date(new Date(r.created_at).getTime() + 9 * 3600e3).toISOString().slice(0, 19),
      r: r.rating, o: (r.option_text || "").split(/,\s*(?=[^,=]+=)/).map((p: string) => p.split("=").pop()!.trim()).join("/"),
      c: r.content, u: r.writer_display, v: true, s: r.survey ?? [],
      m: (r.media ?? []).map((m: any) => ({ t: m.t, src: pub + m.path })),
      re: r.admin_reply ? [["다나로브", r.admin_reply]] : [], b: [], l: 0,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.get("action") === "list") {
      const pn = Number(url.searchParams.get("product_no"));
      if (!Number.isInteger(pn) || pn <= 0) return json(req, { reviews: [] });
      return json(req, await list(pn), 200, { "Cache-Control": "public, max-age=30" });
    }
    if (req.method !== "POST") return json(req, { error: "method" }, 405);
    const body = await req.json().catch(() => ({}));
    if (body.action === "eligible") return json(req, await eligible(body));
    if (body.action === "upload") return json(req, await upload(body));
    if (body.action === "submit") return json(req, await submit(body, req));
    return json(req, { error: "unknown action" }, 400);
  } catch (e) {
    if (e instanceof UserError) return json(req, { ok: false, message: e.message }, 400);
    console.error(e);
    return json(req, { ok: false, message: "잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, 500);
  }
});
