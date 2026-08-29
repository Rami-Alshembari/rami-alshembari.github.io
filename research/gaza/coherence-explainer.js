/* Animated explainer: how interferometric coherence changes when a building
   collapses. Two aligned cartoons (before.svg intact, after.svg collapsed, same
   scene / same satellite) cut from one to the other while a coherence-vs-time
   trace runs beside them — long stable plateau, a sudden ~one-third drop at
   collapse, then a slow climb back over the following year.

   Loops on its own. No controls, no side text — just the drawing and the
   labelled plot. Self-contained, no dependencies. */
(() => {
  "use strict";

  const root = document.getElementById("coh-explainer");
  if (!root || !document.documentElement.classList.contains("js")) return;

  const scene = root.querySelector(".coh-scene");
  const before = root.querySelector(".coh-before");
  const after = root.querySelector(".coh-after");
  const canvas = root.querySelector(".coh-plot canvas");
  if (!scene || !before || !after || !canvas) return;
  const ctx = canvas.getContext("2d");

  const flash = document.createElement("div");
  flash.className = "coh-flash";
  scene.appendChild(flash);

  const DURATION = 12000;            // one loop, ms
  const T_COLLAPSE = 0.26;
  const W_COLLAPSE = 0.05;
  const BASE = 0.90, FLOOR = 0.31, RECOVER = 0.85, THRESH = 0.58;
  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

  function coh(t) {
    if (t < T_COLLAPSE) return BASE;
    if (t < T_COLLAPSE + W_COLLAPSE) {
      return BASE + (FLOOR - BASE) * smooth((t - T_COLLAPSE) / W_COLLAPSE);
    }
    const u = (t - T_COLLAPSE - W_COLLAPSE) / (1 - T_COLLAPSE - W_COLLAPSE);
    return FLOOR + (RECOVER - FLOOR) * (1 - Math.exp(-u * 3.0));
  }

  // hard cut of the picture, masked by a dust puff
  const SWAP_AT = T_COLLAPSE + W_COLLAPSE * 0.4;
  const FLASH_W = 0.055;
  const flashMix = (t) => {
    const u = (t - SWAP_AT + FLASH_W * 0.42) / FLASH_W;
    return u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI) ** 1.3;
  };

  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isDark = () => {
    const th = document.documentElement.dataset.theme;
    return th === "dark" || (th !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  };

  let W = 0, H = 0, dpr = 1;
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || 340;
    H = Math.max(176, Math.min(280, Math.round(W * 0.46)));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function phaseColour(t, C) {
    if (t < T_COLLAPSE) return C.good;
    if (t < T_COLLAPSE + W_COLLAPSE) return C.red;
    return C.ink;
  }

  function drawCurve(t) {
    const dark = isDark();
    const C = {
      ink: cssVar("--ink") || (dark ? "#e6ecf2" : "#172333"),
      body: cssVar("--ink-body") || (dark ? "#b3c0cd" : "#3e4a59"),
      muted: cssVar("--muted") || "#7c8794",
      line: cssVar("--line") || (dark ? "#33404b" : "#ccd8e3"),
      panel: cssVar("--panel") || (dark ? "#1a222a" : "#f4f8fb"),
      red: dark ? "#e0673f" : "#a81c25",
      good: dark ? "#5fae86" : "#2f8f5f",
    };

    const mL = 8, mR = 10, mT = 40, mB = 20;
    const x = (u) => mL + u * (W - mL - mR);
    const y = (c) => mT + (1 - (c - 0.22) / 0.74) * (H - mT - mB);
    const font = (s, w) => `${w ? w + " " : ""}${s}px Asap, system-ui, sans-serif`;

    ctx.clearRect(0, 0, W, H);

    // title
    ctx.fillStyle = C.body;
    ctx.font = font(11, "700");
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("Coherence of this patch of ground, over time", mL, 3);

    // detection-threshold line
    ctx.strokeStyle = C.line;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x(0), y(THRESH)); ctx.lineTo(x(1), y(THRESH)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.muted;
    ctx.font = font(10);
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText("detection threshold", x(0) + 2, y(THRESH) - 3);

    // curve
    const path = (from, to) => {
      ctx.beginPath();
      for (let i = 0; i <= 260; i++) {
        const u = from + (to - from) * (i / 260);
        const px = x(u), py = y(coh(u));
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
    };
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    path(0, 1); ctx.stroke();

    ctx.lineWidth = 2.6;
    ctx.lineJoin = "round";
    ctx.strokeStyle = phaseColour(t, C);
    path(0, Math.max(0.001, t)); ctx.stroke();

    // pre-war level guide (dotted) so the recovery "return" reads
    ctx.strokeStyle = C.muted;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([1, 3]);
    ctx.beginPath(); ctx.moveTo(x(0), y(BASE)); ctx.lineTo(x(1), y(BASE)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // marker
    const mx = x(t), my = y(coh(t));
    ctx.fillStyle = phaseColour(t, C);
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, 7); ctx.fill();
    ctx.strokeStyle = C.panel;
    ctx.lineWidth = 1.6; ctx.stroke();

    // small value tag beside the marker
    ctx.fillStyle = C.ink;
    ctx.font = font(10, "700");
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const tagX = mx + 30 > W - mR ? mx - 8 : mx + 7;
    ctx.textAlign = mx + 30 > W - mR ? "right" : "left";
    ctx.fillText(coh(t).toFixed(2), tagX, my - (t < T_COLLAPSE ? 0 : 10));

    // phase annotation, top-left
    let note = "intact · echoes match", nc = C.good;
    if (t >= T_COLLAPSE && t < T_COLLAPSE + W_COLLAPSE + 0.02) { note = "collapse · echoes rearranged"; nc = C.red; }
    else if (t >= T_COLLAPSE) { note = "rubble re-cohering"; nc = C.body; }
    ctx.fillStyle = nc;
    ctx.font = font(11, "700");
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(note, mL, mT - 17);

    // fixed callout at the trough
    ctx.fillStyle = C.muted;
    ctx.font = font(10);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("−⅓ at collapse", x(T_COLLAPSE + W_COLLAPSE) + 8, y(FLOOR));
    // pre-war level marker
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    ctx.fillText("pre-war level", x(1), y(BASE) - 3);

    // x-axis
    ctx.fillStyle = C.muted;
    ctx.font = font(10);
    ctx.textBaseline = "top";
    ctx.textAlign = "left"; ctx.fillText("pre-war", x(0), H - mB + 5);
    ctx.textAlign = "center"; ctx.fillText("collapse", x(T_COLLAPSE + W_COLLAPSE / 2), H - mB + 5);
    ctx.textAlign = "right"; ctx.fillText("+1 year", x(1), H - mB + 5);
    ctx.textAlign = "left";
  }

  function shakeScene(t) {
    const c0 = T_COLLAPSE, c1 = T_COLLAPSE + W_COLLAPSE * 1.9;
    let s = 0;
    if (!REDUCE && t >= c0 && t <= c1) {
      const u = (t - c0) / (c1 - c0);
      s = u < 0.14 ? u / 0.14 : Math.exp(-(u - 0.14) * 3.6);
    }
    if (s < 0.03) { scene.style.transform = ""; return; }
    const amp = s * 5;
    scene.style.transform =
      `translate3d(${((Math.random() * 2 - 1) * amp).toFixed(1)}px, ${((Math.random() * 2 - 1) * amp * 0.8).toFixed(1)}px, 0) rotate(${((Math.random() * 2 - 1) * s * 0.9).toFixed(2)}deg)`;
  }

  function apply(t) {
    const collapsed = t >= SWAP_AT;
    before.style.opacity = collapsed ? "0" : "1";
    after.style.opacity = collapsed ? "1" : "0";
    flash.style.opacity = (REDUCE ? 0 : flashMix(t)).toFixed(3);
    shakeScene(t);
    drawCurve(t);
  }

  let raf = 0, running = false, start = 0;
  function frame(now) {
    if (!running) return;
    apply(((now - start) / DURATION) % 1);
    raf = requestAnimationFrame(frame);
  }
  function run() {
    if (running) return;
    running = true;
    start = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function halt() { running = false; cancelAnimationFrame(raf); }

  const rerender = () => { size(); apply(running ? (performance.now() - start) / DURATION % 1 : 0.62); };
  let rs = 0;
  window.addEventListener("resize", () => { clearTimeout(rs); rs = setTimeout(rerender, 120); });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(rerender);
  new MutationObserver(rerender).observe(document.documentElement,
    { attributes: true, attributeFilter: ["data-theme"] });

  size();

  if (REDUCE) {
    apply(0.62);                       // a static frame that already shows the drop + recovery
    return;
  }

  // run only while on screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting ? run() : halt()));
    }, { threshold: 0.25 }).observe(root);
  } else {
    run();
  }
  apply(0);
})();
