#!/usr/bin/env python
"""
Figure 1 — The destruction of Gaza's built environment, October 2023 – July 2026.

Standalone. Reads only data/fig01.npz and needs only numpy + matplotlib.

    python plot.py            reading figure, with headline and footnote
    python plot.py --paper    publication version: PDF + 400 dpi PNG, no furniture

All geospatial work was done upstream by scripts/export_figure_bundles.py: the
Strip is already rotated onto its principal axis with true north preserved, and
place names already carry pixel coordinates in that rotated frame. What is left
here is drawing.
"""
from __future__ import annotations

import argparse

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.patches import Patch, FancyArrow, Rectangle
from matplotlib.colors import to_rgb

# confidence is an ORDERED quantity, so it takes a single-hue sequential ramp
C_BOTH, C_ONE, C_BUILT, C_LAND = "#7f0b16", "#df765d", "#bdb7a8", "#f2efe7"
INK, INK2 = "#111111", "#5a5750"


def main(paper=False):
    D = np.load("data/fig01.npz", allow_pickle=False)
    sub, gsub, insr = D["sub"], D["gsub"], D["inside_rot"]
    H, W = sub.shape
    res_m, ang, binw = float(D["res_m"]), float(D["ang"]), int(D["bin_px"])

    rgb = np.ones(sub.shape + (3,), np.float32)
    for v, c in ((1, C_LAND), (2, C_BUILT), (3, C_ONE), (4, C_BOTH)):
        rgb[sub == v] = np.array(to_rgb(c))

    fig = plt.figure(figsize=(17.2, 10.4), dpi=210)
    fig.patch.set_facecolor("white")

    # ---- the map ---------------------------------------------------------
    axm = fig.add_axes([0.035, 0.335, 0.935, 0.505])
    axm.imshow(rgb, interpolation="nearest", zorder=1)
    axm.set_xlim(0, W); axm.set_ylim(H, 0)
    axm.set_xticks([]); axm.set_yticks([])
    for s in axm.spines.values():
        s.set_visible(False)
    axm.contour(insr.astype(float), levels=[0.5], colors="#3a3a3a",
                linewidths=1.1, zorder=6)
    axm.contour(gsub.astype(float), levels=np.arange(1.5, 5.6, 1.0),
                colors="#6b6558", linewidths=0.7, linestyles="dashed", zorder=5)

    for nm, (cc, rr) in zip(D["city_names"], D["city_xy"]):
        if not (0 <= rr < H and 0 <= cc < W):
            continue
        axm.plot(cc, rr, "o", ms=5.0, mfc="white", mec=INK, mew=1.3, zorder=9)
        t = axm.annotate(str(nm), (cc, rr), textcoords="offset points",
                         xytext=(0, 11), ha="center", fontsize=9.6,
                         fontweight="bold", color=INK, zorder=10)
        t.set_path_effects([pe.withStroke(linewidth=2.8, foreground="white")])

    for nm, (cx, cy) in zip(D["gov_names"], D["gov_label_xy"]):
        if not np.isfinite(cx):
            continue
        t = axm.text(cx, cy, str(nm).upper(), ha="center", va="bottom",
                     fontsize=8.4, color="#6b6558", fontweight="bold", zorder=8)
        t.set_path_effects([pe.withStroke(linewidth=2.8, foreground="white")])

    # scale bar: rotation is rigid, so pixel size is unchanged
    km, bar = 5.0, 5.0 * 1000 / res_m
    bx, by = W * 0.015, H * 0.93
    axm.add_patch(Rectangle((bx, by), bar, H * 0.018, fc=INK, ec="none", zorder=9))
    axm.add_patch(Rectangle((bx, by), bar / 2, H * 0.018, fc="white", ec=INK,
                            lw=0.8, zorder=9))
    axm.text(bx + bar / 2, by - 4, f"{km:.0f} km", ha="center", va="bottom",
             fontsize=8.6, fontweight="bold", color=INK, zorder=9)

    # true north, rotated with everything else
    c_, s_ = np.cos(np.deg2rad(ang)), np.sin(np.deg2rad(ang))
    dx, dy = -s_, -c_
    nx0, ny0, L = W * 0.052, H * 0.79, H * 0.17
    axm.add_patch(FancyArrow(nx0 - dx * L / 2, ny0 - dy * L / 2, dx * L, dy * L,
                             width=L * 0.035, head_width=L * 0.17,
                             head_length=L * 0.24, fc=INK, ec="white", lw=0.7,
                             length_includes_head=True, zorder=9))
    axm.text(nx0 + dx * L * 0.80, ny0 + dy * L * 0.80, "N", ha="center",
             va="center", fontsize=11, fontweight="bold", color=INK, zorder=9,
             path_effects=[pe.withStroke(linewidth=2.6, foreground="white")])

    axm.legend(handles=[
        Patch(fc=C_BOTH, ec="none",
              label=f"destroyed — confirmed by both tracks   {D['km2_both']:.0f} km²"),
        Patch(fc=C_ONE, ec="none",
              label=f"destroyed — one track only   {D['km2_one']:.0f} km²"),
        Patch(fc=C_BUILT, ec="none",
              label=f"built-up, no damage detected   {D['km2_nodmg']:.0f} km²"),
        Patch(fc=C_LAND, ec="#999", label="Gaza Strip, non-built")],
        loc="upper left", bbox_to_anchor=(0.005, -0.015), ncol=4, fontsize=9.4,
        frameon=False, handlelength=1.5, columnspacing=1.8)

    # ---- along-strip profile, on the map's horizontal coordinate ---------
    axp = fig.add_axes([0.035, 0.115, 0.935, 0.150])
    ctr, pb = D["prof_centre"], D["prof_both"]
    axp.bar(ctr, pb, binw * 0.86, color=C_BOTH, lw=0, label="both tracks")
    axp.bar(ctr, D["prof_one"], binw * 0.86, bottom=pb, color=C_ONE, lw=0,
            label="one track")
    axp.plot(ctr, D["prof_built"], color=INK, lw=1.5, label="built-up area")
    axp.set_ylabel("km² per km\nof strip length", fontsize=9)
    axp.set_xlim(0, W)
    tk = np.arange(0, W, 5000 / res_m)
    axp.set_xticks(tk)
    axp.set_xticklabels([f"{i*5:.0f}" for i in range(len(tk))], fontsize=8.4)
    axp.set_xlabel("distance along the Strip from the Egyptian border (km)",
                   fontsize=9)
    axp.legend(fontsize=8.4, frameon=False, ncol=3, loc="upper left")
    axp.grid(axis="y", alpha=0.18, lw=0.5)
    for s in ("top", "right"):
        axp.spines[s].set_visible(False)
    axp.set_title("Damage along the length of the Strip — each bar is 1 km of "
                  "ground, aligned with the map above",
                  fontsize=10, fontweight="bold", loc="left", pad=5, color=INK)

    # ---- locator inset ---------------------------------------------------
    axl = fig.add_axes([0.850, 0.848, 0.120, 0.120])
    axl.set_facecolor("#dce7ee")
    axl.add_patch(Rectangle((34.22, 30.70), 1.6, 1.9, fc="#eae6dc", ec="none"))
    axl.plot(D["loc_lon"], D["loc_lat"], ",", color=C_BOTH)
    axl.set_xlim(33.95, 35.55); axl.set_ylim(30.75, 32.35)
    axl.set_xticks([]); axl.set_yticks([])
    axl.text(35.00, 31.95, "ISRAEL", fontsize=6.4, color="#8a8478",
             fontweight="bold", ha="center")
    axl.text(34.70, 30.90, "EGYPT", fontsize=6.4, color="#8a8478",
             fontweight="bold", ha="center")
    axl.annotate("GAZA", (34.40, 31.42), xytext=(34.05, 31.05), fontsize=7.2,
                 color=C_BOTH, fontweight="bold", ha="left",
                 arrowprops=dict(arrowstyle="-", color=C_BOTH, lw=0.7,
                                 shrinkA=1, shrinkB=2))
    axl.text(34.02, 31.55, "Mediterranean", fontsize=5.4, color="#7d99ab",
             style="italic", ha="center", va="center", rotation=90)
    for s in axl.spines.values():
        s.set_color("#b8b3a6"); s.set_linewidth(0.8)

    if not paper:
        fig.text(0.035, 0.978, "The destruction of Gaza's built environment, "
                 "October 2023 – July 2026", fontsize=22, fontweight="bold",
                 va="top", color=INK)
        fig.text(0.035, 0.936,
                 f"Sentinel-1 interferometric coherence, 40 m · two independent "
                 f"look directions · {D['km2_both']:.0f} km² destroyed on both "
                 f"tracks and {D['km2_one']:.0f} km² on one, of "
                 f"{D['km2_builtup']:.0f} km² of built-up area assessed",
                 fontsize=11.5, color=INK2, va="top")
        fig.text(0.035, 0.045,
                 "Coherence measures whether the ground scattered radar the same "
                 "way twice; collapse destroys that correspondence. Damage is "
                 "resolved at 40 m, so this is destroyed AREA, not a building "
                 "count. Governorate boundaries geoBoundaries gbOpen ADM2; Strip "
                 "outline ADM1.\nContains modified Copernicus Sentinel data "
                 "processed by ESA, via ASF HyP3.",
                 fontsize=7.9, color="#7a746a", va="top", linespacing=1.75)

    out = "fig01_damage_map"
    fig.savefig(f"{out}.png", bbox_inches="tight", facecolor="white",
                dpi=400 if paper else 210)
    if paper:
        fig.savefig(f"{out}.pdf", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {out}.png" + (f" and {out}.pdf" if paper else ""))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper", action="store_true")
    main(ap.parse_args().paper)
