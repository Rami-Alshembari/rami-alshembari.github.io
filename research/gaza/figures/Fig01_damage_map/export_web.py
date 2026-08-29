#!/usr/bin/env python
"""Export ../../data/damagemap.{js,json} from the Figure 1 bundle.

The static figure at research/gaza/figures/Fig01_damage_map is reproduced as a
browser layer: the rotated 40 m agreement raster (sub), the governorate id
raster (gsub), the along-strip profile, and label anchors. No locator inset.
"""
import base64, json
import numpy as np

SRC = "data/fig01.npz"
OUT = "../../data/damagemap"

D = np.load(SRC, allow_pickle=False)
sub = D["sub"].astype(np.uint8)          # 0 out,1 non-built,2 built undamaged,3 one track,4 both
gsub = D["gsub"].astype(np.uint8)        # 0 out, 1..5 governorate (gov_names order)
H, W = sub.shape
res_m = float(D["res_m"])


def rle_b64(arr):
    """value byte + LEB128 run length, matching the onset decoder."""
    flat = arr.ravel()
    out = bytearray()
    i, n = 0, flat.size
    while i < n:
        v = int(flat[i]); j = i + 1
        while j < n and int(flat[j]) == v:
            j += 1
        c = j - i
        out.append(v)
        while True:
            b = c & 0x7F
            c >>= 7
            if c:
                out.append(b | 0x80)
            else:
                out.append(b)
                break
        i = j
    return base64.b64encode(bytes(out)).decode("ascii")


centre_km = [round(float(x) * res_m / 1000.0, 4) for x in D["prof_centre"]]
prof = {
    "centreKm": centre_km,
    "built": [round(float(x), 4) for x in D["prof_built"]],
    "one":   [round(float(x), 4) for x in D["prof_one"]],
    "both":  [round(float(x), 4) for x in D["prof_both"]],
}

cities = [
    {"name": str(nm), "nx": round(float(x) / W, 4), "ny": round(float(y) / H, 4)}
    for nm, (x, y) in zip(D["city_names"], D["city_xy"])
    if 0 <= float(x) < W and 0 <= float(y) < H
]

gov_names = [str(s) for s in D["gov_names"]]
gov_labels = [
    {"name": str(nm), "nx": round(float(x) / W, 4), "ny": round(float(y) / H, 4)}
    for nm, (x, y) in zip(D["gov_names"], D["gov_label_xy"])
    if np.isfinite(x) and np.isfinite(y)
]

payload = {
    "grid": {"w": W, "h": H, "rle": rle_b64(sub)},
    "gov":  {"rle": rle_b64(gsub), "names": gov_names},
    "resM": res_m,
    "stripKm": round(W * res_m / 1000.0, 3),
    "profile": prof,
    "cities": cities,
    "govLabels": gov_labels,
    "scalebarFrac": round(5000.0 / (W * res_m), 4),
    "scalebarKm": 5,
    "totals": {
        "both": round(float(D["km2_both"]), 1),
        "one": round(float(D["km2_one"]), 1),
        "undamaged": round(float(D["km2_nodmg"]), 1),
        "builtup": round(float(D["km2_builtup"]), 1),
    },
}

j = json.dumps(payload, separators=(",", ":"))
with open(OUT + ".json", "w") as f:
    f.write(j)
with open(OUT + ".js", "w") as f:
    f.write("window.DAMAGEMAP_DATA=" + j + ";\n")

print("wrote", OUT + ".js", "and", OUT + ".json")
print("grid", W, "x", H, "  rle bytes(js) =", len(j))
print("totals", payload["totals"])
