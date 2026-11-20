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
| Water reach | blue fading out to 1.5 km; yellow 1.5–3 km; orange over 3 km; purple = no water *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)* |
| Pasture quality | purple (ME 6.5) → green (ME 9.8) wash at 45% *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)* |
| Recently grazed | orange wash, stronger where more was eaten *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)* |
| Arable land | pale yellow wash (stronger on cropped squares). Also shown while using the Sow tool. |
| Pipe | blue `#5ab4f0` lines when connected to the bore, grey `#7e8a96` when not |
| Labels | paddock name (big paddocks in capitals), ha, "no water" in purple (the map's no-water colour, Claudia, 14 Nov 2026; the panels keep the site colour) or "water via gate"; planting name under crops |
| Profit | small green/red marker over each beast. *(Not built yet. When it is, it must not use red on the map: red on the map is only for "can't do this" while drawing. Claudia, 14 Nov 2026.)* |

## Infrastructure

| Thing | Look |
|---|---|
| Permanent fence | brown wire `#a06a38`, two strands, dark posts every half square, ground shadow |
| Electric fence | yellow wire `#ffe14a`, two strands |
| Temporary tape | white dashed tape, one strand, orange posts, shorter |
| Boundary | heavier brown wire |
| Contractor's fence under way | hot pink `#ff5cc8` on the dark casing: what the contractor has built is a solid line with cross ticks over the permanent fence, what is still to build is a dashed line with cross ticks, tagged "Team fence" when zoomed in. It is only drawn while the run is under way, then the fence is a normal permanent fence. Not red, not purple, not amber (milestone 2.2) |
| Gate | strainer posts, a white 3-rail panel; swings open into the paddock; slate flag when shut, green when open *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)* |
| Knocked-down fence | sagging amber line with an amber "!" marker. Clicking it puts it back up. *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)* |
| Bore | a windmill about 3× a cow's height with a turning fan and red tail vane. A pulsing gold ring and a "BORE: PUT A TROUGH OR WATER HUB HERE" pointer until the first water is built. |
| Trough | grey concrete with blue water |
| Water hub | round trough straddling the fence line or corner |
| Portable trough | blue plastic trough with a white tank and a level bar (green > 50%, gold > 25%, orange below) *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)* |
| Trees | 16 dark green pixel trees |
| Yards | feedlot and sale yards in a strip on the right of the map |

Drawing aids:

- Fence drag preview: a dashed line with the length and cost. Tape is white and dashed, whether it comes off the roll or is new; the card says how much comes off the roll. *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)*
- Snap dots: green = joins an existing fence, white ring = open ground.
- A hovered fence segment is highlighted white when it can be clicked.
- While a tool asks for a paddock (moving a mob), every paddock that can be picked has a light tint and outline, and a paddock with no water is tinted and outlined purple (the water layer's no-water colour).*(Changed: Claudia, 14 Nov 2026. Red means only "does not fit today".)* The paddock sheet lists the same paddocks, with "No water" in words, so colour is never the only signal.

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

### The game screens as the mockups (m8, 15 Nov 2026)

The built screens follow `docs/mockups/index.html` (Claudia, 15 Nov 2026). What is drawn:

- **Icons** are the mockups' 8 by 8 pixel grids (`ICONS`), drawn filled with crisp edges (`components/play/Icon.tsx`): hammer (Build), cow (Herd), grass (Paddocks), tag (Market), plan (Plans), dots (More), bell, house, trophy, book, user, lock. Drawn for the game in the same style: drop (water), help, close, back, chevron. The smooth line icons are gone.
- **Phone held upright:** the top bar is a card floating over the map (inset 8 px, radius 12, the translucent `--hud` background, a 1 px `--line` border, no lime top border). The map fills the screen behind it. The card holds the farm button, the farm name, day, date and mode, cash (and "Bank limit $X" under it when cash is below zero), the bell with the unread count, Help, the daylight bar (12 px) with first light, a light note and last light under it, a line of facts (town, season, head, and last night's rain when the server sends it), and the time buttons. "N things to check" sits under it, open with the first three as short lines with square bullets (coral for urgent, amber for the rest).
- **Daylight bar:** an open job card's slice of the day is a striped coral part from now. The note says "This job: about N h" while it is open. Time stays light: no countdown.
- **Bottom tabs:** Build, Herd, Paddocks, Market, Plans, More, 10 px pixel labels, 24 px icons. Build opens the build tray, docked full width on the tabs with its grab handle. The job card is key and value rows (Takes, Cost, Fits in today's light, Daylight left after) and Cancel | Build it.
- **Paddock sheet:** title, label chip and "ha · Water ✓/✗" on one row; six tiles in three columns (kg DM/ha, height, % green, ME, CP, AE/ha); "Mob: … about N days of feed at this rate" (or the server's feed words); the side-view picture; the comment line in italics when the server sends one; Move cattle in here (coral) beside Details (ghost) at 1.6 fr / 1 fr.
- **Segmented controls:** a padded pill, pixel font 11 px, the chosen one coral with white words. **Sort chips:** the chosen one inverted.
- **Market chart:** one colour per class, the series tokens `--s0` to `--s6` (both themes), still with a dash per line so colour is never the only signal.
- **Scores:** each part's bar in its own series colour, 12 px, radius 2, no track. A part that took points off stays muted.
- **Day summary:** the whole screen on a phone held upright, "Day N done" or "N days done", the lines, and a full-width Back to the farm.
- **Phone on its side:** a slim bar with the date on one line and cash at the far right; panels full screen with ✕, the paddock sheet and the lists in two columns; the build tools bottom left and the job card on the right.
- **The PC header at every PC width (900 px up):** one row of about 63 px from 1024 to 1920. The date block keeps 150 px and ends its lines in an ellipsis, never one word a line. As the window narrows the header drops, in order: the facts line (1365 px and under), the daylight labels and a shorter bar (1279), a 110 px bar with short skip chips +1w, +1m, +1y (1180), and below 1024 the time controls take a second row. The panel tabs stay on one row (smaller padding, "Scores" for "Scores · Diary" at 1180 and under, a scrolling row as a last resort) and the panel is at most 42% of the window. A tablet held upright (768 x 1024) gets the phone layout.
- **Mounted in the second pass:** the stock book behind the "Mobs | Stock book" switch on Herd (it loads with the record the first time it opens), the Sell money line under each Sell picker (the Market's and the mob card's), the Feed panel as a More row on a phone and a tab between Paddocks and Market on a PC, the paddock comment line in italics in `--ok` under the picture, rain last night in the phone bar's facts line, a Rest days column on the PC paddocks table, and the weekly price change (▲ green, ▼ coral, "no change" muted) on the Buy rows and a Week column on the price table.
- **Plan form (mockup F):** Leg 1 and "Add a leg" up to eight; each leg a card with its paddocks as chips joined by arrows (the first one inverted), "+ add" to tap paddocks into that leg, its own rule switch (Move every N days, Times a day, Move at kg DM/ha) and rounds; the last leg can keep going. Then Repeat | Stay, the water line ("✓ Water in every paddock" or "✗ No water in …"), Start from, and Save plan beside New plan. The map numbers the paddocks 1.1, 1.2, 2.1 when a plan has more than one leg.
- **PC:** the website header (logo, Farm, and Community, Leaderboard and Groups when switched on, the bell and the account when signed in; no "Play free"), then the game header (farm box, "Year N · date" over district, ha and head, the 250 px daylight bar with labels, the time chips with Next day in coral, cash over net worth at the far right). The side panel's tabs: Build, Herd, Plans, Paddocks, Feed, Market, Scores · Diary, More; its width follows the tab (Paddocks 440 px, Herd 640 px, the rest 500 px). The sponsor rail, when on, is 180 px at the far left.

### The Feed panel and the stock book (rebuild, m8 second pass)

- **Feed forecast chart** (`FeedPanel`, plain SVG, no chart library): feed on offer as a filled area in `--ok` with a 2 px line, tonnes of DM over the farm, from "Now" and then the first of each month for a year (12 different months). The grazing floor is a dashed 2 px `--coral` line across it. Crops are bars in `--sky` stacked on the pasture at their month, so they read as spikes. The y axis has three ticks on a round top (1, 2 or 5 times a power of ten) in tonnes. A legend names all three. The chart is an image with a one-sentence summary for a screen reader, and the figures are in a table under "Forecast figures". The card under it says the facts and that it is an average-season forecast, and "How this is worked out" lists what it assumes.
- **Supplements** (same panel): one card a mob, with what it is on, its cost a day, what it adds, and a button per supplement with its cost a day. The one it is on is pressed (`--btn`). In the yards or the feedlot the reason shows instead of buttons. The job card draws under the mob's card.
- **Stock book** (`StockBook`): chips for All and each mob, a sort picker, then a table. Up to 560 px of panel it shows Tag, Class, kg, CS and Profit (the phone list in mockup 8); from 560 px it adds Age, PTIC, Bought, Spent and Value now (mockup D). Column heads sort, with `aria-sort`. Profit is `--ok` above zero and `--bad` below, with a + or a minus sign, so it never relies on colour. 50 rows, then "Show more". How the figures are worked out sits under a disclosure.
- **Sell money line** (`SellProfitLine`): "Bought for $1,050, $40 spent since · profit +$266/head" in 12 px, the price muted.

## Narrow screens

- No horizontal scroll at phone width. Info-bar items wrap, and the feed charts shrink.
- Confirmations and results appear **inline next to the button you pressed** (saleyard buy/sell confirm and result rows), not off-screen.

## The rebuild's map (milestone 1.6a)

How the PixiJS map in `packages/render` draws each thing above. The rule is unchanged: the picture must match the model. The map is drawn from the farm view (`FarmView`, built by `farmView` in the engine), which carries figures only. Everything in this section marked **(builder)** was decided while building and is for Claudia to check. The rest is hers or the PRD's.

### The farm view

- The map never sees the farm. It sees a view: for each square its land use, standing height in cm, green share, ground cover, how old the leaf looks, how weathered the dry feed looks, whether seed heads show, the neutral label, the planting on it, diet energy, recent grazing, distance to water and whether it is arable. Then fences, gates, pipe, troughs, hubs, the bore, buildings, paddocks, grazing areas, plantings and mobs.
- Every figure is read from the model's own summaries. A square's height is the paddock summary's height for that one square, so the map, the paddock sheet and the side-view picture all use one height figure. *(The MVP's map used a second height formula of its own. It gave nearly the same answer.)* **(builder)**
- Where seed heads show, which cattle look thin or fat, and how weathered dry feed looks are worked out on the server and sent as plain flags and steps. The browser holds no thresholds for them, on the map or in the side-view picture.
- The view holds no seed, no prices, no soil fertility, no grain yield in prospect and nothing about days to come. A test lists every field it may hold.
- **The side-view figures are rounded to what a paddock sheet shows and no finer:** kg DM/ha to the nearest 10, height and leaf reach in whole cm, green share and cover in whole %, leaf age in ten steps, and seed heads as a share of stems in tenths (none at or under rankness 0.3, as in the MVP's picture). Sent any finer, the height and leaf-reach rules could be worked back out of the view. The realism check did exactly that with the first version. **(builder)**
- A mob's cattle are counted by kind (with how many are thin and how many fat), not listed. The whole view for a farm with 4,141 head is 42 KB as JSON. The budget in the test is 64 KB.
- Trees: the model has none, so the view's list of trees is empty and no trees are drawn. The tree sprite exists. *(The MVP's 16 trees were decoration.)* **(builder)**

### Clear map zoomed out, detail zoomed in

- **Switch point:** 26 screen pixels a square (PRD 7). At or below it each mob is a marker over its cattle drawn as dots (or a patch where they are too close to read as dots, see Cattle). Above it cattle and grass tufts are drawn.
- **The hand-over is a fade in time** (about a fifth of a second), not a blend by zoom, so the map never sits half way between the two pictures. Each picture holds for one pixel a square past the switch point, so a pinch that hovers there does not flicker. With "reduce motion" the change is made at once. **(builder)**
- **Zoom range:** from the whole farm in view to 96 pixels a square. *(v15 was 1 to 5 times.)* **(builder)**
- **On a phone held upright** the farm fills the height and runs past the sides (PRD 6.1). On its side, and on a PC, the whole farm fits.
- **Zoomed out:** each square is one clean colour **(builder: the mixing rule, the raise, the bands and the flecks)** worked out from its figures: soil, straw litter or shaded ground underneath, mixed with the colour of the tops by ground cover. Rank grass reads as straw, leafy grass as green, short grass shows soil. Each square is raised by its height (90 cm is half a square) and the front of a raised square shows where it stands taller than the square in front of it. Cropping country shows its rows.
- **Zoomed out, green at the base and seed heads still read.** The front of a raised square is the sward in profile: a green band from the ground up as far as the green reaches, and a straw band above it. So rank grass with green at its base shows green under straw from a distance. A pasture square that carries seed heads has three pale flecks on it. *(The first build drew the front as a darker copy of the top and drew no seed heads zoomed out. The realism check found it.)* **(builder)**
- **Zoomed in:** the ground is one picture, 18 pixels to a square, laid in the pattern of the pasture's form (see "The base of a paddock" below). Squares blend into their neighbours inside a paddock but never across a fence line or a change of country, so a short paddock beside a rank one keeps a sharp fence-line contrast. Nine tufts stand on each square. *(Changed: 19 Nov 2026, from 9 pixels to a square with one blended colour, after Claudia found the base "pretty bare and weird on some spots, great in others".)* **(builder)**
- **Taps** open the paddock, never a cow. Zoomed out, the tap is tested against the raised squares as drawn (LESSONS 28).

### Grass, square by square

| Thing | How the rebuild draws it |
|---|---|
| Ground cover | Each square has nine fixed tuft spots. A spot stands if its own fixed number is under the share of ground hidden × 1.05. The share hidden is the model's own ground cover, the paddock sheet's figure: feed ÷ 1,000 kg DM/ha, up to 1, so about 1,000 kg DM/ha covers the ground, as in the MVP above. The server sends it in twentieths as `hidden` (finer than the tenths of `cover`, so neighbouring squares blend smoothly); a view from before 19 Nov 2026 has no `hidden` and uses `cover`. The pasture's form sets only the pattern the cover is drawn in (see "The base of a paddock" below). *(20 Nov 2026: the first build of the base drew a share from a curve by form, so Central West native at 1,000 kg DM/ha showed about 40% open ground while the paddock sheet said 100% cover. Put back to the model's cover: LESSONS 4.)* **(builder)** |
| Bare soil, litter, shaded ground | The colours above, unchanged. Dry grass sits on straw litter, never soil |
| Height | Tuft height follows the view's height in cm: 90 cm is 0.62 of a square, each tuft give or take a third. Grass is drawn tall against the cattle on purpose, as in the MVP and the mockups, so height reads **(builder)** |
| Green leaf colour | Young to old leaf, the colours above, by the view's leaf age |
| Dry colour | Light straw to grey, the colours above, by how weathered the view says the dry feed is |
| Green at the base of rank grass | Each tuft is two pieces: dry stems at full height behind, green from the ground up in front, to height × green share × (0.65 to 1.35) × 1.25. A square that is all green is green to the tip on every tuft **(builder: the all-green case)** |
| Seed heads | A pale head on tufts where the view says so, on tufts tall enough to carry one |
| Sown pasture | Deeper green, with a white clover flower on some tufts |
| Crops | Upright plants in three rows to a square, bright green while leafy, golden with seed heads once heading or done. Three furrows to a square in the ground. A crop's height is the paddock summary's height for the square, held to the crop's tallest. *(The MVP's map used feed ÷ 450.)* **(builder)** |
| Fallow | Worked brown soil with furrows and a few lighter clods. No tufts |
| Stubble | Pale straw ground with rows of very short stalks. No green, whatever its figures say |

### The base of a paddock (19 Nov 2026)

Claudia, after playing: "we need to make sure the base of the paddock looks a bit more like what that real grass type would form. From the air it's pretty bare and weird on some spots, great in others." *(Before this, every pasture was nine random tufts on one blended colour, and a tuft stood or did not on a hard test of the model's cover in tenths, so at about 300 kg DM/ha three tufts in nine stood on brown soil, and neighbouring squares jumped a tenth at a time.)*

**What the server sends.** Two display figures for each square, both optional so a past day's picture still draws (`squares.form` and `squares.hidden`, view version still 4):

- `form`: how the plants sit on the ground, seen from above. From the district for native pasture, from the species for a sowing, rows for crops, annual forages and stubble, bare for fallow. An oversown legume (stylo) keeps the native form.
- `hidden`: the share of the ground hidden, in twentieths. It is the model's own ground cover (feed ÷ 1,000 kg DM/ha, up to 1), the same figure as the paddock sheet's Ground cover, so the map and the numbers agree (LESSONS 4). Stubble is drawn fully covered and fallow bare whatever the figure. *(20 Nov 2026: the first build sent a curve by form, 1 − e^(−feed ÷ k), which disagreed with the paddock sheet. The sourced shapes in `docs/DATA.md` now only inform how each form's pattern looks, not how much it hides. A cover that differs by pasture would be a model change, for Claudia: CALLS G2.)*

| Form | Where | How it is drawn from above |
|---|---|---|
| Tropical tussock | Central Queensland native (black speargrass, Queensland bluegrass, Indian couch) | Tussock clumps, with a finer grain between them (the couch) |
| Low tufts | Northern Tablelands native (red grass, wallaby grass, weeping grass) | Small close tufts and fine grain, nearly even |
| Open tussock | Central West and Western Victoria native (wallaby grass, speargrass, red grass, kangaroo grass) | Clumps with open ground between |
| Bunch | Buffel grass | Big clumps, broad tufts |
| Hedgerow | Leucaena and buffel | Buffel clumps, with two dark green hedgerows across each square (thinner where browsed hard) |
| Carpet | Perennial ryegrass and white clover, multi-species | Fine, even grain: near-continuous leaf with small scattered gaps. White clover flowers |
| Tussock and clover | Phalaris and sub clover | Mostly fine grain with some clumping. White clover flowers |
| Crowns | Lucerne | Separate crowns, four to a square each way |
| Rows | Crops, annual forages, stubble | Filling out from the middle of three drill rows a square, furrows between |

(Every form hides the same share at the same feed: the model's cover. The form changes where the open ground lies, not how much of it there is.)

**How the ground picture is laid.** Each square has two colours: its open ground (soil, with litter lying in the gaps the more the sward hides, up to 45% litter) and its sward's base (the low leaf over shaded ground or litter, with some of the tops colour: more for a carpet, less for tussocks). Each pixel has a fixed order in its square for its form's pattern, and is the base colour once the square's hidden share passes it, with a soft edge. So the share of the square that shows open ground is exactly what the server sent, whatever the pattern. The patterns:

- **Clumps** grow round the nine tuft spots, the spots whose tufts stand first first, so zoomed in each tussock stands on its own clump. A clump reaches into the next square, so none is cut off at a square's edge. Inside a clump the leaf is a little brighter, at its edge a little darker.
- **Carpet** is a fine grain, so its gaps are small and scattered. Between tussocks the open ground lies in patches.
- **Rows** fill from the middle of each drill row out to the furrow.

The hidden share and both colours blend between squares inside a paddock (never across a fence or a change of country), so neighbouring squares never jump. The ground picture of a square averages to its open ground and base mixed by the hidden share (a test holds the two within 14 in each colour channel). Zoomed out each square is that colour with the tops laid over it, as the tufts lay them zoomed in.

Seed heads, green at the base of rank grass, crops, fallow and stubble are drawn as before, on top. The cattle contrast test now includes every open ground, base and field colour, for three forms.

**Speed.** The patterns are worked out once for each square the first time it is drawn with a form, and kept. A new day blends and thresholds only. After the first view the ground is repainted a few rows a frame (up to 5 ms a frame), changed rows and the rows either side, and goes to the screen in one piece when done; until then the map shows yesterday's ground. *(Not measured on a phone. On the build PC, under heavy load from other work, a full repaint took 20 to 60 ms against 20 to 37 ms for the old 9 pixel picture, and the first paint of a farm about 0.4 s. Spread over frames as above.)*

### Cattle

- **Breeds:** Brahman style in Central Queensland (pale grey cows, cream heifers, red steers, dark grey bulls with a big hump, fawn calves, long ears). British-breed style elsewhere (black cows, dark brown heifers, red-brown steers with white faces, heavy grey bulls, brown calves). Colours for each kind **(builder)**.
- **Body shape** follows condition: thin shows ribs and a hip bone, fat is deeper and rounder. Bulls are bigger, calves smaller.
- **Never blurred into the grass:** every beast has a dark outline and, outside it, a thin pale rim. Drawn under 10 screen pixels long, a beast or sheep uses its small sprite, drawn with a heavier line and rim, so the rim is at least 1 px wide on screen at every small size (`SMALL_SPRITE_BELOW_PX`, `MIN_RIM_PX`; 20 Nov 2026). From 10 to 18 px the full sprite's rim is about 0.5 to 0.9 px. **(builder)** On pale ground the dark line carries it. On dark ground the pale rim does. A test holds the better of the two to 3 to 1 against every colour the ground or grass can be, at midday, first light, last light, under cloud and in rain. **(builder)** **Night is not in that test.** After last light the map goes dark blue and the contrast falls to about 2 to 1. Nothing is done at night in the game (the day ends at last light), but a player can look. To fix or to accept. **(builder)**
- **How big (19 Nov 2026, Claudia: "ideally the paddock to cow size a little bit more representative so it's easier to see density, because right now 900 fills like a quarter of the area on 3000 ha").** Each beast is drawn near its real size against the paddock: its real length (cow 2.4 m, heifer 2.2 m, steer 2.3 m, bull 2.7 m, calf 1.3 m) times 4 (`CATTLE_EXAGGERATION`), at the farm's metres a square. A cow is held between 5 and 18 screen pixels long (`CATTLE_MIN_PX`, `CATTLE_MAX_PX`), and zoomed in is never shorter than a tenth of a square (`CATTLE_MIN_SHARE_OF_SQUARE`), so a player who zooms right in on a big farm still sees what each beast is. Other kinds are in proportion to the cow, and nothing is under 3.5 pixels. At full zoom on a 200 ha farm a cow is 18 px; on a 3,000 ha farm it is about 10 px at full zoom and 5 px half way out. *(Before: every beast was four tenths of a square long whatever the farm's size, 17 m on 200 ha and 96 m on 6,000 ha.)* **(builder: the factor 4, the 5 to 18 px and the tenth of a square)**
- **How much ground a mob takes up.** About 400 m² a head (`HERD_M2_PER_HEAD`), or its whole grazing area if that is smaller. So 900 head on a 3,000 ha farm take about 36 ha, 13 of the farm's 1,040 squares: a herd in part of a paddock, not a quarter of the farm. The same mob in a small strip fills it, so high density looks crowded. A mob of less than a square stands in the middle part of its square. **(builder stand-in: 400 m² a head has no source; `docs/CALLS_FOR_CLAUDIA.md` section 2)**
- **How many are drawn.** One sprite a head up to 400 a mob (`MOB_DRAWN_MAX`) and 3,000 on the farm (`FARM_DRAWN_MAX`, every mob fewer in proportion past that, 24 at the least). A square never holds more than hides 40% of it zoomed right in (`MAX_HIDDEN_SHARE`, `perSquareCap`: the drawn length at full zoom, squared, taken as the ground a beast hides; about 43 steers to a 1 ha square, 11 cows to a square of a 200 ha farm). That keeps the rule that big mobs don't hide the pasture on a crowded strip, while a strip still reads denser than a paddock at grazing density (22 or 23 to a 1 ha square). Sheep follow the same rule. Past either limit a mob draws a sample spread over its true ground, so its footprint stays true. *(Put back 20 Nov 2026: the first build had no cap per square, so a four-square strip drew 400 cattle. LESSONS M12.)* The sample keeps every kind and the share of thin and fat. The marker and badge always carry the real head count. The speed test's "every beast" still draws every head, up to six to a square. *(Replaces: four squares in ten of the area, three to a square.)*
- **Where they stand:** the farm does not store it. The map works it out from the view: a mob gathers round the square it was put on (usually water) and spreads out from there over its ground, without crossing a fence. Cattle stand back from fence lines (a fifth of a square at the sides, 0.35 under a fence above) and never on a square with a trough, the bore or a building. Calves stand beside cows. **(builder)**
- **Cattle walk and graze (19 Nov 2026, Claudia: "the cows don't seem to move like they did in the first version of the grazing game which is fun"), as in the MVP.** Each beast stands and grazes for half a second to four seconds, then takes a short walk at about 1.8 of its own lengths a second (the MVP's pace), and faces the way it walks. Where it walks to: 7 in 100 walks go to water in its paddock, up to 45 in 100 go next to a mob-mate so the mob keeps loosely together, and the rest go to a square of the herd's ground picked by a drawing preference (`feedPull`): made-up weights built only from what the view sends for the picture, linear in cover, half as much again for an all-green square, and a mild linear pull towards water (2% less for each square further, never under half). Bare ground hardly draws them. *(Changed 20 Nov 2026: the first build copied the model's own diet weighting into the browser, against PRD 5.16. LESSONS M11.)* **(builder: the weights)** Calves follow their mothers. A beast never walks through a fence or out of its grazing area: if a step would cross one it stops and picks again. The herd's patch drifts round a big paddock every 25 to 70 seconds, a short way to better feed or now and then to water, and the marker follows it. A mob that fills its paddock does not drift. This is drawing only: the model never reads it.
- **Places carry over.** A new day's view leaves every beast where it stood. A mob that loses a few head keeps the rest where they were. A mob moved to another paddock trots there from where it stood, in a straight line, and is drawn as dots while on its way zoomed out (there are no routes: you took them out, so cutting across is drawn). Bought cattle walk out of the yards. New cattle in a split or a merge come from where the old mob's cattle stood. **(builder: the straight line, 1.5 to 6 seconds to get there)**
- **Game speed.** The page tells the map how fast the days run (`setCattlePace`: 1, 2, 4, or 0 for paused). The cattle walk and stand that many times faster. Paused, they stand still, but a mob that was just moved still walks to its paddock.
- **Reduce motion:** nothing walks. A moved mob is put straight in its new paddock.
- **Over the grass.** A row of cattle is drawn after the grass of the row in front of it and before the troughs and the windmill in front, so a beast drawn near its real size never hides in tall grass, and a trough in front still covers it. *(Before: cattle and grass were sorted together, which worked while cattle were four tenths of a square long.)* **(builder)**
- **Zoomed out (19 Nov 2026, Claudia: "I would like to see the cows when zoomed out if the densities aren't too large").** Each beast drawn is a dot 3.5 screen pixels across (`DOT_PX`): a near-black middle with a thin pale rim, the same two colours as the cattle outline and rim, so it reads on every ground and grass colour. A mob is drawn as dots while its cattle stand at least 4.5 pixels apart at their true density (`DOT_MIN_SPACING_PX`). Closer than that the dots would run into a blob, so the mob is a filled patch over the ground it takes up: the outline colour at 80% with a pale rim 1.5 screen pixels wide round its edge (`HERD_PATCH`), held at 3 to 1 against every ground and grass colour in daytime light by the palette test. *(Changed 20 Nov 2026: the first patch was the outline colour at half strength with no rim, under 3 to 1 on shaded ground, soil, litter and straw.)* On a 200 ha farm seen whole every mob is dots. On a 3,000 ha farm seen whole, a mob at grazing density is a patch, a herd in part of a paddock. A mob on its way to a new paddock is always dots, so it can be seen going. The marker (a cow and the head count) sits on the herd's top edge so the dots or the patch show under it. A mob with no water has a purple border and says "no water". **(builder: the dot, the 4.5 px and the patch)**
- **Zoomed in:** a small head-count badge above the mob, which follows the herd as it drifts.
- A mob in the feedlot is not drawn. A mob in the stock yards is drawn at the yards, 14 beasts at most however many are held there, milling about in the pens **(builder)**.
- **Speed.** Positions are kept in typed arrays and only mobs on screen walk (a mob on its way somewhere keeps going). Each frame sends only positions and sizes to the graphics card; the order in a row is put right with one pass. When every beast on screen is standing, no frames are drawn until the first one is due to set off, and a hidden page draws none. The work a frame is held by the cattle drawn (3,000 at most): on the build PC a step of 1,200 beasts takes about a quarter of a millisecond, and placing a farm's mobs about 5 ms. Not yet measured on a phone.
- Not yet: the selected mob, picked animals, and the profit marker over each beast.

### Sheep (milestone 2.8)

Sheep mobs (flocks) come in the view as `flocks`. A view with none draws exactly as before. **Sheep are drawn in code: there is no sheep art in the repo, and no `art/` folder yet.** Each sheep is registered by name (`sheep.ewe.normal`, `sheep.ewe.thin`, `sheep.lamb.normal`, `marker.sheep` and so on) and can be swapped for exported art like any other sprite. **(builder, for Claudia to check)**

- **What a sheep looks like:** a round woolly body made of overlapping lobes, so the outline is bumpy like wool. A small dark grey face with a cap of wool on top, and thin dark legs. A few curls are drawn in the wool. Merino style: cream wool `#f1ead6` (ewe), `#ece3cc` (wether), `#e6dcc2` (ram), `#f3edda` (young), `#f6f1e2` (lamb). Faces `#4a4642` to `#55504a`, legs `#37332f` to `#3e3a35`.
- **Kinds:** a ram is about a fifth bigger, a little darker in the wool, with curled horns. A young sheep (weaner or hogget) is about four fifths of a ewe. A lamb is half a ewe, paler, with longer legs for its size.
- **Condition:** a thin sheep (under CS 2) is leaner, with longer-looking legs, wool 16% darker and duller, and a hip bone and backbone showing. Lambs have one shape. The thin share comes from the view, so the browser holds no threshold.
- **Never mistaken for cattle:** a sheep is round and bumpy where a cow is a long smooth box. Cattle never have cream wool and a dark face.
- **How big (19 Nov 2026):** sized by the same rule as the cattle, in proportion to a cow: ewe 1.3 m, wether 1.35 m, ram 1.5 m, young sheep 1.1 m, lamb 0.75 m long, so a ewe is about half a cow. Nothing is under 3.5 pixels. **(builder: the lengths)**
- **Never blurred into the grass:** the same dark outline and thin pale rim as the cattle, drawn round the whole sheep as one shape. A test holds the better of the two to 3 to 1 against every ground and grass colour in every daytime light, and holds the outline to 3 to 1 against every fleece, thin ones too. The dark face and legs are carried by the pale rim. The same night caveat applies as for cattle.
- **Where they stand:** worked out by the same rules as cattle (cattle section above): inside the grazing area, never across a fence (netting included), back from fence lines, never on a trough, the bore or the yards' square, gathered round the square the flock was put on. Sheep stand a little closer to a fence than cattle do, because they are low. A flock takes up about 60 m² a head (`SHEEP_M2_PER_HEAD`, a flock grazes closer than a mob of cattle), or its whole grazing area if smaller, so a small flock stands close together and a big one fills a small paddock. One sprite a head up to 600 a flock (`FLOCK_DRAWN_MAX`), then a sample spread over its true ground. A flock of 7,000 draws 600 sheep, not 7,000. *(Replaces: four squares in ten of the area, about five to a square.)* **(builder: the 60 m²)** The sample keeps every kind in the flock and the share of thin sheep and lambs. Lambs stand beside a ewe.
- **Zoomed out:** one marker for each flock. The sheep are pale dots with a dark rim (the reverse of a cattle dot, so a flock never reads as cattle), or a pale patch (85%) with a dark rim over the flock's ground where the dots would run together, by the same rule as cattle. The marker is a woolly cloud on thin legs (a cow marker is long and smooth), then the head count, then the word "sheep". A flock with no water has the purple border and says "no water". One flock to a paddock still shows clearly.
- **Zoomed in:** the sheep, and a small badge above the flock with the woolly icon and the head count.
- **In the stock yards:** the flock stands in the yards' square, 24 sheep at most however many are held there. A flock in a feedlot is not a thing: there is no feedlot.
- **Taps:** tapping a sheep opens the paddock, never a sheep, as for cattle. Hit testing is of the ground only.
- **Speed:** sheep go into the same one-batch layer as the cattle (a row at a time, sorted back to front with them), so there is no extra draw. Positions are worked out only when the flock, a fence, gate, trough or the yards change. Sheep do not walk yet: they stand where they are put.
- **Not yet:** sheep walking and grazing, shearing, and a selected flock.

### Fences, gates and water

- **Fences keep the colours above.** Every wire has a dark casing under it so it reads on any ground **(builder)**. Zoomed out they are bold lines. Zoomed in they have a ground shadow, posts every half square and wires standing above the ground. The boundary is heavier. Tape is white and dashed with orange posts.
- **Contractor's fence under way (milestone 2.2):** `#ff5cc8`, a hot pink that is none of the other line colours: not the red of "does not fit today", not the purples of "no water", not the amber of a fence that is down, not the brown, yellow or white of the three fences, not the blues of water. Built segments are a solid line with the dark casing, over the permanent fence beneath. Segments still to build are dashed in the same pink. The player's own fence is drawn as before, in its own colour, so the two can be told apart while both are going up. A test holds the colour away from the others by hue and keeps it readable on the casing and on the grass. **Colour is never the only cue** (pink, lilac and blue run close under protanopia and deuteranopia, and the check on hue is not enough): the team's fence has a line pattern no other line has, short cross bars (ticks, like sleepers on a railway) every 13 screen pixels along it, 11 px long, at every zoom. Built is a solid line with the ticks; still to build is a dashed line with the ticks. Tape is dashed without ticks, a fence that is down sags, pipe and the other fences are solid. A test (`linestyle.test.ts`) holds the team's patterns different from every other line's, and the only ones with ticks. From 30 px a square the run also carries a small tag, "Team fence", at a steady size. There is no map key panel in the game. The key is in words and swatches: the Farm tab line ("Contract fence: 1,200 m left, done on Tuesday 3 March") has the pink swatch and the team buttons on the fence card each have it. The colour is the same in both themes, as the country is.
- **Knocked-down fence:** a sagging amber line with an amber "!" marker. It is steady, not flashing **(builder)**. *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)*
- **Gates:** strainer posts and a white three-rail panel, swung into the paddock when open. A round flag above it is slate when shut and green when open, drawn large so it reads zoomed out. *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)*
- **Bore:** a windmill about 1.9 squares tall, which is about 7 cow heights. *(The spec above says about 3 times a cow. It is drawn bigger so the bore is easy to find zoomed out.)* **(builder)** A gold ring and "Bore: put a trough or water hub here" until the first trough or hub is built. The fan turns and the ring pulses only when ambient motion is switched on **(builder)**. A paddock label that would sit over the windmill steps to one side.
- **Trough, water hub, portable trough:** as above. The portable trough's level bar is green over half, gold over a quarter, orange below. *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)*
- **Netting fence (sheep-proof), built (milestone 2.8, 15 Nov 2026).** It is the one fence that holds sheep, so it reads differently from the cattle fences at every zoom, by colour and by pattern. The view marks netting with the fence code `VIEW_FENCE.netting` (8). A view with no netting draws exactly as before. **(builder, for Claudia to check)**
  - **Colour:** sea-green (teal) `#16b890`, the same in both themes, as the country is. It is none of the other line colours: not red (only "does not fit today"), not purple (no water), not amber (a fence down), not the contractor's pink, not the brown, yellow or white of the other fences, not the blues of water or the green of an open gate. It is darker than young leaf and straw. On a ground of its own brightness (weathered straw, say) the dark casing under it and the pattern carry it. A test holds the colour apart from the others by hue.
  - **Pattern:** a fine zigzag mesh, which no other line has. It is not dashed (tape), not crossed by ticks (the contractor's fence) and does not sag (a fence down). `linestyle.test.ts` holds the pattern to itself.
  - **Zoomed out:** a bold sea-green band, 3.4 pixels wide on a 5.2 pixel dark casing, with a fine dark zigzag worked along it (turns every 3.6 pixels). It reads as chain link and is bolder than the cattle fences' wires (1.7 pixels).
  - **Zoomed in:** posts a little taller than a permanent fence's, two sea-green wires at 0.04 and 0.17 of a square high, and between them two zigzags that cross each other and make diamonds. A run down the map swings the zigzag sideways, so the mesh still shows.
  - **Drawing it:** the draft is a sea-green line on the dark casing with the same fine zigzag, so a netting draft is not mistaken for a plain fence. Red for the part that does not fit today works as for every other line.
  - **What it does:** it stops cattle and sheep as a permanent fence does, and it is drawn on the same line a tap, hover or Remove tool can reach. Netting cannot be knocked down.
- **The stock yards** are drawn on their square (no homestead: REQUIREMENTS, 14 Nov 2026). The yards are timber pens with a race and a loading ramp. **No saleyard and no feedlot is drawn, and there is no sprite for either.**

### The build tools on the map (milestone 1.7c)

All of this is drawn on two layers above everything else on the farm, so a draft or a hover redraws only those and never the grass or the cattle. Line widths are set in screen pixels and follow the zoom.

- **Draft line:** the fence's own colour on a dark casing (permanent brown, electric yellow, tape white and dashed, pipe blue). Pipe draws a tint on each square and a line through their middles. **The part that does not fit today is red**, solid, on the same casing. It is the only red on a line or square on the map (Claudia, 14 Nov 2026). The card beside it says the same in words, so colour is never the only signal. Red goes with the server's job card: the first pieces drawn that fit are the line's colour, the rest are red. If none fits, all of it is red.
- **Snap dots:** at each end of a fence line, green and filled where it joins an existing fence, a gate or the boundary, a white ring on open ground. A dot also shows at the corner under the mouse in the Fence and Water hub tools.
- **Hover (PC):** in a tool the thing under the pointer is highlighted: a fence segment or gate in white with a dark casing, a square outlined and tinted lightly, a corner as a dot.
- **Remove:** what is about to go is marked with a lilac glow round a white core. *(Changed: Claudia, 14 Nov 2026. Inside the map, red means only "can't do this" while drawing.)* Tape marks the whole straight run that is rolled up.
- **A knocked-down fence** is tapped in Look. It offers the card "Put this fence back up", marked on the map, and a tap anywhere else still opens the paddock.
- **Panning in a tool:** a drag draws, so the map is moved with two fingers, the space bar held, or the middle mouse button. Wheel and pinch still zoom. In Look nothing changed: one finger pans, a tap opens the paddock.
- **Builder's choices (not in the spec above):** the dashed white for draft tape, the 7 px dark casing, the 7 px dot, a trough or hub picked is marked with a white square or dot, and a tap in a tool reaches the nearest fence within 22 px (10 px counts as "right under the finger" in Remove, so a trough beside a fence can still be picked).

### The grid while building (19 Nov 2026)

Claudia: "I'd like to see a grid representing the fence, making it more visual so I know what to select." While a build tool is picked the map shows what that tool can use. It goes the moment the tool snaps back to Look. (`packages/render/src/buildgrid.ts`, drawn by `map.ts`.)

- **Fence:** a faint white lattice of the fence lines (1 px, 20%), the farm's edge a little stronger (32%). Zoomed out it thins so lines are never closer than 12 px on screen: every line, then every 2nd, 5th or 10th. Once squares are 18 px or more, every corner gets a small dot. Around the pointer or finger, three squares out, every line and corner is drawn stronger and fades in three steps, so the player sees exactly which corners a drag will snap to.
- **What a line joins to:** every fence, gate and the boundary gets a soft light-green glow underneath (9 px, 42%), so the things to start from stand out. The fences themselves stay on top, in their own colours.
- **Pipe, trough, portable trough:** the same lattice, read as squares; the fence glow is half as strong.
- **Gate and Remove:** no lattice. The fences and gates a tap can pick glow more strongly (12 px).
- **Water hub on a corner:** the lattice, and a light-green dot with a dark edge on every fence corner, the corners a hub can go on.
- **Target ring:** in a tap tool the thing under the mouse, or under a finger as it presses, gets a white ring (15 px) on a dark casing, round the middle of the segment, square or corner.
- **Length:** a pill at the end of a line being drawn gives its length, "300 m" or "1.2 km", in the line's colour. It counts what the job builds, as the server's job card does, so the two agree: new fence segments only (not the boundary, a gate, or fence of the same kind already there; a downed tape counts, it goes back up), and new squares of pipe only (not the bore or pipe already laid), each at the square's exact side (`draftMetres` in `packages/render/src/draft.ts`). The card's "Checking" line uses the same count. A test holds the label, the card's first line and the server's card to the same metres. *(20 Nov 2026: the first build counted every drawn segment and pipe squares less one, at a rounded side.)*
- **Red** stays only for "doesn't fit today". Nothing in the grid is red.
- **Speed:** the grid is drawn in screen pixels on zoom steps (four to a doubling), never per frame, and only the stronger patch is redrawn as the pointer moves to a new corner.
- **Keeping clear of the page:** on a phone the farm can be dragged out from under the top bar and the build tray (on its side, from under the tool column and the card), and when the card comes up the map moves just enough to show the end of the line. Without a bar nothing changes: a camera that was in range still is.
- **Builder's choices:** every strength, width and step above, the light green of the glow (`#d8ffb0`), the 12 px gap, the 18 px for dots and the three-square patch.

### Layers, light and weather

- **Layers:** water reach, pasture quality, recently grazed, arable land, pipe and labels, with the colours and strengths above. The profit layer is listed but not drawn yet: the view carries no figures for each beast.
- **Labels:** the paddock's name and its neutral label chip, then hectares, then "no water" in purple (light and dark) or "water via gate". *(Changed: Claudia, 14 Nov 2026: inside the map red is saved for "can't do this" while drawing; the site's colours, red included, stay as designed outside the map.)* They hang under the paddock's top fence. Where the two lines do not fit, the paddock's name in full and a dot in the label's colour ("Paddock 1", never "P1" or a bare number: REQUIREMENTS). A paddock under 96 pixels wide on screen gets no label, and a tap still opens it. Big paddock names are not set in capitals. The planting's name sits on the crop. **(builder: placement and the short form)**
- **Time of day:** one tint over the whole map. Warm and low at first light, white through the day, warm before last light, dark blue outside those hours. **Weather:** clear, overcast (dimmer) and rain (dimmer again, with falling streaks). The daytime tints are kept bright enough for the cattle contrast figure to hold. **(builder: the tint colours)**
- **Reduce motion:** nothing moves. Rain is drawn still, and the change of detail is made at once.
- **Themes:** the country keeps its natural colours in both. Only the surround, the labels and the markers change.
- **The surround (round the farm):** bush country, so the farm never floats in an empty field. Dark: the mockup's bush, `#55653a` with clumps of `#4a5832`, `#66753f` and `#5d6b3a` (the mockup's map code, the `bush` tile). Light: a lighter sage bush, `#939f72` with `#87936a`, `#a2ad80` and `#8d9a6c`, greyer than any paddock so it never reads as pasture. It is one 64 pixel tile, repeated under the farm and moved with it. Zoomed out it keeps its screen size; zoomed in past about 11 pixels a square it grows with the farm. It takes the same time-of-day tint as the farm. The farm's dark rim still marks the boundary. Nothing on it can be tapped, and it carries no game figure. *(Changed: milestone 8, from the mockup. This replaces the builder's earlier near-black (dark) and beige (light) surround.)* **(builder: the light theme colours and the zoom at which it starts to grow)**

### The moving day (Fast Farm, m9, 19 Nov 2026)

Claudia: "the day could just slowly move as you're playing and you see a sunset and sunrise happen across time". On a Fast Farm the map's light follows a clock for the screen (`lib/game/dayclock.ts`, `components/play/DayClock.tsx`), not the farm's clock:

- **One day on screen:** 16 s at 1× (`DAY_SECONDS`). First light to last light takes 12 s (`LIGHT_SECONDS`): warm at first light, white through the day, warm before last light (the same `lightTint` as before). Then 4 s of night: dusk to an hour past last light, dark, and the dawn to the next first light. 2× and 4× halve and quarter it.
- **The swap is not seen:** the next day is asked for in the middle of the night, when the map is dark. If the answer is slow the map waits in the dark.
- **The sun waits at dusk** (a little after last light, still warm) while a build card, a move, a plan, a job or market card mid-confirm, or any confirm is open, and while the tab is hidden. It stands still when paused, during the first-day tour, and while a summary or the year-end card is in front.
- **The day bar** in the daylight bar's place: the same track, first light to last light, with a small pale sun moving along it and dimmed at night. Its note says what changed overnight (facts), or "Paused", or that the sun waits at dusk.
- **Smooth, no wasted frames:** the light is handed straight to the renderer every frame, outside React. The renderer draws a frame only when the colour of the light really changes (`applyLight` in `packages/render/src/map.ts`), so the white middle of the day draws nothing. The frame loop stops while the sun stands still (paused, held at dusk, waiting for the server).
- **Reduce motion:** the days still pass, but the map stays in plain daylight and the sun on the bar is not drawn.
- **Daily Farm** is unchanged: its map is lit for the farm's own clock, and dims for dusk once no job fits.

### Not done yet in the rebuild's map, or not checked

For Claudia to know before she looks at it. Each is from the spec above.

- Trees. The profit layer. The selected mob and picked animals. (The farmer and the ute are gone: driving was reversed on 14 Nov 2026.)
- Keyboard drawing on the map. The build tools can be picked and confirmed by keyboard, but a fence or a pipe is drawn with a finger or the mouse.
- The "drag to see more" hint on a phone held upright.
- Animation: sheep walking, time-lapse, the hand-over between days. (Cattle walk and graze: see Cattle.)
- Half-built fence lines and pegs (they come with the working day, milestone 1.5).
- The bore's gold ring and pointer are built but have not been seen, because every test farm has a trough on the bore.
- "Then and now" pictures: the picture can be drawn twice, but nothing keeps the "then" figures yet.
- Weather is clear, overcast and rain only.
- Cattle contrast at night (above).
- **Speed on a phone has not been measured.** On the build PC a frame takes well under a millisecond of processor time with 4,409 beasts drawn. That is not a measure of 60 frames a second on a mid-range phone (PRD 14.10).

**For Claudia: the "Short" label colour.** The spec above gives "Short" the colour `#ec6a48`, which is the same colour the screens use for danger. On a small paddock the short label is the name and that red dot. It can read as a warning, which a neutral label should not be. Keep it, or pick another colour?

### Art

- Every sprite is drawn in code for now and registered by name (`cattle.british.cow.normal`, `trough.fixed`, `gate.across.open`, `tuft.leaf.0` and so on). Any one can be swapped for exported art without touching the map code. Grass pieces are drawn in greys and tinted with the colours worked out from the model, so one drawn piece serves every pasture state.

### Side-view pictures

- `drawSward` is kept as described above, drawn from the view's figures for the paddock: 0 to 80 cm frame, cm scale, litter layer, dry stems behind with seed heads past rankness 30, green leaf in front. A paddock that is part crop and part pasture gives two pictures, crop then pasture, each with its area. "Then vs now" is two calls with two views. It is plain canvas and loads without PixiJS.
