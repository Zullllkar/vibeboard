(function () {
  var themeBtn = document.querySelector("[data-od-id='nav-theme']");
  function syncThemeButton() {
    if (!themeBtn) return;
    var light = document.documentElement.getAttribute("data-theme") === "light";
    themeBtn.setAttribute("aria-pressed", light ? "true" : "false");
    themeBtn.setAttribute("aria-label", light ? "切换到暗色" : "切换到亮色");
  }
  syncThemeButton();
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("vibeboard-theme", next); } catch (err) {}
      syncThemeButton();
    });
  }

  var menuBtn = document.querySelector(".menu-btn");
  var navLinks = document.getElementById("nav-links");
  var navEl = document.querySelector(".nav");
  function closeMenu() {
    if (!navLinks || !menuBtn) return;
    navLinks.classList.remove("is-open");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "打开菜单");
    document.documentElement.classList.remove("lock");
  }
  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", function () {
      var open = menuBtn.getAttribute("aria-expanded") === "true";
      if (open) closeMenu();
      else {
        navLinks.classList.add("is-open");
        menuBtn.setAttribute("aria-expanded", "true");
        menuBtn.setAttribute("aria-label", "关闭菜单");
        document.documentElement.classList.add("lock");
      }
    });
  }

  var leftTrack = document.getElementById("ruler-left-track");
  var bottomTrack = document.getElementById("ruler-bottom-track");
  var leftRuler = document.querySelector(".ruler-left");
  var bottomRuler = document.querySelector(".ruler-bottom");
  var grid = document.getElementById("grid-field");
  var mainEl = document.querySelector("main");
  var footerQuery = window.matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)");

  function buildRulers() {
    if (!leftTrack || !bottomTrack) return;
    var left = "";
    var y;
    for (y = 0; y <= 7200; y += 120) left += '<b style="top:' + y + 'px">' + y + "</b>";
    leftTrack.innerHTML = left;
    var bottom = "";
    var x;
    for (x = 0; x <= window.innerWidth + 120; x += 120) bottom += '<b style="left:' + x + 'px">' + x + "</b>";
    bottomTrack.innerHTML = bottom;
  }
  function syncRulers() {
    var y = window.scrollY || 0;
    var rulerW = window.innerWidth > 800 ? 28 : 0;
    if (leftTrack) leftTrack.style.transform = "translateY(" + (-y) + "px)";
    if (grid) grid.style.backgroundPosition = rulerW + "px " + (-y) + "px";
  }
  function syncFooterReveal() {
    if (!leftRuler || !bottomRuler || !mainEl) return;
    if (!footerQuery.matches) {
      document.documentElement.style.removeProperty("--footer-open");
      leftRuler.style.clipPath = "";
      bottomRuler.style.transform = "";
      return;
    }
    var openH = Math.min(728, window.innerHeight);
    document.documentElement.style.setProperty("--footer-open", openH + "px");
    var cover = Math.max(0, Math.min(openH, window.innerHeight - mainEl.getBoundingClientRect().bottom));
    if (cover < 1) {
      leftRuler.style.clipPath = "";
      bottomRuler.style.transform = "";
      return;
    }
    leftRuler.style.clipPath = "inset(0 0 " + Math.round(cover) + "px 0)";
    bottomRuler.style.transform = "translateY(" + Math.round(-cover) + "px)";
  }
  function onScrollChrome() {
    if (navEl) navEl.setAttribute("data-scrolled", window.scrollY > 4 ? "true" : "false");
    syncRulers();
    syncFooterReveal();
    markDocs();
  }

  var phrase = "导航再安静一点，标题只用一句";
  try {
    var saved = localStorage.getItem("vibeboard-feeling");
    if (saved) phrase = saved;
  } catch (err) {}
  var copyButtons = Array.prototype.slice.call(document.querySelectorAll(".footer-contact"));
  var copyTimer = 0;
  function setCopyLabel(text, copied) {
    copyButtons.forEach(function (btn) {
      var label = btn.querySelector(".footer-contact-label");
      if (label) label.textContent = text;
      btn.classList.toggle("is-copied", copied);
    });
  }
  copyButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      function done() {
        setCopyLabel("已复制", true);
        window.clearTimeout(copyTimer);
        copyTimer = window.setTimeout(function () { setCopyLabel("复制这句感觉", false); }, 1600);
      }
      function fail() {
        setCopyLabel("没复制上", false);
        window.clearTimeout(copyTimer);
        copyTimer = window.setTimeout(function () { setCopyLabel("复制这句感觉", false); }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(phrase).then(done, fail);
      else fail();
    });
  });

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      var id = (link.getAttribute("href") || "").slice(1);
      var target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      closeMenu();
      window.scrollTo({
        top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 84),
        behavior: reduce.matches ? "auto" : "smooth"
      });
    });
  });

  var offerBtn = document.querySelector("[data-copy-offer]");
  var offerStatus = document.getElementById("offer-status");
  if (offerBtn) {
    offerBtn.addEventListener("click", function () {
      var offer = "Vibeboard 买断 · 一次 ¥168 · 0.9 这一代更新包含在内";
      function done() {
        if (offerStatus) offerStatus.textContent = "已复制买断说明。付款页还没接上，先把这句话留着。";
      }
      function fail() {
        if (offerStatus) offerStatus.textContent = "没复制上。买断是一次 ¥168，包含 0.9 这一代更新。";
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(offer).then(done, fail);
      else fail();
    });
  }

  var downloadLink = document.querySelector("[data-download]");
  var downloadStatus = document.getElementById("download-status");
  if (downloadLink && downloadStatus) {
    downloadLink.addEventListener("click", function () {
      downloadStatus.textContent = "已开始下载 0.9.4 的安装说明。";
    });
  }

  var docLinks = Array.prototype.slice.call(document.querySelectorAll(".docs-nav a"));
  var docSections = docLinks.map(function (link) {
    var id = (link.getAttribute("href") || "").slice(1);
    return { link: link, el: document.getElementById(id) };
  }).filter(function (item) { return item.el; });
  function markDocs() {
    if (!docSections.length) return;
    var y = window.scrollY + 120;
    var current = docSections[0];
    docSections.forEach(function (item) {
      if (item.el.offsetTop <= y) current = item;
    });
    docSections.forEach(function (item) {
      if (item === current) item.link.setAttribute("aria-current", "true");
      else item.link.removeAttribute("aria-current");
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeMenu();
  });

  var rises = Array.prototype.slice.call(document.querySelectorAll(".rise"));
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    rises.forEach(function (el) { observer.observe(el); });
  } else {
    rises.forEach(function (el) { el.classList.add("is-in"); });
  }

  buildRulers();
  var ticking = false;
  function requestTick() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      onScrollChrome();
      ticking = false;
    });
  }
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", function () {
    buildRulers();
    onScrollChrome();
  });
  if (footerQuery.addEventListener) footerQuery.addEventListener("change", onScrollChrome);
  onScrollChrome();
})();
