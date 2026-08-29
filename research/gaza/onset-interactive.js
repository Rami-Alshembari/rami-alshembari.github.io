/* Figure 1, alternative view — the destruction as one accumulating map.

   window.ONSET_DATA.grid.rle is a run-length-encoded byte stream (base64), one
   value per 40 m pixel: the index of the 12-day window in which that ground was
   first recorded as destroyed (0–82), 250 = inside the Strip but not destroyed,
   255 = outside. Inlined so the figure works from file:// with no canvas tainting.

   The canvas re-composites live: at slider time t, every pixel with onset ≤ t is
   painted with a turbo colour for its date; the rest is a faint silhouette.

   Data: research/gaza/data/onset.js (window.ONSET_DATA), fetch fallback.
   Loaded after d3 + Plot. */
(() => {
  "use strict";

  const host = document.getElementById("onset-viewer");
  if (!host) return;
  if (!window.d3) return;
  const d3 = window.d3;

  const OUTSIDE = 255;
  const UNDAMAGED = 250;

  function isDark() {
    const t = document.documentElement.dataset.theme;
    return t === "dark" || (t !== "light" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function build(meta) {
    const G = meta.grid;
    const W = G.w, H = G.h;
    const win = meta.windows;
    const n = win.length;

    // A restrained cool-to-warm sequential ramp: steel blue (Oct 2023) through a
    // warm neutral to deep brick red (mid-2026). No rainbow, no clashing greys.
    const RAMP = ["#153a5c", "#2f6ea3", "#7ba7cb", "#dcd0b4", "#e0a566", "#c85f37", "#8b201d"];
    const ramp = d3.interpolateRgbBasis(RAMP);
    const lut = Array.from({ length: n }, (_, i) => {
      const c = d3.rgb(ramp(i / (n - 1)));
      return [c.r | 0, c.g | 0, c.b | 0];
    });

    host.innerHTML = `
      <div class="onset-legend" id="onset-legend"></div>
      <div class="onset-stage">
        <div class="onset-frame" id="onset-frame">
          <canvas width="${W}" height="${H}"></canvas>
          <div class="tl-overlay">
            <div class="tl-date"></div>
            <div class="tl-scalebar" style="width:${(meta.scalebarFrac * 100).toFixed(2)}%"><span>${meta.scalebarKm} km</span></div>
            ${meta.cities.map((c) => {
              const end = c.nx > 0.7;
              return `<span class="pop-city${end ? " is-end" : ""}" style="left:${(c.nx * 100).toFixed(2)}%;top:${(c.ny * 100).toFixed(2)}%;transform:${end ? "translate(-100%,-50%)" : "translate(0,-50%)"};${end ? "padding-right:9px" : "padding-left:9px"}">${c.name}</span>`;
            }).join("")}
          </div>
          <div class="pop-crosshair" hidden></div>
          <div class="onset-tip" hidden></div>
        </div>
        <div class="onset-controls">
          <div class="onset-transport">
            <button type="button" class="is-play" data-act="play" aria-label="Play">► Play</button>
            <button type="button" data-act="prev" aria-label="Step back">‹</button>
            <button type="button" data-act="next" aria-label="Step forward">›</button>
          </div>
          <input class="onset-slider" type="range" min="0" max="${n - 1}" value="${n - 1}" aria-label="Time">
          <div class="onset-milestones" id="onset-milestones"></div>
          <p class="onset-readout" id="onset-readout"></p>
          <p>Colour = the 12-day window each 40&nbsp;m patch first lost radar coherence: blue for October&nbsp;2023, deepening to red for mid-2026. Grey = inside the Strip, not recorded as destroyed.</p>
        </div>
      </div>`;

    // legend gradient
    const stops = d3.range(0, 1.0001, 1 / 10)
      .map((s) => ramp(s)).join(",");
    document.getElementById("onset-legend").innerHTML =
      `<div style="font-size:.72rem;font-weight:700;color:var(--muted);margin-bottom:4px">onset date</div>
       <div style="height:12px;border-radius:3px;background:linear-gradient(90deg,${stops})"></div>
       <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--muted);margin-top:3px">
         <span>${win[0].label}</span><span>${win[Math.floor(n / 2)].label}</span><span>${win[n - 1].label}</span>
       </div>`;

    const frame = document.getElementById("onset-frame");
    const canvas = frame.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const dateEl = frame.querySelector(".tl-date");
    const tip = frame.querySelector(".onset-tip");
    const cross = frame.querySelector(".pop-crosshair");
    const slider = host.querySelector(".onset-slider");
    const playBtn = host.querySelector('[data-act="play"]');
    const readout = document.getElementById("onset-readout");

    let onset = null;         // Uint8Array(W*H)
    let cum = null;           // cumulative damaged-pixel count per window
    let totalDmg = 0;
    let cur = n - 1;
    let timer = 0;
    const buf = ctx.createImageData(W, H);

    function paint(t) {
      cur = t;
      const dark = isDark();
      const sil = dark ? [96, 96, 92] : [206, 208, 210];
      const silA = dark ? 105 : 120;
      const d = buf.data;
      for (let i = 0, p = 0; i < onset.length; i++, p += 4) {
        const v = onset[i];
        if (v === OUTSIDE) { d[p + 3] = 0; continue; }
        if (v <= t) {
          const c = lut[v];
          d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
        } else {
          d[p] = sil[0]; d[p + 1] = sil[1]; d[p + 2] = sil[2]; d[p + 3] = silA;
        }
      }
      ctx.putImageData(buf, 0, 0);
      dateEl.textContent = `as of ${win[t].label}`;
      const pct = totalDmg ? Math.round((cum[t] / totalDmg) * 100) : 0;
      readout.innerHTML = `<strong>${win[t].label}</strong> · ${pct}% of the eventually-destroyed ground has been hit`;
      if (+slider.value !== t) slider.value = t;
    }

    let raf = 0;
    const render = (t) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => paint(t)); };

    function stop() {
      if (!timer) return;
      clearInterval(timer); timer = 0;
      playBtn.textContent = "► Play";
    }
    function play() {
      if (timer) { stop(); return; }
      playBtn.textContent = "❚❚ Pause";
      if (cur >= n - 1) render(0);
      timer = setInterval(() => {
        if (cur >= n - 1) render(0);
        else render(cur + 1);
      }, 260);
    }

    playBtn.addEventListener("click", play);
    host.querySelector('[data-act="prev"]').addEventListener("click", () => { stop(); render(Math.max(0, cur - 1)); });
    host.querySelector('[data-act="next"]').addEventListener("click", () => { stop(); render(Math.min(n - 1, cur + 1)); });
    slider.addEventListener("input", () => { stop(); render(+slider.value); });

    // quick-jump milestones: nearest window to each of these dates
    const nearestWindow = (iso) => {
      const t = +new Date(iso);
      let bi = 0, bd = Infinity;
      win.forEach((w, k) => { const d = Math.abs(+new Date(w.iso) - t); if (d < bd) { bd = d; bi = k; } });
      return bi;
    };
    const ms = document.getElementById("onset-milestones");
    [["Jan 2024", "2024-01-01"], ["Jul 2024", "2024-07-01"], ["Jan 2025", "2025-01-01"],
     ["Jan 2026", "2026-01-01"], ["End", win[n - 1].iso]].forEach(([label, iso]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => { stop(); render(nearestWindow(iso)); });
      ms.appendChild(b);
    });

    // hover read-out
    const E = meta.ext, R = meta.res, KM = meta.km;
    const kmAt = (col, row) => {
      const x = E[0] + (col + 0.5) * R;
      const y = E[3] - (row + 0.5) * R;
      return KM.offset + KM.scale * ((x - KM.ox) * KM.ux + (y - KM.oy) * KM.uy);
    };
    const cityAt = (nx, ny) => {
      let best = null, bd = 0.05;
      meta.cities.forEach((c) => {
        const dd = Math.hypot((c.nx - nx) * 0.81, c.ny - ny);
        if (dd < bd) { bd = dd; best = c.name; }
      });
      return best;
    };
    const move = (ev) => {
      const r = frame.getBoundingClientRect();
      const nx = (ev.clientX - r.left) / r.width;
      const ny = (ev.clientY - r.top) / r.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) { hide(); return; }
      const col = Math.min(W - 1, Math.max(0, Math.floor(nx * W)));
      const row = Math.min(H - 1, Math.max(0, Math.floor(ny * H)));
      const v = onset[row * W + col];
      if (v === OUTSIDE) { hide(); return; }
      cross.hidden = false;
      cross.style.left = `${nx * 100}%`;
      cross.style.top = `${ny * 100}%`;
      tip.hidden = false;
      tip.style.left = `${nx * 100}%`;
      tip.style.top = `${ny * 100}%`;
      const km = kmAt(col, row);
      const nearCity = cityAt(nx, ny);
      const at = `${km.toFixed(1)} km from the border${nearCity ? ` · near ${nearCity}` : ""}`;
      if (v === UNDAMAGED) {
        tip.innerHTML = `<strong>Not recorded as destroyed</strong><em>${at}</em>`;
      } else {
        tip.innerHTML = `<strong>Destroyed ${win[v].label}</strong><em>${at}</em>`;
      }
    };
    const hide = () => { tip.hidden = true; cross.hidden = true; };
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerleave", hide);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(() => paint(cur));
    new MutationObserver(() => paint(cur)).observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-theme"] });

    // ---- decode the run-length-encoded grid (inlined, no canvas / no fetch) ----
    try {
      const bytes = Uint8Array.from(atob(G.rle), (c) => c.charCodeAt(0));
      onset = new Uint8Array(W * H);
      cum = new Int32Array(n);
      let gi = 0, bi = 0;
      while (bi < bytes.length && gi < onset.length) {
        const val = bytes[bi++];
        let count = 0, shift = 0, b;
        do { b = bytes[bi++]; count |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
        onset.fill(val, gi, gi + count);
        gi += count;
      }
      for (let i = 0; i < onset.length; i++) {
        const v = onset[i];
        if (v < n) { cum[v]++; totalDmg++; }
      }
      for (let k = 1; k < n; k++) cum[k] += cum[k - 1];
      paint(n - 1);
    } catch (e) {
      host.querySelector(".onset-stage").innerHTML =
        '<p class="fig-fallback">Could not decode the onset grid (' + e.message + ').</p>';
    }
  }

  function fail(msg) {
    host.innerHTML = '<p class="fig-fallback">Could not load the onset data (' + msg + ').</p>';
  }

  if (window.ONSET_DATA) build(window.ONSET_DATA);
  else {
    fetch("research/gaza/data/onset.json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(build).catch((e) => fail(e.message));
  }
})();
