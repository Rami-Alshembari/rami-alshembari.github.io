/* Figure 4 of the Gaza destruction study — who lived on the ground that was
   destroyed — rebuilt with Observable Plot + D3.

   The map is a pre-composited raster (WorldPop 2020 residents × coherence damage,
   research/gaza/figures/population_map.webp); the browser adds the labels, the
   scale bar and a colour legend. The three chart panels — along-strip profile,
   by governorate, and the perimeter gradient — are drawn live.

   Data: research/gaza/data/population.js (window.POP_DATA), fetch fallback.
   Loaded after d3 + Plot. */
(() => {
  "use strict";

  const host = document.getElementById("pop-viewer");
  if (!host) return;
  if (!window.Plot || !window.d3) return;
  const Plot = window.Plot;
  const d3 = window.d3;

  const slot = (n) => host.querySelector(`[data-pop="${n}"]`);

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
      tan: dark ? "#5b5546" : "#cfc7b3",
      grid: dark ? "rgba(255,255,255,0.08)" : "rgba(40,63,88,0.1)",
      ramp: ["#fdf3ea", "#f2b48c", "#dd6a4a", "#a81c25", "#4e0a12"],
    };
  }

  const base = (width, extra) => Object.assign({
    width, style: { background: "transparent", overflow: "visible" }, fontSize: 11,
  }, extra);
  const num = (x, d = 0) => (x == null || Number.isNaN(x) ? "–" : x.toFixed(d));

  let DATA = null;

  function renderLegend() {
    const p = palette();
    const M = DATA.map;
    // Match the map exactly: matplotlib LinearSegmentedColormap over p.ramp,
    // Normalize(0, vmax) — i.e. a LINEAR 5-stop RGB ramp, not sqrt / 2-stop.
    slot("legend").replaceChildren(Plot.legend({
      color: {
        type: "linear",
        domain: p.ramp.map((_, i) => (M.vmax * i) / (p.ramp.length - 1)),
        range: p.ramp,
        interpolate: "rgb",
        label: "pre-war residents per hectare of ground later destroyed",
        ticks: 5,
        tickFormat: (t) => (t >= 1000 ? `${Math.round(t / 100) / 10}k` : String(Math.round(t))),
      },
      width: 340,
      style: { background: "transparent", fontSize: "11px", color: p.body },
    }));
  }

  let gridBytes = null;

  function renderMap() {
    const M = DATA.map;
    const el = slot("map");
    el.replaceChildren();
    const img = new Image();
    img.src = M.file;
    img.alt = "Map of the Gaza Strip shaded by pre-war residents per hectare of ground later recorded as destroyed";
    img.decoding = "async";
    el.appendChild(img);
    M.cities.forEach((c) => {
      const s = document.createElement("span");
      s.className = "pop-city";
      s.style.left = `${(c.nx * 100).toFixed(2)}%`;
      s.style.top = `${(c.ny * 100).toFixed(2)}%`;
      s.textContent = c.name;
      el.appendChild(s);
    });
    const sb = document.createElement("div");
    sb.className = "pop-scalebar";
    sb.style.width = `${(M.scalebarFrac * 100).toFixed(2)}%`;
    sb.innerHTML = `<span>${M.scalebarKm} km</span>`;
    el.appendChild(sb);

    // ---- hover read-out of the value under the pointer -------------------
    const G = M.grid;
    if (G && G.b64) {
      if (!gridBytes) gridBytes = Uint8Array.from(atob(G.b64), (c) => c.charCodeAt(0));
      const hit = document.createElement("div");
      hit.className = "pop-map-hit";
      const tip = document.createElement("div");
      tip.className = "pop-tip";
      tip.hidden = true;
      const cross = document.createElement("div");
      cross.className = "pop-crosshair";
      cross.hidden = true;
      el.append(hit, cross, tip);

      const cityAt = (nx, ny) => {
        let best = null, bd = 0.045; // ~4.5% of the frame
        M.cities.forEach((c) => {
          const d = Math.hypot((c.nx - nx) * 3.15, c.ny - ny); // strip is ~3.15:1
          if (d < bd) { bd = d; best = c.name; }
        });
        return best;
      };

      const move = (ev) => {
        const r = hit.getBoundingClientRect();
        const nx = (ev.clientX - r.left) / r.width;
        const ny = (ev.clientY - r.top) / r.height;
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) { hide(); return; }
        const gx = Math.min(G.w - 1, Math.max(0, Math.floor(nx * G.w)));
        const gy = Math.min(G.h - 1, Math.max(0, Math.floor(ny * G.h)));
        const raw = gridBytes[gy * G.w + gx];
        cross.hidden = false;
        cross.style.left = `${nx * 100}%`;
        cross.style.top = `${ny * 100}%`;
        tip.hidden = false;
        tip.style.left = `${nx * 100}%`;
        tip.style.top = `${ny * 100}%`;
        const city = cityAt(nx, ny);
        const where = city ? `near ${city}` : "here";
        if (raw === 255) {
          tip.innerHTML = "<strong>Outside the Strip</strong>";
        } else {
          const val = raw * G.scale;
          tip.innerHTML = val < 4
            ? `<strong>Few or no residents</strong><em>lived ${where} before the war, on ground later destroyed</em>`
            : `<strong>≈ ${Math.round(val)} people per hectare</strong><em>lived ${where} before the war (WorldPop 2020), on ground the radar later recorded as destroyed</em>`;
        }
      };
      const hide = () => { tip.hidden = true; cross.hidden = true; };
      hit.addEventListener("pointermove", move);
      hit.addEventListener("pointerleave", hide);
    }
  }

  function renderProfile(width) {
    const p = palette();
    const P = DATA.profile;
    const rows = P.km.map((km, i) => ({ km, all: P.all[i], lost: P.lost[i] }));
    const maxKm = d3.max(P.km) + 1;
    slot("profile").replaceChildren(Plot.plot(base(width, {
      height: 190,
      marginLeft: 48, marginRight: 14, marginTop: 24, marginBottom: 34,
      x: { domain: [0, maxKm], label: "distance along the Strip from the Egyptian border (km) →", ticks: 9 },
      y: { grid: true, label: "thousands of people / km", labelArrow: "none" },
      marks: [
        Plot.rectY(rows, { x1: (d) => d.km - 0.52, x2: (d) => d.km + 0.52, y: "lost", fill: p.red, fillOpacity: 0.9 }),
        Plot.lineY(rows, { x: "km", y: "all", stroke: p.ink, strokeWidth: 1.6 }),
        Plot.ruleY([0], { stroke: p.line }),
        Plot.tip(rows, Plot.pointerX({
          x: "km", y: "all",
          title: (d) => `${num(d.km)} km from the border\n${num(d.all, 1)}k residents · ${num(d.lost, 1)}k on ground later destroyed`,
        })),
      ],
    })));
    slot("profile").insertAdjacentHTML("beforeend",
      `<div class="fig-lab-legend" style="margin-top:8px">
        <span style="color:${p.ink}">all pre-war residents</span>
        <span style="color:${p.red}">lived on ground later destroyed</span>
      </div>`);
  }

  function renderGov(width) {
    const p = palette();
    const rows = DATA.gov.slice().sort((a, b) => a.mid - b.mid);
    const xmax = d3.max(rows, (d) => d.hi) * 1.16;
    slot("gov").replaceChildren(Plot.plot(base(width, {
      height: rows.length * 42 + 48,
      marginLeft: 96, marginRight: 78, marginTop: 6, marginBottom: 34,
      x: { domain: [0, xmax], grid: true, ticks: 5, label: "thousands of pre-war residents of destroyed ground" },
      y: { domain: rows.map((d) => d.name), label: null, tickSize: 0 },
      marks: [
        Plot.barX(rows, { y: "name", x: "mid", fill: p.red, fillOpacity: 0.9, rx: 1.5 }),
        Plot.ruleY(rows, { y: "name", x1: "lo", x2: "hi", stroke: p.ink, strokeWidth: 1.3, strokeOpacity: 0.55 }),
        Plot.tickX(rows, { y: "name", x: "lo", stroke: p.ink, strokeOpacity: 0.55, strokeWidth: 1.3 }),
        Plot.tickX(rows, { y: "name", x: "hi", stroke: p.ink, strokeOpacity: 0.55, strokeWidth: 1.3 }),
        Plot.text(rows, {
          y: "name", x: "hi", dx: 8, textAnchor: "start", fontWeight: 700, fill: p.ink,
          text: (d) => `${num(d.mid)}k · ${num(d.sharePct)}%`,
        }),
        Plot.tip(rows, Plot.pointerY({
          y: "name", x: "mid",
          title: (d) => `${d.name}\n${num(d.mid)}k residents of destroyed ground (range ${num(d.lo)}–${num(d.hi)}k)\n${num(d.sharePct)}% of the governorate's pre-war population`,
        })),
      ],
    })));
  }

  function renderPeri(width) {
    const p = palette();
    const rows = DATA.peri;
    slot("peri").replaceChildren(Plot.plot(base(width, {
      height: 210,
      marginLeft: 44, marginRight: 14, marginTop: 10, marginBottom: 34,
      x: { domain: [0, 7], label: "distance from the land perimeter (km) →", ticks: 7 },
      y: { grid: true, label: "thousands of people", labelArrow: "none" },
      marks: [
        Plot.rectY(rows, { x1: (d) => d.km - 0.24, x2: (d) => d.km + 0.24, y: "all", fill: p.tan }),
        Plot.rectY(rows, { x1: (d) => d.km - 0.24, x2: (d) => d.km + 0.24, y: "lost", fill: p.red }),
        Plot.ruleY([0], { stroke: p.line }),
        Plot.tip(rows, Plot.pointerX({
          x: "km", y: "all",
          title: (d) => `${num(d.km, 1)} km from the perimeter\n${num(d.all, 1)}k residents · ${num(d.lost, 1)}k on destroyed ground`,
        })),
      ],
    })));
    slot("peri").insertAdjacentHTML("beforeend",
      `<div class="fig-lab-legend" style="margin-top:8px">
        <span style="color:${p.tan}">all pre-war residents</span>
        <span style="color:${p.red}">on destroyed ground</span>
      </div>`);
  }

  function renderAll() {
    if (!DATA) return;
    renderLegend();
    renderMap();
    renderProfile(Math.max(280, slot("profile").getBoundingClientRect().width - 2));
    renderGov(Math.max(240, slot("gov").getBoundingClientRect().width - 2));
    renderPeri(Math.max(240, slot("peri").getBoundingClientRect().width - 2));
  }

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderAll); };
  let lastW = 0;
  new ResizeObserver((ents) => {
    const w = Math.round(ents[0].contentRect.width);
    if (Math.abs(w - lastW) < 10) return;
    lastW = w;
    schedule();
  }).observe(host);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(schedule);
  new MutationObserver(schedule).observe(document.documentElement,
    { attributes: true, attributeFilter: ["data-theme"] });

  function start(json) { DATA = json; renderAll(); }
  function fail(msg) {
    host.innerHTML = '<p class="fig-fallback">Could not load the figure data (' + msg + '). The static version is below.</p>';
  }

  if (window.POP_DATA) start(window.POP_DATA);
  else {
    fetch("research/gaza/data/population.json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(start).catch((e) => fail(e.message));
  }
})();
