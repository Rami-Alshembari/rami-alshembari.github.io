# Figure 1 — The destruction of Gaza's built environment

Sentinel-1 interferometric coherence at 40 m from two independent look
directions, October 2023 – July 2026, with a damage profile along the Strip axis
drawn beneath the map on the same horizontal coordinate.

## Running it

```bash
python plot.py            # reading version, with headline and footnote
python plot.py --paper    # publication version: PDF + 400 dpi PNG, no furniture
```

**Dependencies:** numpy, matplotlib. No geospatial libraries needed — the Strip is already rotated onto its
principal axis (true north preserved) and place names already carry pixel
coordinates in that frame.

## What is in `data/fig01.npz`

| Key | Meaning |
|---|---|
| `sub` | rotated, cropped layer map: 0 outside, 1 Strip non-built, 2 built-up undamaged, 3 destroyed on one track, 4 destroyed on both |
| `gsub` | governorate id on the same grid |
| `inside_rot` | Strip mask, for the coastline contour |
| `prof_built`, `prof_one`, `prof_both`, `prof_centre` | along-strip profile, km² per 1 km bin |
| `city_xy`, `city_names` | place names in rotated pixel coordinates |
| `gov_label_xy`, `gov_names` | governorate label anchors |
| `loc_lon`, `loc_lat` | Strip outline for the locator inset |
| `res_m`, `ang`, `bin_px` | 40 m pixel, rotation angle, profile bin width |
| `km2_both`, `km2_one`, `km2_nodmg`, `km2_builtup` | legend totals |

## Headline numbers

- 60 km² destroyed and confirmed by both tracks; 25 km² on one track only
- of 116 km² of built-up area assessed
