/* Figure 1 of the Gaza destruction study, rebuilt as an interactive player.

   The 24 panels of the static small-multiples figure become one map you scrub
   through in time. Each frame is the same false-colour composite as the figure
   (R = fixed pre-war coherence, G = B = that window's coherence), pre-rendered
   by the Python pipeline to research/gaza/figures/perpair/win_NN.webp.

   Data: window dates + Δ values + place labels come from
   research/gaza/data/perpair.js (window.PERPAIR_DATA), with a fetch fallback. */
(() => {
  "use strict";

  const host = document.getElementById("timeline-viewer");
  if (!host) return;

  const SWATCH = [
    ["rgb(219,219,219)", "Built-up, intact"],
    ["rgb(204,28,26)", "Destroyed / heavily damaged in this window"],
    ["rgb(41,204,204)", "Farmland, bare ground, settled rubble"],
    ["rgb(26,26,26)", "Outside the Strip"],
  ];

  function build(meta) {
    const frames = meta.frames;
    const n = frames.length;
    const fileTpl = meta.file; // "…/win_%02d.webp"
    const src = (i) => fileTpl.replace("%02d", String(i).padStart(2, "0"));
    const maxAbs = Math.max(...frames.map((f) => Math.abs(f.delta))) || 1;

    host.innerHTML = `
      <div class="tl-stage">
        <div class="tl-frame">
          <img alt="" decoding="async">
          <button type="button" class="tl-arrow tl-arrow-prev" data-act="prev" aria-label="Previous window">«</button>
          <button type="button" class="tl-arrow tl-arrow-next" data-act="next" aria-label="Next window">»</button>
          <div class="tl-overlay">
            <div class="tl-date"></div>
            <div class="tl-delta"></div>
            <div class="tl-scalebar" style="width:${(meta.scalebar_frac * 100).toFixed(2)}%">
              <span>${meta.scalebar_km} km</span>
            </div>
            ${meta.cities.map((c) => {
              const end = c.nx > 0.7;
              const tx = end ? "translate(-100%,-50%)" : "translate(0,-50%)";
              const pad = end ? "padding-right:9px" : "padding-left:9px";
              return `<span class="tl-city${end ? " is-end" : ""}" style="left:${(c.nx * 100).toFixed(2)}%;top:${(c.ny * 100).toFixed(2)}%;transform:${tx};${pad}">${c.name}</span>`;
            }).join("")}
          </div>
        </div>
        <div class="tl-side">
          <div class="tl-transport">
            <button type="button" class="is-play" data-act="play" aria-label="Play through the windows">▶</button>
            <span class="tl-count"></span>
          </div>
          <div class="tl-legend">
            ${SWATCH.map(([col, label]) =>
              `<span style="--sw:${col}">${label}</span>`).join("")}
          </div>
          <p><strong>Red</strong> = built-up ground that lost coherence in <em>that</em> 12-day window, not the running total; it fades back to white as the rubble re-stabilises. The bars below are the Strip-wide coherence change (<strong>Δ</strong>) for each window; move with the bars, the «&nbsp;» arrows, or the ← → keys.</p>
          <p>Sentinel-1 track 87 · unfiltered HyP3 GAMMA coherence.</p>
        </div>
      </div>
      <div class="tl-controls">
        <div class="tl-scrubber" role="group" aria-label="Timeline: bar height is the Δ for that window"></div>
        <div class="tl-axis"><span>Oct 2023</span><span>2024</span><span>2025</span><span>Jul 2026</span></div>
      </div>`;

    const img = host.querySelector(".tl-frame img");
    const dateEl = host.querySelector(".tl-date");
    const deltaEl = host.querySelector(".tl-delta");
    const countEl = host.querySelector(".tl-count");
    const scrub = host.querySelector(".tl-scrubber");
    const playBtn = host.querySelector('[data-act="play"]');

    // Lazy frame cache: load on demand, keep loaded, and fill the rest in the
    // background so the ~5.5 MB of frames is not all fetched on page open.
    const cache = new Array(n);
    const load = (i) => {
      i = (i + n) % n;
      if (!cache[i]) { const im = new Image(); im.src = src(i); cache[i] = im; }
      return cache[i];
    };
    load(0);
    let bgStarted = false;
    const fillBackground = () => {
      if (bgStarted) return;
      bgStarted = true;
      const queue = Array.from({ length: n }, (_, i) => i).filter((i) => !cache[i]);
      const step = () => {
        const i = queue.shift();
        if (i == null) return;
        const im = load(i);
        if (im.complete) step();
        else { im.onload = step; im.onerror = step; }
      };
      step();
    };
    // Fill the rest only once the reader engages with the timeline (or after a
    // long idle) — a visitor who scrolls past never pays the ~5.5 MB.
    host.addEventListener("pointerenter", fillBackground, { once: true });
    host.addEventListener("focusin", fillBackground, { once: true });
    setTimeout(fillBackground, 8000);

    scrub.innerHTML = frames.map((f, i) => {
      const hgt = 8 + (Math.abs(f.delta) / maxAbs) * 92;
      const col = f.delta < 0 ? "var(--tl-loss)" : "var(--tl-gain)";
      return `<button type="button" class="tl-bar" data-i="${i}" title="${f.date} · Δ ${f.delta > 0 ? "+" : ""}${f.delta.toFixed(3)}">
        <i style="height:${hgt.toFixed(1)}%;--tl-bar:${col}"></i></button>`;
    }).join("");
    const bars = [...scrub.querySelectorAll(".tl-bar")];

    // theme-aware bar colours
    const styleBars = () => {
      const cs = getComputedStyle(document.documentElement);
      const t = document.documentElement.dataset.theme;
      const dark = t === "dark" || (t !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
      host.style.setProperty("--tl-loss", dark ? "#e0673f" : "#b53020");
      host.style.setProperty("--tl-gain", cs.getPropertyValue("--line").trim() || "#ccd8e3");
    };
    styleBars();

    let cur = -1;
    let timer = 0;

    function setFrame(i) {
      i = (i + n) % n;
      if (i === cur) return;
      cur = i;
      const f = frames[i];
      img.src = load(i).src;
      load(i + 1); // warm the next one for smooth play / scrub
      img.alt = `Gaza Strip, coherence loss in the 12-day window ending ${f.date}`;
      dateEl.textContent = f.date;
      deltaEl.textContent = `Δ ${f.delta > 0 ? "+" : ""}${f.delta.toFixed(3)}`;
      deltaEl.style.color = f.delta < 0 ? "#ff8a6b" : "#8fd6c0";
      countEl.textContent = `window ${i + 1} / ${n}`;
      bars.forEach((b, k) => b.setAttribute("aria-current", k === i ? "true" : "false"));
    }

    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = 0;
      playBtn.textContent = "▶";
      playBtn.classList.add("is-play");
    }
    function play() {
      if (timer) { stop(); return; }
      playBtn.textContent = "❚❚";
      if (cur === n - 1) setFrame(0);
      timer = setInterval(() => {
        if (cur >= n - 1) { setFrame(0); } else { setFrame(cur + 1); }
      }, 850);
    }

    playBtn.addEventListener("click", play);
    host.querySelectorAll('[data-act="prev"]').forEach((b) =>
      b.addEventListener("click", () => { stop(); setFrame(cur - 1); }));
    host.querySelectorAll('[data-act="next"]').forEach((b) =>
      b.addEventListener("click", () => { stop(); setFrame(cur + 1); }));
    bars.forEach((b) => b.addEventListener("click", () => { stop(); setFrame(+b.dataset.i); }));

    host.setAttribute("tabindex", "0");
    host.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { stop(); setFrame(cur - 1); e.preventDefault(); }
      else if (e.key === "ArrowRight") { stop(); setFrame(cur + 1); e.preventDefault(); }
      else if (e.key === " ") { play(); e.preventDefault(); }
    });

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(styleBars);
    new MutationObserver(styleBars).observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-theme"] });

    setFrame(0);
  }

  function fail(msg) {
    host.innerHTML = '<p class="fig-fallback">Could not load the timeline (' + msg +
      '). The static figure is below.</p>';
  }

  if (window.PERPAIR_DATA) {
    build(window.PERPAIR_DATA);
  } else {
    fetch("research/gaza/data/perpair.json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(build)
      .catch((e) => fail(e.message));
  }
})();
