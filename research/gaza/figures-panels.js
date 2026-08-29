/* Restructured build of the Gaza distribution panels (Observable Plot + D3).

   Same data as figures-interactive.js (window.FIG02_DATA / fig02.json), but the
   panels are no longer confined to one #fig-panels grid: each [data-plot] slot
   is found wherever it sits on the page, so the spatial panels can live with the
   damage map and the pace panel can live in the timing section.

   Panels rendered when their slot is present:
     A  + A2  destroyed share vs distance from the fence, and the exposure below
     B         the same split by built-up density tercile   (+ #legend-B)
     C  + C2  cumulative destroyed area, and the monthly rate below
     D         destroyed share by governorate
     E         destroyed share within 250 m of civilian sites

   Optional controls (if present): #toggle-tracks, #toggle-smooth.
   Loaded after d3.v7.min.js and plot.v0.6.umd.min.js (both `defer`). */
(() => {
  "use strict";

  const FIG_IDS = ["fig-spatial", "fig-breakdown", "fig-pace"];
  const figs = FIG_IDS.map((id) => document.getElementById(id)).filter(Boolean);
  if (!figs.length) return;

  const fallbackInto = (msg) => figs.forEach((f) => {
    const p = f.querySelector(".fig-panels");
    if (p) p.innerHTML = `<p class="fig-fallback">${msg}</p>`;
  });

  if (!window.Plot || !window.d3) {
    fallbackInto("The charting libraries did not load. The static figure is below.");
    return;
  }
  const Plot = window.Plot;
  const d3 = window.d3;

  const slot = (name) => document.querySelector(`[data-plot="${name}"]`);

  /* ---- theme-aware palette, re-read on every render ---------------------- */
  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
    const t = document.documentElement.dataset.theme;
    const dark = t === "dark" || (t !== "light" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
    return {
      dark,
      ink: v("--ink", "#172333"),
      body: v("--ink-body", "#3e4a59"),
      muted: v("--muted", "#4e5a6b"),
      line: v("--line", "#ccd8e3"),
      red: dark ? "#e0673f" : "#a81c25",
      bg: v("--surface", "#fff"),
      band: dark ? "rgba(224,103,63,0.22)" : "rgba(168,28,37,0.13)",
      shade: dark ? "rgba(255,255,255,0.06)" : "rgba(40,63,88,0.07)",
      bar: dark ? "rgba(180,196,210,0.28)" : "rgba(70,83,98,0.22)",
      expo: dark ? "#5b6b7a" : "#9aa7b4",
      track: dark ? "#39424c" : "#e4ded1",
      cls: dark
        ? ["#cbbef2", "#a48fe4", "#7d64d6"]
        : ["#b7a9e0", "#8f79c9", "#573fa0"],
    };
  }

  const base = (width, extra) => Object.assign({
    width,
    style: { background: "transparent", overflow: "visible" },
    fontSize: 11,
  }, extra);

  const num = (x, d = 0) => (x == null || Number.isNaN(x) ? "–" : x.toFixed(d));

  function lin(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let i = d3.bisectRight(xs, x) - 1;
    const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
    return ys[i] + t * (ys[i + 1] - ys[i]);
  }

  function monthly(dates, rates) {
    const roll = d3.rollups(
      dates.map((d, i) => ({ m: +d3.utcMonth(d), v: rates[i] })),
      (g) => d3.sum(g, (d) => d.v),
      (d) => d.m,
    );
    return roll.map(([m, v]) => ({ date: new Date(m), v }))
      .sort((a, b) => a.date - b.date);
  }

  /* ===================================================================== */
  let DATA = null;
  const controls = {
    tracks: document.getElementById("toggle-tracks"),
    smooth: document.getElementById("toggle-smooth"),
  };
  const smoothOn = () => !controls.smooth || controls.smooth.checked;
  const tracksOn = () => !!controls.tracks && controls.tracks.checked;

  function renderA(width) {
    const p = palette();
    const A = DATA.A;
    const curve = smoothOn() ? "catmull-rom" : "linear";
    const rows = A.x.map((x, i) => ({
      x,
      m: A.mean[i],
      a: A.trackA[i],
      b: A.trackB[i],
      lo: Math.min(A.trackA[i], A.trackB[i]),
      hi: Math.max(A.trackA[i], A.trackB[i]),
    }));
    const plat = d3.mean(rows.filter((d) => d.x >= 1.4 && d.x <= 4.6), (d) => d.m);
    const narrow = width < 520;

    const marks = [
      Plot.rect([{}], { x1: 0, x2: 1, y1: 0, y2: 100, fill: p.shade }),
      Plot.areaY(rows, { x: "x", y1: "lo", y2: "hi", fill: p.band, curve }),
      Plot.ruleY([DATA.strip_rate], { stroke: p.ink, strokeDasharray: "4 3", strokeOpacity: 0.75 }),
      Plot.lineY(rows, { x: "x", y: "m", stroke: p.red, strokeWidth: 2.4, curve }),
      Plot.dot(rows, { x: "x", y: "m", fill: p.red, r: 3.2 }),
      Plot.text([`Strip-wide avg ${num(DATA.strip_rate)}%`],
        { x: 7, y: DATA.strip_rate, textAnchor: "end", dy: -6, fill: p.muted, fontWeight: 600, fontSize: 10 }),
      Plot.text([`${num(rows[0].m)}% at the fence`],
        { x: 0.2, y: rows[0].m, textAnchor: "start", dx: 8, dy: 18, fill: p.ink, fontWeight: 600 }),
    ];
    if (!narrow) {
      marks.push(Plot.text([`plateau ~${num(plat)}% from 1.5 km inland`],
        { x: 3.4, y: plat, textAnchor: "middle", dy: -16, fill: p.ink, fontWeight: 600 }));
    }
    if (tracksOn()) {
      marks.push(
        Plot.lineY(rows, { x: "x", y: "a", stroke: p.red, strokeWidth: 1, strokeOpacity: 0.5, curve }),
        Plot.lineY(rows, { x: "x", y: "b", stroke: p.red, strokeWidth: 1, strokeOpacity: 0.5, strokeDasharray: "2 2", curve }),
      );
    }
    marks.push(Plot.tip(rows, Plot.pointerX({
      x: "x", y: "m",
      title: (d) => `${num(d.x, 1)} km from the fence\n${num(d.m)}% destroyed (mean)\ntracks ${num(d.lo)}–${num(d.hi)}%`,
    })));

    slot("A").replaceChildren(Plot.plot(base(width, {
      height: 244,
      marginLeft: 52, marginRight: 14, marginTop: 28, marginBottom: 6,
      x: { domain: [0, 7], axis: null },
      y: { domain: [0, 100], grid: true, ticks: 5, label: "destroyed, %", labelArrow: "none" },
      marks,
    })));

    if (!slot("A2")) return;
    const expo = A.x.map((x, i) => ({ x, v: A.area[i] }));
    const maxA = d3.max(A.area);
    slot("A2").replaceChildren(Plot.plot(base(width, {
      height: 122,
      marginLeft: 52, marginRight: 14, marginTop: 12, marginBottom: 34,
      x: { domain: [0, 7], ticks: 7, label: "distance from the land perimeter (km)  ·  toward the sea →" },
      y: { ticks: 3, grid: true, label: "built-up land, km²", labelArrow: "none", domain: [0, maxA * 1.08] },
      marks: [
        Plot.rect([{}], { x1: 0, x2: 1, y1: 0, y2: maxA * 1.08, fill: p.shade }),
        Plot.rectY(expo.filter((d) => d.x >= 1),
          { x1: (d) => d.x - 0.2, x2: (d) => d.x + 0.2, y: "v", fill: p.expo }),
        Plot.rectY(expo.filter((d) => d.x < 1),
          { x1: (d) => d.x - 0.2, x2: (d) => d.x + 0.2, y: "v", fill: p.red, fillOpacity: 0.6 }),
        Plot.ruleY([0], { stroke: p.line }),
        Plot.tip(expo, Plot.pointerX({ x: "x", y: "v", title: (d) => `${num(d.x, 1)} km from the fence\n${num(d.v, 1)} km² of built-up land` })),
      ],
    })));
  }

  function renderB(width) {
    const p = palette();
    const B = DATA.B;
    const curve = smoothOn() ? "catmull-rom" : "linear";
    const long = [];
    B.names.forEach((cls, i) => B.x.forEach((x, j) => long.push({
      cls, x,
      m: B.meanByClass[i][j],
      lo: B.aLoByClass[i][j],
      hi: B.aHiByClass[i][j],
    })));
    const last = B.x[B.x.length - 1];
    const narrow = width < 520;
    const color = { domain: B.names, range: p.cls };

    const marks = [
      Plot.rect([{}], { x1: 0, x2: 1, y1: 0, y2: 100, fill: p.shade }),
      Plot.areaY(long, { x: "x", y1: "lo", y2: "hi", fill: "cls", fillOpacity: 0.14, curve }),
      Plot.lineY(long, { x: "x", y: "m", stroke: "cls", strokeWidth: 2, curve }),
      Plot.dot(long, { x: "x", y: "m", fill: "cls", r: 2.6 }),
      Plot.tip(long, Plot.pointer({
        x: "x", y: "m",
        title: (d) => `${d.cls} built-up · ${num(d.x, 1)} km\n${num(d.m)}% destroyed (tracks ${num(d.lo)}–${num(d.hi)}%)`,
      })),
    ];
    if (!narrow) {
      marks.push(Plot.text(long.filter((d) => d.x === last),
        { x: "x", y: "m", text: "cls", fill: "cls", dx: 8, textAnchor: "start", fontWeight: 600 }));
    }

    slot("B").replaceChildren(Plot.plot(base(width, {
      height: 250,
      marginLeft: 52, marginRight: narrow ? 16 : 74, marginTop: 24, marginBottom: 36,
      x: { domain: [0, d3.max(B.x) + (narrow ? 0.2 : 0.4)], ticks: 7, label: "distance from the land perimeter (km) →" },
      y: { domain: [0, 100], grid: true, ticks: 5, label: "destroyed, %", labelArrow: "none" },
      color,
      marks,
    })));

    const legend = document.getElementById("legend-B");
    if (legend) {
      legend.replaceChildren(...B.names.map((nm, i) => {
        const s = document.createElement("span");
        s.style.color = p.cls[i];
        s.textContent = `${nm} built-up`;
        return s;
      }));
    }
  }

  function renderC(width) {
    const p = palette();
    const C = DATA.C;
    const parse = d3.utcParse("%Y-%m-%d");
    const dA = C.datesA.map(parse);
    const dB = C.datesB.map(parse);
    const tB = dB.map((d) => +d);
    const series = dA.map((d, i) => {
      const b = lin(tB, C.cumB, +d);
      return { date: d, a: C.cumA[i], b, m: (C.cumA[i] + b) / 2 };
    });
    const total = series[series.length - 1].m;
    const half = series.find((s) => s.m >= total / 2) || series[series.length - 1];
    const fmt = d3.utcFormat("%b %Y");

    slot("C").replaceChildren(Plot.plot(base(width, {
      height: 250,
      marginLeft: 50, marginRight: 18, marginTop: 28, marginBottom: 6,
      x: { type: "utc", ticks: d3.utcYear.every(1), tickFormat: "%Y", axis: null },
      y: { domain: [0, total * 1.18], grid: true, label: "km², cumulative", labelArrow: "none" },
      marks: [
        Plot.areaY(series, { x: "date", y1: (d) => Math.min(d.a, d.b), y2: (d) => Math.max(d.a, d.b), fill: p.band }),
        Plot.lineY(series, { x: "date", y: "m", stroke: p.red, strokeWidth: 2.4 }),
        Plot.ruleX([half.date], { stroke: p.ink, strokeDasharray: "2 3", strokeOpacity: 0.7 }),
        Plot.text([`half the total\nby ${fmt(half.date)}`],
          { x: half.date, y: half.m, dx: 8, dy: 26, textAnchor: "start", fill: p.ink, fontWeight: 600, lineHeight: 1.2 }),
        Plot.text([`${num(total)} km²`],
          { x: series[series.length - 1].date, y: total, dx: -4, dy: -8, textAnchor: "end", fill: p.ink, fontWeight: 600 }),
        Plot.tip(series, Plot.pointerX({
          x: "date", y: "m",
          title: (d) => `${fmt(d.date)}\n${num(d.m)} km² destroyed so far\ntracks ${num(Math.min(d.a, d.b))}–${num(Math.max(d.a, d.b))} km²`,
        })),
      ],
    })));

    if (!slot("C2")) return;
    const mA = monthly(dA, C.rateA);
    const mB = monthly(dB, C.rateB);
    slot("C2").replaceChildren(Plot.plot(base(width, {
      height: 104,
      marginLeft: 50, marginRight: 16, marginTop: 6, marginBottom: 30,
      x: { type: "utc", ticks: d3.utcYear.every(1), tickFormat: "%Y", label: null },
      y: { ticks: 3, label: "km²/mo", labelArrow: "none" },
      marks: [
        Plot.ruleY([0], { stroke: p.line }),
        Plot.lineY(mB, { x: "date", y: "v", stroke: p.red, strokeWidth: 1, strokeOpacity: 0.4 }),
        Plot.lineY(mA, { x: "date", y: "v", stroke: p.red, strokeWidth: 2 }),
        Plot.tip(mA, Plot.pointerX({ x: "date", y: "v", title: (d) => `${fmt(d.date)}\n${num(d.v, 1)} km² that month` })),
      ],
    })));
  }

  function rangeBar(rows, width, leftPad, xLabel, titleFn) {
    const p = palette();
    return Plot.plot(base(width, {
      height: rows.length * 40 + 50,
      marginLeft: leftPad, marginRight: 44, marginTop: 6, marginBottom: 34,
      x: { domain: [0, 100], grid: true, ticks: 5, label: xLabel, labelAnchor: "center" },
      y: { domain: rows.map((d) => d.label), label: null, tickSize: 0 },
      marks: [
        Plot.barX(rows, { y: "label", x: "mid", fill: p.red, fillOpacity: 0.9, rx: 1.5 }),
        Plot.ruleY(rows, { y: "label", x1: "lo", x2: "hi", stroke: p.ink, strokeWidth: 1.3, strokeOpacity: 0.55 }),
        Plot.tickX(rows, { y: "label", x: "lo", stroke: p.ink, strokeOpacity: 0.55, strokeWidth: 1.3 }),
        Plot.tickX(rows, { y: "label", x: "hi", stroke: p.ink, strokeOpacity: 0.55, strokeWidth: 1.3 }),
        Plot.text(rows, { y: "label", x: 100, dx: 6, text: (d) => `${num(d.mid)}%`, textAnchor: "start", fontWeight: 700, fill: p.ink }),
        Plot.tip(rows, Plot.pointerY({ y: "label", x: "mid", title: titleFn })),
      ],
    }));
  }

  function renderD(width) {
    const rows = DATA.D.slice().sort((a, b) => a.mid - b.mid)
      .map((d) => ({ ...d, label: d.name }));
    slot("D").replaceChildren(rangeBar(rows, width, 94,
      "built-up area destroyed (%)",
      (d) => `${d.name}\n${num(d.mid)}% destroyed  ·  ${d.area} km² built-up\ntwo-track range ${num(d.lo)}–${num(d.hi)}%`));
  }

  function renderE(width) {
    const rows = DATA.E.slice().sort((a, b) => a.mean - b.mean)
      .map((d) => ({ ...d, mid: d.mean, lo: d.q1, hi: d.q3, label: d.name }));
    slot("E").replaceChildren(rangeBar(rows, width, 122,
      "within 250 m destroyed (%)",
      (d) => `${d.name} · ${d.n.toLocaleString()} sites\nmean ${num(d.mean)}%  ·  middle 50% of sites ${num(d.q1)}–${num(d.q3)}%`));
  }

  /* ---- orchestration --------------------------------------------------- */
  function widthOf(el) {
    return Math.max(240, Math.floor(el.getBoundingClientRect().width) - 2);
  }
  function panelWidth(id, slotName) {
    const el = document.getElementById(id) || (slot(slotName) && slot(slotName).parentElement);
    return el ? widthOf(el) : 320;
  }

  function renderAll() {
    if (!DATA) return;
    if (slot("A")) renderA(panelWidth("panel-A", "A"));
    if (slot("C")) renderC(panelWidth("panel-C", "C"));
    if (slot("B")) renderB(panelWidth("panel-B", "B"));
    if (slot("D")) renderD(panelWidth("panel-D", "D"));
    if (slot("E")) renderE(panelWidth("panel-E", "E"));
  }

  let raf = 0;
  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(renderAll);
  }

  Object.values(controls).forEach((c) => c && c.addEventListener("change", schedule));

  let lastW = 0;
  const ro = new ResizeObserver((entries) => {
    const w = Math.round(entries[0].contentRect.width);
    if (Math.abs(w - lastW) < 8) return;
    lastW = w;
    schedule();
  });

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(schedule);
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function start(json) {
    DATA = json;
    renderAll();
    figs.forEach((f) => ro.observe(f));
  }

  if (window.FIG02_DATA) {
    start(window.FIG02_DATA);
  } else {
    fetch("research/gaza/data/fig02.json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(start)
      .catch((err) => fallbackInto(`Could not load the figure data (${err.message}).`));
  }
})();
