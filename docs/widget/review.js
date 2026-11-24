/* 다나로브 리뷰 위젯 (알파리뷰 대체)
 * 상품 상세 페이지에 <div id="dnrb-review" data-product-no="1383"></div> 를 두고 이 스크립트를 읽으면
 * 사진 리뷰 모음 + 별점 요약 + 리뷰 목록(정렬·필터·검색·페이지) + 크게 보기 창을 그린다.
 * 외부 라이브러리 없음. 클래스는 모두 dr- 로 시작해 쇼핑몰 스타일과 섞이지 않게 함.
 */
(function () {
  "use strict";
  var SCRIPT = document.currentScript;
  var BASE = (SCRIPT && SCRIPT.src.replace(/\/widget\/[^/]*$/, "/")) || "/";
  var CFG = Object.assign({
    dataBase: BASE + "data/p/",
    apiBase: "https://eeffmbusaqaadeojjlnc.supabase.co/functions/v1/review-api",
    cafe24ClientId: "UzeJXonNe0RsO5C9sx7HtM",   // 워크스페이스 카페24 앱(공개 값) — 로그인한 회원 아이디 확인용
    loginUrl: "/member/login.html",
    rewardText: "리뷰 작성시 <b>최대 2,700원</b>을 드립니다.",
    pageSize: 10,
    galleryPageSize: 10,
    notice: { title: "적립금/쿠폰 및 리뷰 안내입니다 :)", url: "" },
  }, window.DNRB_REVIEW_CONFIG || {});

  var STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"/></svg>';
  function stars(r, cls) {
    var h = '<span class="dr-stars ' + (cls || "") + '" role="img" aria-label="별점 ' + r + '점">';
    for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= Math.round(r) ? "on" : "") + '">' + STAR + "</i>";
    return h + "</span>";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nl(s) { return esc(s).replace(/\n/g, "<br>"); }
  function date(d) {
    var t = new Date(d.replace(" ", "T") + "+09:00"), now = Date.now(), days = Math.floor((now - t) / 864e5);
    if (days < 1) return "오늘 작성";
    if (days < 7) return days + "일 전 작성";
    if (days < 28) return Math.floor(days / 7) + "주 전 작성";
    return d.slice(2, 4) + "." + d.slice(5, 7) + "." + d.slice(8, 10) + " 작성";
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  // 추천순: 사진·동영상 > 글 길이 > 좋아요 > 재구매, 같은 점수면 최신
  function recScore(r) {
    return (r.m.length ? 4 : 0) + Math.min(r.c.length, 300) / 100 + r.l * 2 + (r.b.indexOf("재구매") >= 0 ? 0.5 : 0) + (r.r >= 4 ? 1 : 0);
  }
  var SORTS = {
    rec: { label: "추천순", fn: function (a, b) { return b._s - a._s || (a.d < b.d ? 1 : -1); } },
    new: { label: "최신순", fn: function (a, b) { return a.d < b.d ? 1 : -1; } },
    high: { label: "별점 높은순", fn: function (a, b) { return b.r - a.r || (a.d < b.d ? 1 : -1); } },
    low: { label: "별점 낮은순", fn: function (a, b) { return a.r - b.r || (a.d < b.d ? 1 : -1); } },
  };

  function Widget(root) {
    this.root = root;
    this.pno = root.getAttribute("data-product-no") || (new URLSearchParams(location.search)).get("product_no");
    this.state = { sort: "new", mediaOnly: false, rating: 0, q: "", page: 1, gpage: 1 };
    this.load();
  }
  Widget.prototype.load = function () {
    var self = this;
    self.root.classList.add("dr-review");
    self.root.innerHTML = '<div class="dr-loading">리뷰를 불러오는 중…</div>';
    // 예전 알파리뷰(정적 파일) + 새로 쓴 리뷰(review-api) 를 합친다. 새 리뷰를 못 불러와도 예전 것은 보이게.
    var archive = fetch(CFG.dataBase + encodeURIComponent(self.pno) + ".json")
      .then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error(r.status); return r.json(); });
    var fresh = fetch(CFG.apiBase + "?action=list&product_no=" + encodeURIComponent(self.pno) + (self._bust ? "&t=" + self._bust : ""))
      .then(function (r) { return r.ok ? r.json() : { reviews: [] }; })
      .catch(function () { return { reviews: [] }; });
    Promise.all([archive, fresh])
      .then(function (res) {
        var doc = res[0] || { reviews: [] }, added = (res[1] && res[1].reviews) || [];
        if (!doc.name) {
          var og = function (k) { var m = document.querySelector('meta[property="og:' + k + '"]'); return m ? m.content : ""; };
          doc.name = og("title").replace(/^Danarobe \| /, ""); doc.image = og("image");
        }
        doc.reviews = added.concat(doc.reviews);
        var n = doc.reviews.length, sum = 0, dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, media = 0;
        doc.reviews.forEach(function (r) { r._s = recScore(r); sum += r.r; dist[r.r]++; if (r.m.length) media++; });
        doc.count = n; doc.avg = n ? Math.round((sum / n) * 10) / 10 : 0; doc.dist = dist; doc.media_count = media;
        self.doc = doc;
        self.render();
        self.fillCounts();
        if (/[?&]dr_write=1/.test(location.search) && !self._autoOpened) { self._autoOpened = true; self.openWriter(); }
      })
      .catch(function () { self.root.innerHTML = '<div class="dr-loading">리뷰를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>'; });
  };
  // 상세페이지 탭의 "사용후기 427" 같은 숫자 채우기
  Widget.prototype.fillCounts = function () {
    var n = this.doc.count;
    document.querySelectorAll(".dr-review-count").forEach(function (e) { e.textContent = n; });
  };
  Widget.prototype.filtered = function () {
    var s = this.state, q = s.q.trim().toLowerCase();
    var list = this.doc.reviews.filter(function (r) {
      if (s.mediaOnly && !r.m.length) return false;
      if (s.rating && r.r !== s.rating) return false;
      if (q && (r.c + " " + r.o).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    return list.sort(SORTS[s.sort].fn);
  };

  Widget.prototype.render = function () {
    var d = this.doc, self = this;
    var h = "";
    h += '<div class="dr-write">' + '<p class="dr-reward">' + CFG.rewardText + "</p>" +
      (d.count ? "" : '<p class="dr-first">첫번째 리뷰를 작성해보세요.</p>') +
      '<button type="button" class="dr-btn dr-write-btn">리뷰 작성</button></div>';
    if (d.count) {
      h += '<section class="dr-summary">' +
        '<div class="dr-avg"><strong>' + d.avg.toFixed(1) + "</strong>" + stars(d.avg, "dr-stars-lg") +
        '<span class="dr-avg-n">리뷰 ' + d.count.toLocaleString() + "개</span></div>" +
        '<ul class="dr-dist">' + [5, 4, 3, 2, 1].map(function (k) {
          var n = d.dist[k] || 0, pct = d.count ? Math.round((n / d.count) * 100) : 0;
          return '<li><button type="button" data-rating="' + k + '"><span>' + k + '점</span><i><b style="width:' + pct + '%"></b></i><em>' + n.toLocaleString() + "</em></button></li>";
        }).join("") + "</ul></section>";
    }
    if (d.media_count) h += '<section class="dr-gallery" aria-label="포토 리뷰"></section>';
    if (CFG.notice && CFG.notice.title) {
      h += '<div class="dr-notice"><span class="dr-tag">공지</span><span class="dr-notice-t">' + esc(CFG.notice.title) + "</span></div>";
    }
    h += '<section class="dr-board">' +
      '<h3 class="dr-title">리뷰 <span>' + d.count.toLocaleString() + "</span></h3>" +
      '<div class="dr-toolbar">' +
      '<label class="dr-media-toggle"><input type="checkbox"> <span>포토&amp;동영상</span></label>' +
      '<div class="dr-sorts">' + Object.keys(SORTS).map(function (k) {
        return '<button type="button" data-sort="' + k + '">' + SORTS[k].label + "</button>";
      }).join("") + "</div>" +
      '<form class="dr-search" role="search"><input type="search" placeholder="직접검색" aria-label="리뷰 검색"><button type="submit" aria-label="검색"><svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13 13l5 5" stroke="currentColor" stroke-width="1.6"/></svg></button></form>' +
      "</div>" +
      '<div class="dr-filters"><select aria-label="별점 필터"><option value="0">별점 전체</option>' +
      [5, 4, 3, 2, 1].map(function (k) { return '<option value="' + k + '">' + k + "점</option>"; }).join("") + "</select></div>" +
      '<ul class="dr-list"></ul><nav class="dr-pages" aria-label="리뷰 페이지"></nav></section>';
    this.root.innerHTML = h;
    this.bind();
    this.renderGallery();
    this.renderList();
  };

  Widget.prototype.bind = function () {
    var self = this, R = this.root, s = this.state;
    R.querySelector(".dr-write-btn").onclick = function () { self.openWriter(); };
    var mt = R.querySelector(".dr-media-toggle input");
    mt.onchange = function () { s.mediaOnly = mt.checked; s.page = 1; self.renderList(true); };
    R.querySelectorAll("[data-sort]").forEach(function (b) {
      b.onclick = function () { s.sort = b.getAttribute("data-sort"); s.page = 1; self.renderList(true); };
    });
    var sel = R.querySelector(".dr-filters select");
    sel.onchange = function () { s.rating = Number(sel.value); s.page = 1; self.renderList(true); };
    R.querySelectorAll(".dr-dist [data-rating]").forEach(function (b) {
      b.onclick = function () {
        var k = Number(b.getAttribute("data-rating"));
        s.rating = s.rating === k ? 0 : k; sel.value = String(s.rating); s.page = 1; self.renderList(true);
      };
    });
    var form = R.querySelector(".dr-search");
    form.onsubmit = function (e) { e.preventDefault(); s.q = form.querySelector("input").value; s.page = 1; self.renderList(true); };
    form.querySelector("input").oninput = function () { if (!this.value && s.q) { s.q = ""; s.page = 1; self.renderList(true); } };
  };

  // ── 사진 리뷰 모음 (알파 '포토 위젯' 자리)
  Widget.prototype.renderGallery = function () {
    var box = this.root.querySelector(".dr-gallery");
    if (!box) return;
    var self = this, s = this.state, per = CFG.galleryPageSize;
    var list = this.doc.reviews.filter(function (r) { return r.m.length; }).sort(SORTS.rec.fn);
    var pages = Math.ceil(list.length / per);
    s.gpage = Math.min(Math.max(1, s.gpage), pages);
    var items = list.slice((s.gpage - 1) * per, s.gpage * per);
    var h = '<div class="dr-gal-head"><h3>포토 리뷰 <span>' + list.length.toLocaleString() + "</span></h3>" +
      (pages > 1 ? '<div class="dr-gal-nav"><button type="button" class="dr-prev" aria-label="이전" ' + (s.gpage <= 1 ? "disabled" : "") + '>‹</button><span>' + s.gpage + " / " + pages + '</span><button type="button" class="dr-next" aria-label="다음" ' + (s.gpage >= pages ? "disabled" : "") + ">›</button></div>" : "") +
      '</div><ul class="dr-gal">';
    items.forEach(function (r) {
      var m = r.m[0];
      h += '<li><button type="button" class="dr-card" data-id="' + r.id + '">' +
        '<span class="dr-thumb">' + thumb(m) + (r.m.length > 1 ? '<em class="dr-multi" aria-label="사진 여러 장"></em>' : "") + "</span>" +
        '<span class="dr-card-meta">' + stars(r.r) + (r.o ? '<span class="dr-opt">옵션: ' + esc(r.o) + "</span>" : "") + "</span>" +
        '<span class="dr-card-text">' + esc(r.c) + "</span>" +
        '<span class="dr-card-foot"><span>' + esc(r.u) + " | " + date(r.d) + "</span>" + (r.v ? '<span class="dr-tag">구매 인증</span>' : "") + "</span>" +
        "</button></li>";
    });
    box.innerHTML = h + "</ul>";
    box.querySelectorAll(".dr-card").forEach(function (c) {
      c.onclick = function () { self.openViewer(list, Number(c.getAttribute("data-id")), 0); };
    });
    var p = box.querySelector(".dr-prev"), n = box.querySelector(".dr-next");
    if (p) p.onclick = function () { s.gpage--; self.renderGallery(); };
    if (n) n.onclick = function () { s.gpage++; self.renderGallery(); };
  };
  function thumb(m) {
    if (m.t === "v") return (m.thumb ? '<img loading="lazy" alt="" src="' + esc(m.thumb) + '">' : '<video muted preload="metadata" src="' + esc(m.src) + '#t=0.1"></video>') + '<em class="dr-play" aria-label="동영상"></em>';
    return '<img loading="lazy" alt="" src="' + esc(m.src) + '">';
  }

  // ── 리뷰 목록
  Widget.prototype.renderList = function (scroll) {
    var self = this, s = this.state, R = this.root;
    R.querySelectorAll("[data-sort]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-sort") === s.sort); });
    R.querySelectorAll(".dr-dist [data-rating]").forEach(function (b) {
      b.classList.toggle("on", Number(b.getAttribute("data-rating")) === s.rating);
    });
    var list = this.filtered(), per = CFG.pageSize, pages = Math.max(1, Math.ceil(list.length / per));
    s.page = Math.min(s.page, pages);
    var items = list.slice((s.page - 1) * per, s.page * per);
    var ul = R.querySelector(".dr-list");
    if (!items.length) {
      ul.innerHTML = '<li class="dr-empty">' + (this.doc.count ? "조건에 맞는 리뷰가 없어요." : "아직 작성된 리뷰가 없어요.") + "</li>";
    } else {
      ul.innerHTML = items.map(function (r) { return self.itemHtml(r); }).join("");
    }
    ul.querySelectorAll(".dr-item").forEach(function (li) {
      var id = Number(li.getAttribute("data-id")), r = items.filter(function (x) { return x.id === id; })[0];
      var body = li.querySelector(".dr-content");
      var more = li.querySelector(".dr-more");
      if (more) more.onclick = function () {
        var open = body.classList.toggle("open");
        more.textContent = open ? "접기" : "더보기";
        more.setAttribute("aria-expanded", open);
      };
      li.querySelectorAll(".dr-media button").forEach(function (b, i) {
        b.onclick = function () { self.openViewer([r], id, i); };
      });
      var rt = li.querySelector(".dr-reply-toggle");
      if (rt) rt.onclick = function () {
        var box = li.querySelector(".dr-replies"), open = box.hidden;
        box.hidden = !open; rt.setAttribute("aria-expanded", open);
      };
    });
    // 내용이 긴 리뷰만 '더보기'
    ul.querySelectorAll(".dr-content").forEach(function (c) {
      var more = c.parentNode.querySelector(".dr-more");
      if (more && c.scrollHeight <= c.clientHeight + 2) more.hidden = true;
    });
    this.renderPages(pages, list.length);
    if (scroll) {
      var top = R.querySelector(".dr-board").getBoundingClientRect().top;
      if (top < 0) window.scrollBy(0, top - 90);
    }
  };
  Widget.prototype.itemHtml = function (r) {
    var d = this.doc;
    return '<li class="dr-item" data-id="' + r.id + '">' +
      '<div class="dr-who"><div class="dr-who-1"><span class="dr-name">' + esc(r.u) + "</span>" + (r.v ? '<span class="dr-tag">구매 인증</span>' : "") +
      r.b.map(function (b) { return '<span class="dr-tag dr-tag-badge">' + esc(b) + "</span>"; }).join("") + "</div>" +
      (r.s.length ? '<div class="dr-survey">' + r.s.map(function (x) { return esc(x[0]) + " : " + esc(x[1]); }).join(" , ") + "</div>" : "") +
      '<div class="dr-date">' + date(r.d) + "</div></div>" +
      '<div class="dr-body">' + stars(r.r) +
      '<div class="dr-prod">' + (d.image ? '<img alt="" loading="lazy" src="' + esc(d.image) + '">' : "") +
      '<div><div class="dr-prod-name">' + esc(d.name || "") + "</div>" + (r.o ? '<div class="dr-prod-opt">옵션명 : ' + esc(r.o) + "</div>" : "") + "</div></div>" +
      '<div class="dr-content">' + nl(r.c) + "</div>" +
      '<button type="button" class="dr-more" aria-expanded="false">더보기</button>' +
      (r.m.length ? '<div class="dr-media">' + r.m.map(function (m) { return '<button type="button" aria-label="크게 보기">' + thumb(m) + "</button>"; }).join("") + "</div>" : "") +
      (r.re.length ? '<div class="dr-actions"><button type="button" class="dr-reply-toggle" aria-expanded="false">댓글 ' + r.re.length + "</button></div>" +
        '<div class="dr-replies" hidden>' + r.re.map(function (x) {
          return '<div class="dr-reply"><div>' + nl(x[1]) + '</div><div class="dr-reply-by">' + esc(x[0]) + " 올림</div></div>";
        }).join("") + "</div>" : "") +
      "</div></li>";
  };
  Widget.prototype.renderPages = function (pages, total) {
    var self = this, s = this.state, nav = this.root.querySelector(".dr-pages");
    if (pages <= 1) { nav.innerHTML = ""; return; }
    var start = Math.floor((s.page - 1) / 10) * 10 + 1, end = Math.min(pages, start + 9), h = "";
    h += '<button type="button" data-p="' + Math.max(1, start - 1) + '" ' + (start === 1 ? "disabled" : "") + ' aria-label="이전 10쪽">‹</button>';
    for (var i = start; i <= end; i++) h += '<button type="button" data-p="' + i + '" class="' + (i === s.page ? "on" : "") + '"' + (i === s.page ? ' aria-current="page"' : "") + ">" + i + "</button>";
    h += '<button type="button" data-p="' + Math.min(pages, end + 1) + '" ' + (end === pages ? "disabled" : "") + ' aria-label="다음 10쪽">›</button>';
    nav.innerHTML = h;
    nav.querySelectorAll("[data-p]").forEach(function (b) {
      b.onclick = function () { s.page = Number(b.getAttribute("data-p")); self.renderList(true); };
    });
  };

  // ── 크게 보기 창 (사진·동영상 넘기기 + 리뷰 내용)
  Widget.prototype.openViewer = function (list, id, mi) {
    var self = this, idx = 0;
    list.forEach(function (r, i) { if (r.id === id) idx = i; });
    var ov = el("div", "dr-viewer");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "리뷰 크게 보기");
    document.body.appendChild(ov);
    var H = document.documentElement, prevOverflow = H.style.overflow, prevGutter = H.style.scrollbarGutter;
    // 스크롤 막을 때 스크롤바 자리를 남겨 화면이 옆으로 밀리지 않게
    H.style.scrollbarGutter = "stable"; H.style.overflow = "hidden";
    function close() {
      ov.remove(); H.style.overflow = prevOverflow; H.style.scrollbarGutter = prevGutter;
      document.removeEventListener("keydown", key);
    }
    function key(e) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    function go(step) {
      var r = list[idx];
      if (mi + step >= 0 && mi + step < r.m.length) { mi += step; }
      else if (idx + step >= 0 && idx + step < list.length) { idx += step; mi = step > 0 ? 0 : list[idx].m.length - 1; }
      else return;
      draw();
    }
    function draw() {
      var r = list[idx], m = r.m[mi] || {};
      var media = m.t === "v" ? '<video controls playsinline autoplay src="' + esc(m.src) + '"></video>' : m.src ? '<img alt="" src="' + esc(m.src) + '">' : "";
      var atStart = idx === 0 && mi === 0, atEnd = idx === list.length - 1 && mi >= r.m.length - 1;
      ov.innerHTML = '<div class="dr-v-box">' +
        '<button type="button" class="dr-v-close" aria-label="닫기">×</button>' +
        '<div class="dr-v-media">' + media +
        (atStart ? "" : '<button type="button" class="dr-v-prev" aria-label="이전">‹</button>') +
        (atEnd ? "" : '<button type="button" class="dr-v-next" aria-label="다음">›</button>') +
        (r.m.length > 1 ? '<div class="dr-v-dots">' + (mi + 1) + " / " + r.m.length + "</div>" : "") + "</div>" +
        '<div class="dr-v-info">' + stars(r.r) +
        '<div class="dr-v-who">' + esc(r.u) + " · " + date(r.d) + (r.v ? ' <span class="dr-tag">구매 인증</span>' : "") + "</div>" +
        (r.o ? '<div class="dr-prod-opt">옵션명 : ' + esc(r.o) + "</div>" : "") +
        (r.s.length ? '<div class="dr-survey">' + r.s.map(function (x) { return esc(x[0]) + " : " + esc(x[1]); }).join(" , ") + "</div>" : "") +
        '<div class="dr-v-text">' + nl(r.c) + "</div>" +
        (r.m.length > 1 ? '<div class="dr-v-thumbs">' + r.m.map(function (x, i) { return '<button type="button" data-mi="' + i + '" class="' + (i === mi ? "on" : "") + '">' + thumb(x) + "</button>"; }).join("") + "</div>" : "") +
        r.re.map(function (x) { return '<div class="dr-reply"><div>' + nl(x[1]) + '</div><div class="dr-reply-by">' + esc(x[0]) + " 올림</div></div>"; }).join("") +
        "</div></div>";
      ov.querySelector(".dr-v-close").onclick = close;
      var p = ov.querySelector(".dr-v-prev"), n = ov.querySelector(".dr-v-next");
      if (p) p.onclick = function () { go(-1); };
      if (n) n.onclick = function () { go(1); };
      ov.querySelectorAll("[data-mi]").forEach(function (b) { b.onclick = function () { mi = Number(b.getAttribute("data-mi")); draw(); }; });
      ov.querySelector(".dr-v-close").focus();
    }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    // 휴대폰 좌우 밀기
    var sx = null;
    ov.addEventListener("touchstart", function (e) { if (e.target.closest(".dr-v-media")) sx = e.touches[0].clientX; }, { passive: true });
    ov.addEventListener("touchend", function (e) {
      if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    });
    document.addEventListener("keydown", key);
    draw();
  };

  // ══ 리뷰 쓰기 ══════════════════════════════════════════
  // 1) 본인 확인 = 주문자 휴대폰 번호 (회원·비회원 모두)
  //    회원: 카페24 SDK의 회원 아이디 + 휴대폰 → 서버가 그 회원 주문 중 휴대폰이 맞는 주문 확인
  //          (SDK 아이디는 페이지에 적힌 값이라 서버가 믿을 수 없어 아이디만으로는 확인하지 않음)
  //    비회원·네이버페이: 주문번호 + 휴대폰
  // 2) 별점·내용·사진/동영상·키/몸무게 → 사진은 브라우저에서 줄여서 올림 → 저장
  var QUICK = ["사이즈가 딱 맞아요", "색감이 사진이랑 같아요", "재질이 부드러워요", "생각보다 더 예뻐요", "배송이 빨랐어요", "재구매 의사 있어요"];
  var RATING_LABEL = { 1: "별로예요", 2: "그저 그래요", 3: "괜찮아요", 4: "좋아요", 5: "최고예요" };

  function api(body) {
    return fetch(CFG.apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: "잠시 문제가 생겼어요." }; }); });
  }
  function memberId() {
    return new Promise(function (resolve) {
      var done = false, fin = function (v) { if (!done) { done = true; resolve(v); } };
      setTimeout(function () { fin(null); }, 4000);
      try {
        if (!window.CAFE24API) return fin(null);
        var a = window.CAFE24API.init({ client_id: CFG.cafe24ClientId, version: "2026-03-01" });
        a.getCustomerIDInfo(function (err, res) { fin(!err && res && res.id && res.id.member_id ? res.id.member_id : null); });
      } catch (e) { fin(null); }
    });
  }
  // 사진 줄이기: 긴 쪽 1600px, JPEG 85% (보통 200~400KB). 못 읽는 형식이면 원본 그대로(서버가 형식 확인)
  function shrink(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b && b.size < file.size ? new File([b], "photo.jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function put(url, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open("PUT", url); x.setRequestHeader("Content-Type", file.type); x.setRequestHeader("x-upsert", "false");
      x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = function () { x.status < 300 ? resolve() : reject(new Error("upload " + x.status)); };
      x.onerror = function () { reject(new Error("upload")); };
      x.send(file);
    });
  }

  Widget.prototype.openWriter = function () {
    var self = this, st = { step: "check", token: null, items: [], code: null, rating: 0, files: [], busy: false };
    var ov = el("div", "dr-viewer dr-writer");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "리뷰 쓰기");
    document.body.appendChild(ov);
    var H = document.documentElement, prevO = H.style.overflow, prevG = H.style.scrollbarGutter;
    H.style.scrollbarGutter = "stable"; H.style.overflow = "hidden";
    function close() {
      if (st.busy) return;
      st.files.forEach(function (f) { if (f.preview) URL.revokeObjectURL(f.preview); });
      ov.remove(); H.style.overflow = prevO; H.style.scrollbarGutter = prevG;
      document.removeEventListener("keydown", key);
    }
    function key(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", key);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });

    function frame(inner) {
      ov.innerHTML = '<div class="dr-w-box"><div class="dr-w-head"><h3>리뷰 쓰기</h3><button type="button" class="dr-v-close" aria-label="닫기">×</button></div>' +
        '<div class="dr-w-prod">' + (self.doc.image ? '<img alt="" src="' + esc(self.doc.image) + '">' : "") + "<span>" + esc(self.doc.name || "") + "</span></div>" +
        '<div class="dr-w-body">' + inner + "</div></div>";
      ov.querySelector(".dr-v-close").onclick = close;
    }
    function msg(t, kind) { return '<p class="dr-w-msg ' + (kind || "") + '" role="' + (kind === "err" ? "alert" : "status") + '">' + esc(t) + "</p>"; }

    function check(prefill) {
      frame('<div class="dr-loading">주문 내역을 확인하는 중…</div>');
      memberId().then(function (mid) {
        if (!mid) return guest(prefill);
        member(mid);
      });
    }
    function member(mid, err, info) {
      frame((err ? msg(err, info ? "" : "err") : "") +
        '<form class="dr-w-guest dr-w-member">' +
        '<p class="dr-w-lead">본인 확인을 위해 <b>주문하실 때 쓴 휴대폰 번호</b>를 넣어 주세요.</p>' +
        '<label>휴대폰 번호<input name="phone" inputmode="tel" autocomplete="tel" placeholder="01012345678" required></label>' +
        '<button type="submit" class="dr-btn dr-w-full">확인</button></form>' +
        '<p class="dr-w-sub">비회원·네이버페이로 주문하셨다면 <button type="button" class="dr-w-link">주문번호로 확인하기</button></p>');
      ov.querySelector(".dr-w-link").onclick = function () { guest(); };
      var f = ov.querySelector(".dr-w-member");
      f.onsubmit = function (e) {
        e.preventDefault();
        var btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "확인 중…";
        api({ action: "eligible", product_no: Number(self.pno), member_id: mid, phone: f.phone.value }).then(function (r) {
          if (r.ok) { st.token = r.token; st.items = r.items; st.code = r.items[0].code; return form(); }
          member(mid, r.message || "주문을 확인하지 못했어요.", r.reason === "done");
        });
      };
    }
    function guest(err) {
      var back = location.pathname + location.search.replace(/([?&])dr_write=1&?/, "$1").replace(/[?&]$/, "");
      back += (back.indexOf("?") >= 0 ? "&" : "?") + "dr_write=1";
      frame((err ? msg(err, "err") : "") +
        '<a class="dr-btn dr-w-full" href="' + esc(CFG.loginUrl + "?returnUrl=" + encodeURIComponent(back)) + '">회원 로그인하고 쓰기</a>' +
        '<div class="dr-w-or"><span>비회원 · 네이버페이로 주문하셨나요?</span></div>' +
        '<form class="dr-w-guest">' +
        '<label>주문번호<input name="order_id" inputmode="numeric" autocomplete="off" placeholder="예) 20261124-0001234" required></label>' +
        '<label>주문자 휴대폰 번호<input name="phone" inputmode="tel" autocomplete="tel" placeholder="01012345678" required></label>' +
        '<button type="submit" class="dr-btn dr-w-full">주문 확인</button>' +
        '<p class="dr-w-sub">주문번호는 주문 완료 문자·알림톡이나 주문조회에서 볼 수 있어요.</p></form>');
      var f = ov.querySelector(".dr-w-guest");
      f.onsubmit = function (e) {
        e.preventDefault();
        var btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "확인 중…";
        api({ action: "eligible", product_no: Number(self.pno), order_id: f.order_id.value.trim(), phone: f.phone.value })
          .then(function (r) {
            if (r.ok) { st.token = r.token; st.items = r.items; st.code = r.items[0].code; return form(); }
            guest(r.message || "주문을 확인하지 못했어요.");
          });
      };
    }

    function form() {
      var photos = st.files.filter(function (f) { return f.file.type.indexOf("video") < 0; }).length;
      var items = st.items.length > 1 ? '<fieldset class="dr-w-items"><legend>어떤 주문의 리뷰인가요?</legend>' + st.items.map(function (it) {
        return '<label><input type="radio" name="code" value="' + esc(it.code) + '"' + (it.code === st.code ? " checked" : "") + "> " +
          esc(it.option.replace(/[^,=]+=/g, "").replace(/,\s*/g, "/") || "옵션 없음") + ' <small>' + esc(it.date) + " 주문</small></label>";
      }).join("") + "</fieldset>" : (st.items[0].option ? '<p class="dr-w-opt">옵션 : ' + esc(st.items[0].option.replace(/[^,=]+=/g, "").replace(/,\s*/g, "/")) + "</p>" : "");
      frame(items +
        '<div class="dr-w-rating"><p>상품은 어떠셨나요?</p><div class="dr-w-stars" role="radiogroup" aria-label="별점">' +
        [1, 2, 3, 4, 5].map(function (k) { return '<button type="button" role="radio" aria-checked="' + (st.rating === k) + '" aria-label="' + k + '점 ' + RATING_LABEL[k] + '" data-k="' + k + '" class="' + (k <= st.rating ? "on" : "") + '">' + STAR + "</button>"; }).join("") +
        '</div><p class="dr-w-rlabel">' + (st.rating ? RATING_LABEL[st.rating] : "별을 눌러 주세요") + "</p></div>" +
        '<label class="dr-w-label" for="dr-w-text">자세한 리뷰를 남겨 주세요</label>' +
        '<div class="dr-w-chips">' + QUICK.map(function (q) { return '<button type="button">' + esc(q) + "</button>"; }).join("") + "</div>" +
        '<textarea id="dr-w-text" maxlength="2000" placeholder="착용감, 사이즈, 색감, 재질 등을 알려주시면 다른 분들께 큰 도움이 돼요. (10자 이상)">' + esc(st.text || "") + '</textarea><p class="dr-w-count"><span>' + (st.text || "").length + "</span> / 2,000</p>" +
        '<p class="dr-w-label">사진·동영상 <small>사진 5장, 동영상 1개까지</small></p>' +
        '<div class="dr-w-files">' + st.files.map(function (f, i) {
          return '<div class="dr-w-file">' + (f.file.type.indexOf("video") === 0 ? '<video muted src="' + f.preview + '"></video><em class="dr-play"></em>' : '<img alt="" src="' + f.preview + '">') +
            '<button type="button" data-rm="' + i + '" aria-label="빼기">×</button><i class="dr-w-prog" style="width:' + Math.round((f.p || 0) * 100) + '%"></i></div>';
        }).join("") +
        (st.files.length < 6 ? '<label class="dr-w-add"><input type="file" accept="image/*,video/*" multiple hidden><span>+</span></label>' : "") + "</div>" +
        '<div class="dr-w-survey"><label>키 <input inputmode="numeric" maxlength="3" name="h" value="' + esc(st.h || "") + '"> cm</label><label>몸무게 <input inputmode="numeric" maxlength="3" name="w" value="' + esc(st.w || "") + '"> kg</label><small>선택 · 비슷한 체형 분께 도움이 돼요</small></div>' +
        '<div class="dr-w-err"></div>' +
        '<button type="button" class="dr-btn dr-w-full dr-w-submit">리뷰 등록</button>' +
        '<p class="dr-w-sub">상품과 관계없는 글, 욕설·비방, 다른 사람 사진은 숨김 처리될 수 있어요. 적립금은 확인 후 지급돼요.</p>');
      var R = ov;
      R.querySelectorAll('input[name="code"]').forEach(function (r) { r.onchange = function () { st.code = r.value; }; });
      R.querySelectorAll(".dr-w-stars button").forEach(function (b) {
        b.onclick = function () { st.rating = Number(b.getAttribute("data-k")); keep(); form(); R.querySelector(".dr-w-stars [data-k='" + st.rating + "']").focus(); };
      });
      var ta = R.querySelector("textarea");
      ta.oninput = function () { st.text = ta.value; R.querySelector(".dr-w-count span").textContent = ta.value.length; };
      R.querySelectorAll(".dr-w-chips button").forEach(function (b) {
        b.onclick = function () { ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + b.textContent + "."; ta.oninput(); ta.focus(); };
      });
      function keep() { st.text = ta.value; st.h = R.querySelector('[name="h"]').value; st.w = R.querySelector('[name="w"]').value; }
      var inp = R.querySelector(".dr-w-add input");
      if (inp) inp.onchange = function () {
        keep();
        var err = "";
        Array.prototype.forEach.call(inp.files, function (file) {
          var isV = file.type.indexOf("video") === 0, nv = st.files.filter(function (f) { return f.file.type.indexOf("video") === 0; }).length, np = st.files.length - nv;
          if (isV && nv >= 1) { err = "동영상은 1개까지 올릴 수 있어요."; return; }
          if (!isV && np >= 5) { err = "사진은 5장까지 올릴 수 있어요."; return; }
          if (isV && file.size > 100 * 1024 * 1024) { err = "동영상은 100MB까지 올릴 수 있어요."; return; }
          if (!isV && file.type.indexOf("image") !== 0) { err = "사진이나 동영상만 올릴 수 있어요."; return; }
          st.files.push({ file: file, preview: URL.createObjectURL(file) });
        });
        form();
        if (err) R.querySelector(".dr-w-err").innerHTML = msg(err, "err");
      };
      R.querySelectorAll("[data-rm]").forEach(function (b) {
        b.onclick = function () { keep(); var f = st.files.splice(Number(b.getAttribute("data-rm")), 1)[0]; URL.revokeObjectURL(f.preview); form(); };
      });
      R.querySelector(".dr-w-submit").onclick = function () { keep(); submit(); };
    }

    function submit() {
      var errBox = ov.querySelector(".dr-w-err"), btn = ov.querySelector(".dr-w-submit");
      var fail = function (t) { st.busy = false; btn.disabled = false; btn.textContent = "리뷰 등록"; errBox.innerHTML = msg(t, "err"); };
      if (!st.rating) return fail("별점을 골라 주세요.");
      if ((st.text || "").trim().length < 10) return fail("리뷰 내용을 10자 이상 써 주세요.");
      st.busy = true; btn.disabled = true; btn.textContent = st.files.length ? "사진 올리는 중…" : "등록 중…"; errBox.innerHTML = "";
      Promise.all(st.files.map(function (f) { return f.file.type.indexOf("video") === 0 ? f.file : shrink(f.file); }))
        .then(function (ready) {
          if (!ready.length) return { paths: [], mt: null };
          return api({ action: "upload", token: st.token, files: ready.map(function (f) { return { type: f.type, size: f.size }; }) }).then(function (u) {
            if (!u.ok) throw new Error(u.message || "사진을 올리지 못했어요.");
            return Promise.all(u.files.map(function (dest, i) {
              return put(dest.url, ready[i], function (p) {
                st.files[i].p = p; var bar = ov.querySelectorAll(".dr-w-prog")[i]; if (bar) bar.style.width = Math.round(p * 100) + "%";
              });
            })).then(function () { return { paths: u.files.map(function (d) { return d.path; }), mt: u.media_token }; });
          });
        })
        .then(function (up) {
          btn.textContent = "등록 중…";
          var survey = [];
          if (/^\d{2,3}$/.test(st.h || "")) survey.push(["키", st.h]);
          if (/^\d{2,3}$/.test(st.w || "")) survey.push(["몸무게", st.w]);
          return api({ action: "submit", token: st.token, code: st.code, rating: st.rating, content: st.text.trim(), survey: survey, media: up.paths, media_token: up.mt });
        })
        .then(function (r) {
          if (!r.ok) throw new Error(r.message || "등록하지 못했어요.");
          st.busy = false;
          frame('<div class="dr-w-done"><div class="dr-w-check" aria-hidden="true">✓</div><h4>리뷰가 등록됐어요</h4><p>소중한 리뷰 감사합니다!<br>적립금은 확인 후 지급돼요.</p><button type="button" class="dr-btn dr-w-full">확인</button></div>');
          ov.querySelector(".dr-w-done button").onclick = function () { close(); self.state.sort = "new"; self.state.page = 1; self._bust = Date.now(); self.load(); };
        })
        .catch(function (e) { fail(e.message || "등록하지 못했어요. 잠시 후 다시 시도해 주세요."); });
    }
    check();
  };

  function boot() {
    document.querySelectorAll("#dnrb-review, .dnrb-review").forEach(function (root) {
      if (!root.__dr) root.__dr = new Widget(root);
    });
  }
  window.DNRB_REVIEW = { boot: boot, config: CFG };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
