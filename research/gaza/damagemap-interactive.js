/* Figure 1 of the Gaza destruction study — the built environment mapped from
   two independent Sentinel-1 look directions (tracks 87 and 94), rebuilt as a
   browser layer over the same 40 m export the static figure uses.

   window.DAMAGEMAP_DATA.grid.rle is a run-length-encoded byte stream (base64),
   one class per 40 m cell in the Strip's rotated principal-axis frame:
     0 outside · 1 Strip, non-built · 2 built-up, no damage detected
     3 destroyed on one track only · 4 destroyed, confirmed by both tracks
   gov.rle is the governorate id on the same grid (0 outside, 1..5).

   The canvas paints the raster; d3.contours adds the Strip and governorate
   outlines as crisp vector overlays; Observable Plot draws the along-strip
   damage profile beneath, on the same horizontal coordinate. No locator inset.

   Data: research/gaza/data/damagemap.js (window.DAMAGEMAP_DATA), fetch fallback.
   Loaded after d3 + Plot. */
(() => {
  "use strict";

  const host = document.getElementById("damage-viewer");
  if (!host) return;
  if (!window.d3) return;
  const d3 = window.d3;
  const Plot = window.Plot || null;

  const OUTSIDE = 0;

  // The frame is always a light paper ground, like the population map, so the
  // land tones and the two reds read the same in either site theme.
  const RGB = {
    land:  [242, 239, 231],
    built: [190, 184, 169],
    one:   [223, 118, 93],
    both:  [127, 11, 22],
    ghost: [234, 200, 192],
  };
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  const CLASS_LABEL = {
    1: "Strip, non-built",
    2: "Built-up, no damage detected",
    3: "Destroyed, one track only",
    4: "Destroyed, confirmed by both tracks",
  };

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
    return {
      ink: v("--ink", "#172333"),
      body: v("--ink-body", "#3e4a59"),
      muted: v("--muted", "#4e5a6b"),
      line: v("--line", "#ccd8e3"),
    };
  }
  const base = (width, extra) => Object.assign({
    width, style: { background: "transparent", overflow: "visible" }, fontSize: 11,
  }, extra);

  function decodeRLE(b64, len) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const out = new Uint8Array(len);
    let gi = 0, bi = 0;
    while (bi < bytes.length && gi < len) {
      const val = bytes[bi++];
      let count = 0, shift = 0, b;
      do { b = bytes[bi++]; count |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
      out.fill(val, gi, gi + count);
      gi += count;
    }
    return out;
  }

  function build(D) {
    const W = D.grid.w, H = D.grid.h, N = W * H;
    let cls, gov;
    try {
      cls = decodeRLE(D.grid.rle, N);
      gov = decodeRLE(D.gov.rle, N);
    } catch (e) {
      host.innerHTML = '<p class="fig-fallback">Could not decode the damage grid (' + e.message + '). The static figure is below.</p>';
      return;
    }

    const T = D.totals;
    const either = Math.round((T.both + T.one) * 10) / 10;
    const pct = (x) => Math.round((x / T.builtup) * 100);

    const READ = {
      both: `<b>${T.both} km²</b> is recorded as destroyed by <b>both</b> look directions independently, ${pct(T.both)}% of the ${T.builtup} km² of built-up area assessed. This is the conservative figure the study leads with.`,
      either: `<b>${either} km²</b> is flagged by <b>at least one</b> look direction, ${pct(either)}%. The ${T.one} km² beyond the both-tracks core is ground where the two geometries disagree.`,
      one: `<b>${T.one} km²</b> is seen from <b>one direction only</b> and not confirmed by the other, ${pct(T.one)}%. Layover and shadow in dense terrain depend on the look direction, so single-track detections are the method's soft edge.`,
    };

    // a spare set of anchors, enough to orient the eye without crowding the
    // dense north-east corner
    const KEEP_CITIES = new Set(["Rafah", "Khan Younis", "Gaza City", "Beit Hanoun"]);
    const cityHTML = D.cities.filter((c) => KEEP_CITIES.has(c.name)).map((c) => {
      const end = c.nx > 0.83;
      return `<span class="dmg-city${end ? " is-end" : ""}" style="left:${(c.nx * 100).toFixed(2)}%;top:${(c.ny * 100).toFixed(2)}%"><i></i><b>${c.name}</b></span>`;
    }).join("");

    const showGovToggle = host.dataset.govToggle !== "off";
    const showHint = host.dataset.hint !== "off";

    host.innerHTML = `
      <div class="dmg-controls">
        <div class="dmg-seg" role="group" aria-label="What the map shows">
          <button type="button" data-mode="both" aria-pressed="true">Both tracks confirm</button>
          <button type="button" data-mode="either" aria-pressed="false">Either track</button>
          <button type="button" data-mode="one" aria-pressed="false">One track only</button>
        </div>
        ${showGovToggle ? '<label><input type="checkbox" id="dmg-gov" checked> Governorate boundaries</label>' : ""}
        ${showHint ? '<span class="fig-lab-note">Hover the map for the class, governorate and distance along the Strip</span>' : ""}
      </div>
      <div class="dmg-stage">
        <div class="dmg-legend" id="dmg-legend"></div>
        <div class="dmg-frame" id="dmg-frame">
          <canvas width="${W}" height="${H}"></canvas>
          <svg class="dmg-lines" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div class="dmg-scalebar" style="width:${(D.scalebarFrac * 100).toFixed(2)}%"><span>${D.scalebarKm} km</span></div>
          ${cityHTML}
          <div class="dmg-crosshair" hidden></div>
          <div class="dmg-tip" hidden></div>
        </div>
        <p class="dmg-readout" id="dmg-readout"></p>
        <div class="dmg-plot" id="dmg-plot">
          ${Plot ? "" : '<p class="fig-fallback">The profile needs the charting library.</p>'}
        </div>
      </div>`;

    const frame = host.querySelector("#dmg-frame");
    const canvas = frame.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const buf = ctx.createImageData(W, H);
    const svg = frame.querySelector(".dmg-lines");
    const tip = frame.querySelector(".dmg-tip");
    const cross = frame.querySelector(".dmg-crosshair");
    const legendEl = host.querySelector("#dmg-legend");
    const readoutEl = host.querySelector("#dmg-readout");
    const govToggle = host.querySelector("#dmg-gov");
    const plotEl = host.querySelector("#dmg-plot");

    let mode = "both";

    // ---- vector outlines: Strip edge + internal governorate seams --------
    try {
      const inside = Float64Array.from(cls, (v) => (v > 0 ? 1 : 0));
      const contour = d3.contours().size([W, H]).smooth(true);
      const geoPath = d3.geoPath();
      const outline = geoPath(contour.contour(inside, 0.5));

      let govPaths = "";
      for (let g = 1; g <= 5; g++) {
        const m = Float64Array.from(gov, (v) => (v === g ? 1 : 0));
        const dd = geoPath(contour.contour(m, 0.5));
        if (dd) govPaths += `<path d="${dd}"/>`;
      }
      svg.innerHTML =
        `<g class="dmg-gov-lines">${govPaths}</g>` +
        `<path class="dmg-outline" d="${outline}"/>`;
    } catch (e) {
      svg.remove();
    }

    // ---- canvas paint ---------------------------------------------------
    function paint() {
      const d = buf.data;
      for (let i = 0, p = 0; i < N; i++, p += 4) {
        const v = cls[i];
        if (v === OUTSIDE) { d[p + 3] = 0; continue; }
        let c;
        if (v === 1) c = RGB.land;
        else if (v === 2) c = RGB.built;
        else if (v === 3) c = mode === "both" ? RGB.ghost : RGB.one;
        else c = mode === "one" ? RGB.ghost : RGB.both;
        d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
      }
      ctx.putImageData(buf, 0, 0);
    }

    function renderLegend() {
      const rows = [
        [mode === "one" ? RGB.ghost : RGB.both, "Destroyed, confirmed by both tracks", `${T.both} km²`, mode === "one"],
        [mode === "both" ? RGB.ghost : RGB.one, "Destroyed, one track only", `${T.one} km²`, mode === "both"],
        [RGB.built, "Built-up, no damage detected", `${T.undamaged} km²`, false],
        [RGB.land, "Gaza Strip, non-built", "", false],
      ];
      legendEl.innerHTML = rows.map(([c, label, val, dim]) =>
        `<span class="${dim ? "is-dim" : ""}" style="--sw:${css(c)}">${label}${val ? ` <b>${val}</b>` : ""}</span>`
      ).join("");
    }

    // ---- along-strip profile ------------------------------------------
    function renderProfile() {
      if (!Plot) return;
      const p = palette();
      const P = D.profile;
      const rows = P.centreKm.map((km, i) => ({
        km, both: P.both[i], one: P.one[i], built: P.built[i],
      }));
      const width = Math.max(280, Math.floor(plotEl.getBoundingClientRect().width) - 2);
      const maxY = d3.max(rows, (r) => Math.max(r.built, r.both + r.one)) * 1.08;
      plotEl.replaceChildren(Plot.plot(base(width, {
        height: 176,
        marginLeft: 44, marginRight: 16, marginTop: 14, marginBottom: 34,
        x: {
          domain: [0, D.stripKm], ticks: 8,
          label: "distance along the Strip from the Egyptian border (km) →",
        },
        y: { grid: true, domain: [0, maxY], label: "km² destroyed per km", labelArrow: "none" },
        marks: [
          Plot.rectY(rows, {
            x1: (d) => d.km - 0.46, x2: (d) => d.km + 0.46, y: "both", fill: css(RGB.both),
          }),
          Plot.rectY(rows, {
            x1: (d) => d.km - 0.46, x2: (d) => d.km + 0.46,
            y1: "both", y2: (d) => d.both + d.one, fill: css(RGB.one),
          }),
          Plot.line(rows, { x: "km", y: "built", stroke: p.ink, strokeWidth: 1.5, curve: "catmull-rom" }),
          Plot.ruleY([0], { stroke: p.line }),
          Plot.tip(rows, Plot.pointerX({
            x: "km", y: (d) => d.both + d.one,
            title: (d) => `${d.km.toFixed(1)} km along the Strip\n`
              + `both tracks  ${d.both.toFixed(2)} km²/km\n`
              + `one track    ${d.one.toFixed(2)} km²/km\n`
              + `built-up     ${d.built.toFixed(2)} km²/km`,
          })),
        ],
      })));
      plotEl.insertAdjacentHTML("beforeend",
        `<div class="fig-lab-legend" style="margin-top:6px">
          <span style="color:${css(RGB.both)}">both tracks</span>
          <span style="color:${css(RGB.one)}">one track only</span>
          <span style="color:${p.ink}">built-up area</span>
        </div>`);
    }

    // ---- hover read-out ------------------------------------------------
    const cityAt = (nx, ny) => {
      let best = null, bd = 0.05;
      D.cities.forEach((c) => {
        const dd = Math.hypot((c.nx - nx) * 3.13, c.ny - ny);
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
      const idx = row * W + col;
      const v = cls[idx];
      if (v === OUTSIDE) { hide(); return; }
      cross.hidden = false;
      cross.style.left = `${nx * 100}%`;
      cross.style.top = `${ny * 100}%`;
      tip.hidden = false;
      tip.style.left = `${nx * 100}%`;
      tip.style.top = `${ny * 100}%`;
      const km = (nx * D.stripKm).toFixed(1);
      const gid = gov[idx];
      const gname = gid >= 1 && D.gov.names[gid - 1] ? D.gov.names[gid - 1] : null;
      const near = cityAt(nx, ny);
      const where = `${km} km along the Strip`
        + (gname ? ` · ${gname}` : "")
        + (near ? ` · near ${near}` : "");
      tip.innerHTML = `<strong>${CLASS_LABEL[v]}</strong><em>${where}</em>`;
    };
    const hide = () => { tip.hidden = true; cross.hidden = true; };
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerleave", hide);

    // ---- controls -----------------------------------------------------
    function setMode(m) {
      mode = m;
      host.querySelectorAll(".dmg-seg button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
      readoutEl.innerHTML = READ[m];
      paint();
      renderLegend();
    }
    host.querySelectorAll(".dmg-seg button").forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.mode)));

    function setGov(on) {
      frame.classList.toggle("dmg-hide-gov", !on);
    }
    if (govToggle) govToggle.addEventListener("change", () => setGov(govToggle.checked));

    // ---- responsive + theme -----------------------------------------
    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderProfile); };
    let lastW = 0;
    new ResizeObserver((ents) => {
      const w = Math.round(ents[0].contentRect.width);
      if (Math.abs(w - lastW) < 12) return;
      lastW = w; schedule();
    }).observe(host);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(schedule);
    new MutationObserver(schedule).observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-theme"] });

    // ---- go ---------------------------------------------------------
    setGov(govToggle ? govToggle.checked : true);
    setMode("both");
    renderProfile();
  }

  function fail(msg) {
    host.innerHTML = '<p class="fig-fallback">Could not load the damage-map data (' + msg + '). The static figure is below.</p>';
  }

  if (window.DAMAGEMAP_DATA) build(window.DAMAGEMAP_DATA);
  else {
    fetch("research/gaza/data/damagemap.json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(build).catch((e) => fail(e.message));
  }
})();
