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

## The rebuild's map (milestone 1.6a)

How the PixiJS map in `packages/render` draws each thing above. The rule is unchanged: the picture must match the model. The map is drawn from the farm view (`FarmView`, built by `farmView` in the engine), which carries figures only. Everything in this section marked **(builder)** was decided while building and is for Claudia to check. The rest is hers or the PRD's.

### The farm view

- The map never sees the farm. It sees a view: for each square its land use, standing height in cm, green share, ground cover, how old the leaf looks, how weathered the dry feed looks, whether seed heads show, the neutral label, the planting on it, diet energy, recent grazing, distance to water and whether it is arable. Then fences, gates, pipe, troughs, hubs, the bore, buildings, paddocks, grazing areas, plantings and mobs.
- Every figure is read from the model's own summaries. A square's height is the paddock summary's height for that one square, so the map, the paddock sheet and the side-view picture all use one height figure. *(The MVP's map used a second height formula of its own. It gave nearly the same answer.)* **(builder)**
- Where seed heads show, which cattle look thin or fat, and how weathered dry feed looks are worked out on the server and sent as plain flags and steps. The browser holds no thresholds for them.
- The view holds no seed, no prices, no soil fertility, no grain yield in prospect and nothing about days to come. A test lists every field it may hold.
- A mob's cattle are counted by kind (with how many are thin and how many fat), not listed. The whole view for a farm with 4,141 head is 42 KB as JSON. The budget in the test is 64 KB.
- Trees: the model has none, so the view's list of trees is empty and no trees are drawn. The tree sprite exists. *(The MVP's 16 trees were decoration.)*

### Clear map zoomed out, detail zoomed in

- **Switch point:** 26 screen pixels a square (PRD 7). At or below it each mob is one marker. Above it cattle and grass tufts are drawn.
- **The hand-over is a fade in time** (about a fifth of a second), not a blend by zoom, so the map never sits half way between the two pictures. Each picture holds for one pixel a square past the switch point, so a pinch that hovers there does not flicker. With "reduce motion" the change is made at once. **(builder)**
- **Zoom range:** from the whole farm in view to 96 pixels a square. *(v15 was 1 to 5 times.)* **(builder)**
- **On a phone held upright** the farm fills the height and runs past the sides (PRD 6.1). On its side, and on a PC, the whole farm fits.
- **Zoomed out:** each square is one clean colour worked out from its figures: soil, straw litter or shaded ground underneath, mixed with the colour of the tops by ground cover. Rank grass reads as straw, leafy grass as green, short grass shows soil. Each square is raised by its height (90 cm is half a square) and the front of a raised square shows where it stands taller than the square in front of it. Cropping country shows its rows.
- **Zoomed in:** the ground is one soft picture, 9 pixels to a square. Squares blend into their neighbours inside a paddock but never across a fence line or a change of country, so a short paddock beside a rank one keeps a sharp fence-line contrast. Nine tufts stand on each square. **(builder)**
- **Taps** open the paddock, never a cow. Zoomed out, the tap is tested against the raised squares as drawn (LESSONS 28).

### Grass, square by square

| Thing | How the rebuild draws it |
|---|---|
| Ground cover | Each square has nine fixed tuft spots. A spot stands if its own fixed number is under cover × 1.05. Low cover shows soil between tufts. The cover figure is the model's (1,000 kg DM/ha covers the ground) |
| Bare soil, litter, shaded ground | The colours above, unchanged. Dry grass sits on straw litter, never soil |
| Height | Tuft height follows the view's height in cm: 90 cm is 0.62 of a square, each tuft give or take a third. Grass is drawn tall against the cattle on purpose, as in the MVP and the mockups, so height reads **(builder)** |
| Green leaf colour | Young to old leaf, the colours above, by the view's leaf age |
| Dry colour | Light straw to grey, the colours above, by how weathered the view says the dry feed is |
| Green at the base of rank grass | Each tuft is two pieces: dry stems at full height behind, green from the ground up in front, to height × green share × (0.65 to 1.35) × 1.25. A square that is all green is green to the tip on every tuft **(builder: the all-green case)** |
| Seed heads | A pale head on tufts where the view says so, on tufts tall enough to carry one |
| Sown pasture | Deeper green, with a white clover flower on some tufts |
| Crops | Upright plants in three rows to a square, bright green while leafy, golden with seed heads once heading or done. Three furrows to a square in the ground |
| Fallow | Worked brown soil with furrows and a few lighter clods. No tufts |
| Stubble | Pale straw ground with rows of very short stalks. No green, whatever its figures say |

### Cattle

- **Breeds:** Brahman style in Central Queensland (pale grey cows, cream heifers, red steers, dark grey bulls with a big hump, fawn calves, long ears). British-breed style elsewhere (black cows, dark brown heifers, red-brown steers with white faces, heavy grey bulls, brown calves). Colours for each kind **(builder)**.
- **Body shape** follows condition: thin shows ribs and a hip bone, fat is deeper and rounder. Bulls are bigger, calves smaller.
- **Never blurred into the grass:** every beast has a dark outline and, outside it, a thin pale rim. On pale ground the dark line carries it. On dark ground the pale rim does. A test holds the better of the two to 3 to 1 against every colour the ground or grass can be, at midday, first light, last light, under cloud and in rain. **(builder)**
- **Where they stand:** the farm does not store it. The map works it out from the view, the same way every time, so cattle do not jump about. A mob gathers round the square it was put on (usually water) and spreads out from there, about two to a square, without crossing a fence. Cattle stand back from fence lines and never on a square with a trough, the bore or a building. Calves stand beside cows. They move only when the mob, its numbers, or a fence, gate or trough changes. **(builder)**
- **Big mobs do not hide the pasture.** On open country a mob stands on no more than four squares in ten of its grazing area, three to a square at most. Past that it draws a sample. On a small area (eight squares or fewer, a tape cell say) it uses every square, up to six to a square, so high density looks crowded. The marker and badge always carry the real head count. *(v15 drew up to about 120 a mob.)* **(builder)**
- **Zoomed out:** one marker for each mob with a cow and the head count, on a soft footprint of the squares it stands on. A mob with no water has a salmon border and says "no water".
- **Zoomed in:** a small head-count badge above the mob.
- A mob in the feedlot is not drawn. A mob in the stock yards is drawn at the yards, a few at a time.
- Not yet: cattle walking and grazing, the selected mob, picked animals, and the profit marker over each beast.

### Fences, gates and water

- **Fences keep the colours above.** Every wire has a dark casing under it so it reads on any ground. Zoomed out they are bold lines. Zoomed in they have a ground shadow, posts every half square and wires standing above the ground. The boundary is heavier. Tape is white and dashed with orange posts.
- **Knocked-down fence:** a sagging red line with a red "!" marker. It is steady, not flashing **(builder)**.
- **Gates:** strainer posts and a white three-rail panel, swung into the paddock when open. A round flag above it is red when shut and green when open, drawn large so it reads zoomed out.
- **Bore:** a windmill about 1.9 squares tall. A gold ring and "Bore: put a trough or water hub here" until the first trough or hub is built. The fan turns and the ring pulses only when ambient motion is switched on **(builder)**. A paddock label that would sit over the windmill steps to one side.
- **Trough, water hub, portable trough:** as above. The portable trough's level bar is green over half, gold over a quarter, red below.
- **Homestead and stock yards** are drawn on their squares. The yards are timber pens with a race and a loading ramp. **No saleyard and no feedlot is drawn, and there is no sprite for either.** Sheds, silos and feed bins have sprites ready for when the model has them.

### Layers, light and weather

- **Layers:** water reach, pasture quality, recently grazed, arable land, pipe and labels, with the colours and strengths above. The profit layer is listed but not drawn yet: the view carries no figures for each beast.
- **Labels:** the paddock's name and its neutral label chip, then hectares, then "no water" in salmon or "water via gate". They hang under the paddock's top fence. Where the name does not fit, the paddock's number and a dot in the label's colour. The planting's name sits on the crop. **(builder: placement and the short form)**
- **Time of day:** one tint over the whole map. Warm and low at first light, white through the day, warm before last light, dark blue outside those hours. **Weather:** clear, overcast (dimmer) and rain (dimmer again, with falling streaks). The daytime tints are kept bright enough for the cattle contrast figure to hold. **(builder: the tint colours)**
- **Reduce motion:** nothing moves. Rain is drawn still, and the change of detail is made at once.
- **Themes:** the country keeps its natural colours in both. Only the surround, the labels and the markers change.

### Art

- Every sprite is drawn in code for now and registered by name (`cattle.british.cow.normal`, `trough.fixed`, `gate.across.open`, `tuft.leaf.0` and so on). Any one can be swapped for exported art without touching the map code. Grass pieces are drawn in greys and tinted with the colours worked out from the model, so one drawn piece serves every pasture state.

### Side-view pictures

- `drawSward` is kept as described above, drawn from the view's figures for the paddock: 0 to 80 cm frame, cm scale, litter layer, dry stems behind with seed heads past rankness 30, green leaf in front. A paddock that is part crop and part pasture gives two pictures, crop then pasture, each with its area. "Then vs now" is two calls with two views. It is plain canvas and loads without PixiJS.
