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
    writeUrl: "",                       // 리뷰 쓰기 화면 (다음 단계)
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
    fetch(CFG.dataBase + encodeURIComponent(self.pno) + ".json")
      .then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (doc) {
        doc = doc || { count: 0, avg: 0, dist: {}, reviews: [], media_count: 0 };
        doc.reviews.forEach(function (r) { r._s = recScore(r); });
        self.doc = doc;
        self.render();
        self.fillCounts();
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
    R.querySelector(".dr-write-btn").onclick = function () {
      if (CFG.writeUrl) location.href = CFG.writeUrl.replace("{product_no}", self.pno);
      else alert("리뷰 쓰기는 준비 중이에요.");
    };
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

  function boot() {
    document.querySelectorAll("#dnrb-review, .dnrb-review").forEach(function (root) {
      if (!root.__dr) root.__dr = new Widget(root);
    });
  }
  window.DNRB_REVIEW = { boot: boot, config: CFG };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
