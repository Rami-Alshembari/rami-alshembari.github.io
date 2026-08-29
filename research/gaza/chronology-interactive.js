/* Figure 2 of the Gaza destruction study — the space-time chronology — rebuilt
   with Observable Plot + D3.

   A heatmap: x = kilometre along the Strip, y = 12-day radar window (time down).
   Colour = built-up area destroyed there, that window. Overlaid: the 13 recorded
   ground operations, each a bar over the sector and date it covered.

   Data: window grid + dates + operations from research/gaza/data/chronology.js
   (window.CHRONO_DATA), with a fetch fallback. Loaded after d3 + Plot. */
(() => {
  "use strict";

  const host = document.getElementById("chrono-viewer");
  if (!host) return;
  if (!window.Plot || !window.d3) {
    host.querySelector(".chrono-stage")?.replaceChildren();
    return;
  }
  const Plot = window.Plot;
  const d3 = window.d3;

  const heatSlot = host.querySelector('[data-chrono="heat"]');
  const listEl = document.getElementById("chrono-oplist");
  const opsToggle = document.getElementById("chrono-ops");

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
    const t = document.documentElement.dataset.theme;
    const dark = t === "dark" || (t !== "light" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
    return {
      dark,
      ink: v("--ink", "#172333"),
      muted: v("--muted", "#4e5a6b"),
      line: v("--line", "#ccd8e3"),
      op: dark ? "#7fb0d8" : "#0b2b45",
      opHi: dark ? "#ffd166" : "#e0a021",
      halo: dark ? "#0f1418" : "#ffffff",
      scheme: dark
        ? ["#20242a", "#5a2a22", "#9c3320", "#d15f39", "#f0a97e"]
        : ["#faf7f2", "#f0c3a8", "#dd7a55", "#b32d20", "#5e0a10"],
    };
  }

  let DATA = null;
  let activeOp = null;

  const parse = d3.utcParse("%Y-%m-%d");

  function render() {
    if (!DATA) return;
    const p = palette();
    const width = Math.max(280, Math.floor(heatSlot.getBoundingClientRect().width) - 2);
    const nWin = DATA.dates.length;
    const height = Math.min(640, Math.max(430, Math.round(width * 1.02)));

    const winDates = DATA.dates.map(parse);
    // fractional window index for an arbitrary date (for the operation overlay)
    const idxAt = (dstr) => {
      const t = +parse(dstr.slice(0, 10));
      const ts = winDates.map((d) => +d);
      if (t <= ts[0]) return 0;
      if (t >= ts[ts.length - 1]) return ts.length - 1;
      let i = d3.bisectRight(ts, t) - 1;
      return i + (t - ts[i]) / (ts[i + 1] - ts[i]);
    };

    const cells = [];
    DATA.hov.forEach((row, ti) => row.forEach((val, ki) => {
      if (val > 0) cells.push({ x: DATA.km[ki], yi: ti, v: val });
    }));

    const opSegs = [];
    const opFirst = [];
    DATA.events.forEach((e) => {
      const yi = idxAt(e.date);
      e.segs.forEach((s, j) => {
        opSegs.push({ n: e.n, yi, lo: s[0], hi: s[1] });
        if (j === 0) opFirst.push({ n: e.n, yi, lo: s[0] });
      });
    });

    // y ticks: the window nearest each 1 Jan / 1 Jul
    const tickIdx = [];
    for (let y = 2024; y <= 2026; y++) {
      [`${y}-01-01`, `${y}-07-01`].forEach((d) => {
        const k = Math.round(idxAt(d));
        if (k > 0 && k < nWin) tickIdx.push(k);
      });
    }

    const showOps = opsToggle.checked;
    // thin out city labels that would collide at this width
    const pxPerKm = (width - 56) / DATA.stripKm;
    const minGap = 62 / pxPerKm;
    const shownCities = [];
    DATA.cities.forEach((c) => {
      if (!shownCities.length || c.km - shownCities[shownCities.length - 1].km >= minGap) {
        shownCities.push(c);
      }
    });
    const cityByKm = new Map(shownCities.map((c) => [c.km, c.name]));

    const marks = [
      Plot.rect(cells, {
        x1: (d) => d.x - 0.5, x2: (d) => d.x + 0.5,
        y1: (d) => d.yi, y2: (d) => d.yi + 1,
        fill: "v", inset: -0.3,
      }),
    ];

    if (showOps) {
      marks.push(
        Plot.ruleY(opSegs, { y: "yi", x1: "lo", x2: "hi", stroke: p.halo, strokeWidth: 5 }),
        Plot.ruleY(opSegs, {
          y: "yi", x1: "lo", x2: "hi",
          stroke: (d) => (d.n === activeOp ? p.opHi : p.op),
          strokeWidth: (d) => (d.n === activeOp ? 4 : 2.2),
        }),
        Plot.text(opFirst, {
          y: "yi", x: "lo", text: (d) => String(d.n), dx: -4, textAnchor: "end",
          fill: (d) => (d.n === activeOp ? p.ink : p.op), fontWeight: 700, fontSize: 9,
          stroke: p.halo, strokeWidth: 2.5, paintOrder: "stroke",
        }),
      );
    }

    marks.push(
      Plot.axisX({
        anchor: "top", ticks: shownCities.map((c) => c.km),
        tickFormat: (k) => cityByKm.get(k) || "",
        tickSize: 3, label: null, fontSize: 10,
      }),
      // tip last, so it draws on top of the operation overlay
      Plot.tip(cells, Plot.pointer({
        x: "x", y: (d) => d.yi + 0.5, maxRadius: 30,
        title: (d) => `${Math.round(d.x)} km from the border\nwindow ending ${DATA.dateLabels[d.yi]}\n${d.v.toFixed(2)} km² of built-up ground destroyed`,
      })),
    );

    heatSlot.replaceChildren(Plot.plot({
      width, height,
      marginLeft: 64, marginRight: 12, marginTop: 30, marginBottom: 42,
      style: { background: "transparent", fontSize: "11px" },
      x: {
        domain: [0, DATA.stripKm],
        label: "distance along the Strip from the Egyptian border (km) →",
        ticks: width < 460 ? 5 : 9, tickSize: 3,
      },
      y: {
        domain: [0, nWin], reverse: true,
        ticks: tickIdx, tickFormat: (i) => {
          const d = winDates[Math.round(i)];
          return d ? d3.utcFormat("%b %Y")(d) : "";
        },
        tickSize: 3, label: null, grid: false,
      },
      color: {
        type: "linear",
        domain: [0, 0.08, 0.2, 0.42, 1].map((f) => DATA.cmax * f),
        range: p.scheme,
        clamp: true, legend: true,
        ticks: 4, tickFormat: (d) => d.toFixed(1),
        label: "km² of built-up ground destroyed · per km · per 12-day window",
      },
      marks,
    }));
  }

  function buildList() {
    listEl.replaceChildren(...DATA.events.map((e) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chrono-op";
      b.dataset.n = String(e.n);
      b.innerHTML =
        `<span class="chrono-op-n">${e.n}</span>` +
        `<span><span class="chrono-op-date">${e.dateLabel}</span> · ` +
        `<span class="chrono-op-title">${e.title}</span>` +
        `<span class="chrono-op-note">${e.note}</span></span>`;
      const set = (on) => {
        activeOp = on ? e.n : null;
        listEl.querySelectorAll(".chrono-op").forEach((el) =>
          el.classList.toggle("is-active", on && +el.dataset.n === e.n));
        render();
      };
      b.addEventListener("mouseenter", () => set(true));
      b.addEventListener("mouseleave", () => set(false));
      b.addEventListener("focus", () => set(true));
      b.addEventListener("blur", () => set(false));
      b.addEventListener("click", () => set(activeOp !== e.n));
      return b;
    }));
  }

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };

  opsToggle.addEventListener("change", render);
  let lastW = 0;
  new ResizeObserver((ents) => {
    const w = Math.round(ents[0].contentRect.width);
    if (Math.abs(w - lastW) < 10) return;
    lastW = w;
    schedule();
  }).observe(heatSlot);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(schedule);
  new MutationObserver(schedule).observe(document.documentElement,
    { attributes: true, attributeFilter: ["data-theme"] });

  function start(json) {
    DATA = json;
    buildList();
    render();
  }
  function fail(msg) {
    host.querySelector(".chrono-stage").innerHTML =
      '<p class="fig-fallback">Could not load the chronology data (' + msg + '). The static figure is below.</p>';
  }

  if (window.CHRONO_DATA) start(window.CHRONO_DATA);
  else {
    fetch("research/gaza/data/chronology.json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(start).catch((e) => fail(e.message));
  }
})();
