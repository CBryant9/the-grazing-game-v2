# What the game must look like

Rule: **the picture must match the model.** If the numbers say a paddock is rank and tall, it must look rank and tall. If it is short and green, it must look short and green. Colour and height come from the per-square model state (`G`, `D`, `A`, `X`, `land`), never from a label. A rebuild can change the art style, but every item on this page must still read clearly.

Values below are from v15 (`drawGrass`, `drawSward`, `drawFences`, sprites).

## The map

- **Angled 3/4 view.** Ground squashed to 70% height (`K = 0.7`). Grass, troughs, trees, the windmill and cattle stand up and are drawn back to front, so height reads at a glance. A flat top-down view was replaced because grass height couldn't be seen.
- **Zoom and pan** (1–5×), clamped to the map.
- **Pixel art:** 10 native px per square, drawn at 3× scale, no smoothing. Fonts: "Press Start 2P" for map labels and headings, "VT323" for body text.

## Grass on the map (per square)

Nine standing tufts per square, each three blades wide.

| Thing | How it's drawn |
|---|---|
| **Ground cover** | cover = clamp((G + D − 50) / 950, 0, 1). About 1,000 kg DM/ha fully covers the ground, the same figure as the ground-cover score. Tufts only stand where cover allows, so low-mass squares show soil between tufts. |
| **Bare soil** | brown `rgb(128,94,60)`, with noise speckle |
| **Litter under dry grass** | the ground blends toward straw `rgb(170,144,88)` as the dead share rises, or shaded `rgb(70,88,40)` under living grass. (Fix from v4–v9: ungrazed paddocks were wrongly looking bare. Dead grass must show as straw, not soil.) |
| **Height** | tuft height = clamp(mass/380 × (0.7 + 0.8 × maturity), 1, 16) px, where maturity = max(X, (leaf age − 25)/80, dead share × 0.7). Leafy swards are short for their weight; rank, mature ones stand tall. |
| **Green leaf colour** | young leaf `rgb(150,216,70)` → old leaf `rgb(66,138,50)` as leaf age goes 0 → 80 days. Each tuft has a darker and a lighter blade for depth. |
| **Dead / standing dry colour** | light straw `rgb(224,192,104)` → greyer weathered `rgb(180,160,108)` as dead mass reaches 4,500 kg DM/ha |
| **Green at the base of rank grass** | each blade is green from the ground up to `height × green share × (0.65–1.35) × 1.25`, and straw above that. A short grazed sward is green to the tip; a rank tussock has green only at the base. Claudia asked for this specifically. |
| **Seed heads** | a pale `#efdca4` pixel on top of tufts where X > 0.35 and mass > 1,800 |
| **Sown pasture** | a deeper green (red × 0.8, green × 1.05), with occasional white clover flowers `#f4f1e6` |
| **Crops** | bright green `rgb(128,212,64)` while vegetative; golden `rgb(214,186,84)` with seed heads `#e6c35a` once heading or done. Tufts sit in **cultivated rows** (every 3rd pixel row darkened, tufts snapped to rows). Height = mass/450, capped at 13. |
| **Fallow** | worked brown soil `rgb(112,80,52)` with a few lighter clods. No tufts. Fallow only appears on rotation blocks or after a crop finishes, never at random. |
| **Stubble** | pale straw rows `rgb(170,146,92)`, very short (2 px), full cover, no green. A finished crop must not regrow. |

## Side-view pictures (`drawSward`)

A 0–80 cm frame with a cm scale on the left, sky, soil and a litter layer whose thickness follows the dead mass.

- **Height:** min(90, mass/70 × (0.65 + 0.9 × maturity)) cm. **Green leaf reach:** min(height, max(2, G/55 × (1 − 0.45X))) cm.
- **Stem count** follows ground cover.
- **Dry stems** (`#cdb070` and `#b4975a`) are drawn behind, tall and leaning. **Green leaves** are drawn in front from the base, coloured `rgb(125,205,72)` → `rgb(58,132,48)` by leaf age.
- **Seed heads** (`#ead6a0` ellipses) appear on dry stems when X > 0.3.
- Rank grass must look taller than leafy grass of the same weight (v15 fix: rank grass was too short in the pictures).
- A caption line gives height, green leaf height, % green and kg DM/ha.
- **Split pictures:** a paddock that is part crop and part pasture shows two pictures side by side (crop | pasture), each with its area.
- **Then vs now:** a snapshot is taken when the clock starts; the paddock card shows the two pictures side by side.

## Paddock labels (neutral, describe only)

| Label | Chip colour | Rule |
|---|---|---|
| Green | `#7fe05a` | more than 50% green |
| Mixed | `#f0b43a` | otherwise |
| Dry & rank | `#e0a860` | rankness > 0.5, or over 40 cm and under 30% green |
| Short | `#ec6a48` | under 800 kg DM/ha |

Never use "three-zone", "overgrazed" or any judging label. "Bare" only when ground cover is actually lost (under 450 kg DM/ha).

## Map layers (toggles)

| Layer | Look |
|---|---|
| Water reach | blue fading out to 1.5 km; yellow 1.5–3 km; orange over 3 km; red = no water |
| Pasture quality | red (ME 6.5) → green (ME 9.8) wash at 45% |
| Recently grazed | red wash, stronger where more was eaten |
| Arable land | pale yellow wash (stronger on cropped squares). Also shown while using the Sow tool. |
| Pipe | blue `#5ab4f0` lines when connected to the bore, grey `#7e8a96` when not |
| Labels | paddock name (big paddocks in capitals), ha, "no water" in salmon or "water via gate"; planting name under crops |
| Profit | small green/red marker over each beast |

## Infrastructure

| Thing | Look |
|---|---|
| Permanent fence | brown wire `#a06a38`, two strands, dark posts every half square, ground shadow |
| Electric fence | yellow wire `#ffe14a`, two strands |
| Temporary tape | white dashed tape, one strand, orange posts, shorter |
| Boundary | heavier brown wire |
| Gate | strainer posts, a white 3-rail panel; swings open into the paddock; red flag when shut, green when open |
| Knocked-down fence | sagging, flashing red line with a "!" marker. Clicking it puts it back up. |
| Bore | a windmill about 3× a cow's height with a turning fan and red tail vane. A pulsing gold ring and a "BORE: PUT A TROUGH OR WATER HUB HERE" pointer until the first water is built. |
| Trough | grey concrete with blue water |
| Water hub | round trough straddling the fence line or corner |
| Portable trough | blue plastic trough with a white tank and a level bar (green > 50%, gold > 25%, red below) |
| Trees | 16 dark green pixel trees |
| Yards | feedlot and sale yards in a strip on the right of the map |

Drawing aids:

- Fence drag preview: a dashed line with the length and cost. For tape, white = off your roll and red = new tape you'll buy.
- Snap dots: green = joins an existing fence, white ring = open ground.
- A hovered fence segment is highlighted white when it can be clicked.

## Cattle sprites

- Five palettes: cows black, heifers dark brown, steers red-brown with white faces, bulls grey with a hump, calves brown.
- Body shape follows condition: thin (CS < 2, ribs showing), normal, or fat (CS ≥ 3.6).
- Up to about 120 sprites are drawn per mob, so big mobs don't hide the pasture.
- The selected mob gets a gold pixel over each beast. Picked animals get a blue box.

## On-map pins and status

- DOM buttons on the map for ready jobs: **Harvest**, **Mark calves**, **No water**. Clicking one does the job or opens the right dialog.
- A status panel after each time skip ("Since <date> (n days)") lists each mob's change in weight, condition and numbers, plus births, deaths, cash and anything needing attention.

## Panels and charts

Colour tokens (CSS `:root`):

| Token | Colour |
|---|---|
| soil | `#1c150f` |
| panel | `#2a2017` |
| ink | `#f2e7c9` |
| muted | `#bba887` |
| gold | `#f0b43a` |
| grass | `#8cc84b` |
| water | `#5ab4f0` |
| danger | `#ec6a48` |

- The Feed tab has 12-month bars stacked by native (`#c9a75a`), sown pasture (`#3f9a45`) and crop (`#a6e86a`) growth, with herd demand as a gold line. Months short of demand are labelled in red. A standing-feed projection is drawn as a green line.
- The market chart shows the indicator as a gold line with a fill, and today's price as a cream square.
- Setup cards have small pixel scenes: from scratch (bare ground, windmill), established (fences, trough, grass), mixed (crop rows beside pasture).

## Narrow screens

- No horizontal scroll at phone width. Info-bar items wrap, and the feed charts shrink.
- Confirmations and results appear **inline next to the button you pressed** (saleyard buy/sell confirm and result rows), not off-screen.
