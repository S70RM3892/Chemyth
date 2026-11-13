# Chemyth graphics upgrade, revision 2 (SPEC2)

Status: implementation brief. **Supersedes `SPEC.md`.** Date: 2026-11-12; revised 2026-11-13 for the second-round checks (§1.5).
Base: the commit at which every fix branch is merged (§5.0). Paths are relative to the repository root; `gfx/` means the
design workspace in which the critiques and their check scripts were written (not part of the repository; cited as evidence only).

This document plus the code is the whole brief. Implementers read §2–§5, §7, their own package in §6, and §10 (chemistry data).
Code is referred to by symbol or by the Japanese comment heading in `drawNear` (for example `// ---- 装置 ----`), never by line
number: the fix merge moved every line.

Contents: §0 要約 · §1 resolution of the three critiques and of the second-round checks (§1.5) · §2 decisions that change SPEC.md · §3 invariants · §4 budget model ·
§5 Round 1 plan, ownership, seams, interfaces · §6 Round 1 packages (S, L, H, C, M) · §7 Round 1 gates · §8 Round 2 ·
§9 Round 3 · §10 chemistry data (normative, with sources) · §11 sources · §12 open items.

---

## 0. 要約（日本語）

- **方針**：見た目を豪華にする前に、①ひとつの光、②物質の色は事実、③地図の上の情報は光で変えない、の 3 つを守る。
- **地図は北が上のまま**（指令の方角の文と合う）。光は地図の方角を名のらない。紙のスキン（ノート・魔術）は「机の上の紙を、
  部屋の窓から実際の京都の太陽が照らす」（朝は左上、夕方は右上）。工場は北向きの天窓（のこぎり屋根）、研究所は天井の灯り
  なので、光はいつも画面の上から来る。屋外の太陽が北上の地図に逆向きの影を落とすことはない。
- **第 1 ラウンド**（5 人が別々の作業木で並行。1 回の長い作業で終える）
  1. S：つなぎ目（画素は変えない）、情報の層、重いときの段の改良、撮影と測定の道具。
  2. L：ひとつの光（窓の太陽・夜の灯り・暗いテーマの天井灯）、夜はどの画質でも同じ「夜の場」（灯りの色から床の色へ。
     床でも紙と文字のコントラスト 7:1 以上）、HDR とトーン（物質の色は画素単位でそのまま）、光のふりをする演出の撤去
     （L0 として最初に単独で入れ、M の追加分を先に払う）、立体表示の箱の陰影。
  3. H：形どおりの高さ（丸い物は丸い影、接地点でくっきり、灰色の輪なし）。最高の平面表示だけ。
  4. C：化学の表（色・燃焼・温度・気体・分析の試薬・保存法・説明文）を出典つきのデータと検査にする。
  5. M：装置の中の本物の実験（液の濃淡、沈殿・白濁・層、2:1 の泡、青いバーナー、燃焼の炎、温度で光る融解塩、
     分析器の試験管と銀鏡・チンダル、系統分離、捕集）、廃棄口の気体（無色は輪で示す、重い・軽い、白煙、NO→NO₂）。
     光るのは自分で光るものだけ（炎・熱で光る物・化学発光・電灯）。白い湯気・SO₃ の霧には「白いのは水滴・霧」と説明を付ける。
- **検査**：各検査に担当の包みを決め、その包みが入るときから合格を求める（それまでは悪くしないことだけを求める）。
  標準の重さは、ゆれる時間ではなく決まった数（Canvas2D の命令数と塗る面積）で、最初の基準 D0 と累積で比べる。
- **大域照明（2.5D GI）は第 2 ラウンドの最初**。理由：5 人の手がふさがる、重いときに機能を外す仕組み（内側の見張り）が先に要る、
  Android でシェーダーの作り直しが止まる危険、端末で測ってから入れたい。
- **第 2 ラウンド**（並行。見張りを先に入れ、GI はそのあと）：見張りと端末の測定、GI、水の場、気体の場、ファラデーの計器などの学び。
- **第 3 ラウンド**：8 つの見た目の美術（窓の光の形、署名の現象、装置の形、くっきりした地面）。批評で見つかった化学の誤り
  （ナトリウム灯、吸収帯、魔法陣の格子、ルミノールなど）は直してから入れる。

---

## 1. Resolution of every blocking item

Legend: **R1/R2/R3** = the round that implements it. "§x" = where SPEC2 resolves it.

### 1.1 Critique 0 (tablet feasibility)

| Item | Decision | Where |
|---|---|---|
| B1 cost model ignores arithmetic | Adopted. Gamma-2 working space in FINAL (`s*s` in, `sqrt` out; no `pow`/`exp`/`log` in FINAL); glow and bright pass squared once in PRE at 1/3 device resolution into R11F_G11F_B10F; every budget has an instructions/px column; `scripts/gfx/alu.mjs` counts worst-path ALU per FINAL variant, with each look's worst uniform values over the capture times, and is a merge gate (§1.5 #1). A separate low-res "light" target is not needed in R1 (all R1 low-frequency terms are a single tap of `tShade` or ≤ 12 analytic instructions); R2 adds it with GI. | §2 D2, §4, §6.L |
| B2 uber-shader occupancy | Adopted. FINAL is assembled from chunks with `#if` feature bits; R1 compiles at most 4 variants per device; gated code uses `textureLod(…, 0.0)`; per-look values stay uniforms. Shedding (R2) switches variant. | §2 D3, §6.S |
| B3 watchdog and bench cannot work | R1 adds **no** inner value-ranked watchdog and makes no device-bench claims. The outer ladder gets grace periods and compile/chunk-build exclusion. R2-WD builds the inner watchdog with cadence-cap detection, GPU-bound detection by `fenceSync`, equal round-robin slices, synchronous-readPixels bench with warm-up and ABAB order. | §2 D8, §8.2 |
| B4 toroidal grids sized for landscape | Deferred with the fields (R2). Requirements recorded: square grids sized from max(cssW, cssH); minimum z per viewport or gate off; per-slot tag with fallback. | §8.4, §8.5 |
| B5 per-object Canvas2D blur in `castShadow` | Adopted. No `shadowBlur`, no `filter`, per frame, anywhere. One offset fill per object, exactly as many fills as today; softness is alpha only. | §6.L L6 |
| B6 標準 has no slack and no lower rung | Adopted. A 標準 ledger gated cumulatively against D0, on a deterministic Canvas2D count for packages that claim ≤ 0 (§1.5 #2–3); a DPR rung (2 → 1.5 before 高 → 標準, then 1.25 inside 標準) walked only by render-bound frames (§1.5 #7); 60 Hz render cap that keeps animation speed and play time (§1.5 #6). | §4.5, §2 D8, §6.S |
| B7 shader compiles freeze Android | Adopted. Lazy compile per variant; compile all, link, check `LINK_STATUS` only (logs only on failure); poll `COMPLETION_STATUS_KHR` when present; without it, ≤ 1 link per frame on the title screen; render the lower ready variant (or 標準) while a variant compiles; compile frames excluded from the ladder. | §2 D3, §6.S S0.5 |
| B8 precision and NaN untested | Adopted. `max(x, 0.0)` before every `sqrt`; no `pow` in FINAL; integer hash replaces the `sin` hash everywhere in FINAL, including the heat haze and water R1 carries (§1.5 #4); precision policy (highp for positions, uv, world coordinates, time, and `highp int` in every shader that hashes, §1.5 #5); world-origin snapping and CPU phase accumulation for every world-anchored or drifting pattern, from R1 on; `?gfx=selftest` ships in R1. | §2 D2, §6.S S1.6, §8.4 |

### 1.2 Critique 1 (chemistry and learning)

| Item | Decision | Where |
|---|---|---|
| B1 `burn` rule draws flames for non-burning reactions | Adopted. `burn` is an explicit table of five recipe ids; `copper-oxide`, `ostwald-2`, `zinc-roast`, `lead-roast`, `copper-matte`, `copper-converter` get no flame (oxidation colour change, or incandescence by temperature). Unit-tested. | §10.6, §6.C |
| B2 "sodium lamp = the same 589 nm light" | Adopted (fix c + a). R1 draws no sodium lamp. The 589 nm lesson rides on the analyzer's Na flame. R3 masts, if built, are captioned 高圧ナトリウムランプ（圧力で線が広がる）; no "same 589 nm" sentence; a spectroscope never shows two D lines for a high-pressure lamp. | §9, §10.8 |
| B3 `absorbedBand` complementary rule is wrong | Adopted. The function is removed. R3's spectrum strip reads a curated `BANDS` table; a species without a sourced row shows no strip. Cu²⁺'s band lies above 600 nm; Prussian blue and the green Cr³⁺ show no strip until they have sourced rows (unit test, §1.5 #16). | §9, §10.12 |
| B4 coloured matter turned into light | Adopted in R1. Only self-luminous sources add light (§2 D6). `glowOf` is deleted; tank glow removed (P₄ exposed to air excepted, R2); the orange `heat` glow becomes the blue burner plus incandescence only where G(T) > 0; vent orange removed; coloured pops become absorbing puffs. Unit test: no light carries a `LOOKS` hex. | §2 D6, §6.M M12, M14 |
| B5 arcane lattice attached to compounds; fcc drawn like bcc | R3. Lattice chosen from the substance handled; compounds use their own type (NaCl type, zinc blende, fluorite) or none; NaCl type, zinc blende, fluorite, hcp and diamond always as an oblique cube, ionic types in two ion colours (a top-down rock-salt projection equals fcc); lattice name engraved with the coordination number; unit test, normative in §10.12, that no compound maps to a metal lattice (§1.5 #15). | §9.3 |
| B6 上方置換・下方置換 taught by buoyancy alone | Adopted. Plume captions compare at the same temperature; any caption that names 上方/下方置換 states water solubility first; hot exhaust rises first, then follows molar mass. Caption tests enforce the wording. | §6.M M13, §10.14 |
| B7 silver mirror and Tyndall lost their render path | Adopted in R1, Canvas2D, every tier: silver wall gradient with a highlight placed from `LightState.dir`; Tyndall beam from a drawn side lamp in the colloid tube **beside** a true-solution tube without a beam (§1.5 #20). Both in the `chem` scene. | §6.M M9 |
| B8 phenolphthalein pink needs an "indicator added" cue | Adopted. A dropper icon plus the tag フェノールフタレイン whenever an indicator colour is drawn (electrodes, titration). Water electrolysis shows no indicator. | §6.M M7 |
| B9 標準 colourless gases as white wisps | Adopted. Colourless gases are hollow ripple rings in every tier (never a white fill); opaque white only for 白煙 (solid NH₄Cl, P₄O₁₀) and white mist (SO₃ with moist air = H₂SO₄ mist; 湯気 = condensed H₂O), and every white plume's caption says what the white is (§1.5 #10). Tested per tier. | §6.M M13 |
| Erratum 1 HCN class | HCN (27.0) is neutral (\|M − 28.8\| ≤ 2). | §10.3 |
| Erratum 2 wrong citations | Every `PROCESS_T` row re-sourced (checked 2026-11-12); NaCl melting point cited to "Sodium chloride". Rows without a source show no incandescence (lead-roast). | §10.7, §11 |
| Erratum 3 Beilstein | Caption 「ハロゲン（F 以外）を含む」. | §10.1, §10.14 |
| Erratum 4 Hg tube label | 水銀（アルゴン入り）, not 貴ガス (R3 data). | §9.3 |
| Erratum 5 analyzer blues < ΔE00 10 | Hexes kept (textbook words); `cue: 'reagent'` set for all five pairs; the analyzer always draws the reagent name beside the tube. Unit-tested. | §10.11, §6.M M9 |
| Erratum 6 water absorption attribution | R2 water uses Pope & Fry's ratio ≈ 0.45 : 0.075 : 0.012 (R : G : B) or drops the attribution. | §8.4 |
| Erratum 7 allowed words | 橙黄色 and 深赤色 added. | §10.13 |

### 1.3 Critique 2 (integration, legibility, ownership, tests)

| Item | Decision | Where |
|---|---|---|
| B1 south-up contradicts the compass hints | **North-up stays.** No light claims a compass direction: paper looks are a page lit through the viewer's room window; building looks are lit by north-facing roof glazing or ceiling lights. `tests/compass.test.ts` pins the hints to north-up bearings; the two content misses (sulfur 南東 → 北東, farm 南 → 南東) are fixed. | §2 D1, §6.S S1.4 |
| B2 one light still contradicted | Adopted. Top-light convention for baked art (side faces at the bottom only, highlights on top edges, symmetric sheens); all keys in the upper half; FS_BOX faces shaded from `LightState`; dark looks key from straight above; `prefs.dusk` off freezes 14:00; day→night hand-over by elevation weights for sun, window sky and key (§1.5 #25). | §2 D1, §6.L L1–L8 |
| B3 information relit by the new lighting | Adopted. An information layer (`#info` canvas above `#gl`) in 2D GL tiers; membership list fixed and extended (§1.5 #36); 標準 draws night between the world and the information (§1.5 #24); photos include `#info` (§1.5 #30); 3D is an R1 exception (§1.5 #31). Belt tokens stay in the world and pass the legibility gate. | §2 D5, §6.S S1.1, S1.8, §7.3 |
| B4 keep mask too coarse; semantics conflict | Adopted. Only regions painted entirely by matter are marked, recorded undilated and written into the GL mask dilated by 3 CSS px, each bordered by ≥ 1.5 CSS px of ink; plumes and puffs are lit world matter checked by hue (§1.5 #28); one `keep` function in COMPOSE and TONE; 6 CSS px minimum matter feature (smaller matter carries a swatch); tokens are not matter; 3D: fog applies to matter, exactness gated in 2D only; vignette applies to all pixels and is capped. Rim gate added. | §2 D4, §6.M M11, §6.L L4, §7.3 |
| B5 標準 night unreadable and out of order | Adopted. One night field N per light look for every tier (floors keep ink/paper ≥ 7:1; §1.5 #23); matter punched out of a 1/4-res scratch with `destination-out` (no clip, no restamp; §1.5 #8); night drawn after the world and before the information (§1.5 #24); far view uses the same N in 標準; no key shape by day in 標準. | §6.L L7 |
| B6 ownership overlaps, missing seams and stubs | Adopted. `glyph` split (chemistry → `matter.ts`, logistics/UI → `machines.ts`); new seams `groundPass`, `fxOf`, `stepPlume`/`drawPlume`, `captionOf`, `tankFill`/`tankDress`; every cross-package function exists as a stub with today's behaviour in commit S0; `near` = what `draw()` drew this frame (wraps fix/input's `isFar`). 3D keeps square boxes through R2 (silhouettes are 2D). `itemToken` seam and S5 scale argument arrive with their users (R2). | §5.2–§5.5 |
| B7 baked chunk looks applied twice; tier change rebuilds chunks | Adopted as a rule: chunk content is tier-independent. Test: a tier or 3D toggle causes zero chunk builds. | §2 D7, §7.4 |
| B8 rebase on fixes incomplete | Adopted. Preconditions name every branch; per-draw state is inert under `view.still`; `__step` calls `frameBody`; tests count `console.error` and `frameFault`; a throwing GPU module is disabled; paused state, CVD heat ramp and jam patterns preserved and tested; no new saved fields in R1; R3 moves far.ts colours to shared tokens; R2 gas lens defines its own palette. | §5.0, §5.6 |
| B9 water invisible in dark looks | R1 does not change water styles. R2 water must keep shore ≥ 3:1, water/floor ΔE_OK ≥ 0.10, arcane-light chroma ≥ 0.04 at hue 200–260°, in every tier without lamps. | §8.4 |
| B10 features that hurt belts, items, ports | R1: no refraction or heat shimmer on information; motion budget gate for R1's new motion (plumes, bubbles, flames). R3 items (cyanotype, hatching, masts, spectrum strips, 消し残し, luminol, lattice rotation) carry the critique's rules. | §6.M, §7.3, §9.3 |
| B11 tests missing or not runnable | Adopted: `legib` scene and gate; motion and detail budget; night gates at 21:30 (value plans for 21:30 and moon states in R3); determinism fixes (`frameBody`, `clock.install` advanced by the step helper, Google Fonts blocked in captures so fonts are identical, `__step(1, 0)`, count-based builders, `calm` passes t = 0 to decorative animation; §1.5 #32); gate owners (§1.5 #22); attribution by `?gfx=off:<id>`; absolute matter gate; `__fx.mask()`. | §6.S, §7 |

### 1.4 Suggestions

Adopted (cheap and clearly good): 60 Hz render cap (c0-1); R11F_G11F_B10F bloom and a float-readback `f16` probe (c0-4);
resize debounce (c0-7); 1/4-resolution cached gradient canvases (c0-12); explicit `pixelStorei` for data uploads (c0-13);
settler ammine completeness and Fe³⁺ → Fe²⁺ after H₂S (c1-3); ninhydrin flash (c1-4); Cu catalyst red ⇄ black (c1-5); storage
dressing incl. AgNO₃ and NaOH (c1-6, drawn on the container frame, c2-10); Sr `#a8001e` (c1-8); atomic lines only for any
spectroscope (c1-10); captions against misreadings (c1-15); Mn²⁺ near-clear (c1-16); no molten-S pool under the S flame
(c1-18); ΔH shown with its equation (c1-19); Prussian blue route named (c1-20); look × view matrix (c2-1); colour-space table
(c2-2); neutral dummy textures per contract (c2-3); cache hygiene rule and test (c2-4); contact-sheet tool (c2-14).

Deferred: thermal soak, starting-tier probe, GI always-on budget, floor-device class acceptance, toast batching, UBO for
FINAL uniforms, emit atlas, 3D mipmaps (measure first), fp16 gas floor, point-sprite splats, keep 高 lean (gas 最高-only) →
R2. NO₂ ⇄ N₂O₄ illustration, Faraday meter, cobalt glass, per-element flame gains, gas-lens palette → R2. Emitter hue
separation, luminol framing and hue, iron-gall link, galvanised rule, hub per skin, hi-res chunks, grid path, god-ray window
mask, overlays on silhouettes, 見やすさ優先 preference, `backdrop-filter` constraint → R3. Near↔far crossfade of the
near-only terms → R2 cleanup. Full list with entry criteria in §8–§9.

### 1.5 Second-round checks (2026-11-13)

Independent checkers re-read this spec against the code (fix/gpu `gl.ts`, fix/skins `main.ts`, fix/draw `render.ts`) and the
critiques. "c0/c1/c2" = the critique whose area the item belongs to. Every item is resolved in R1 unless the row says otherwise;
none is deferred.

| # | Item | Decision | Where |
|---|---|---|---|
| 1 | c0 B1 residual: FINAL over its own ALU gate in 高 and 3D at 21:30 (≈ +40 / +58) | Adopted. Dither under `if (uDither > 0.0)` and the night pool under `if (uPool.z > 0.0)`, so the proxy prunes them where they are 0 (dither: all light looks; pool: every look but note-light and arcane-light at night); 3D fog applies to `sRaw` in display space (`mix(sRaw, uFogDisp, fogK)`, `uFogDisp = sqrt(uFogCol)` on the CPU); the proxy uses each look's worst uniform values over the §7.2 capture times. A look still over +30 sheds its grade terms first (L3), never the gate. | §2 D3, §4.3, §6.L L3 |
| 2 | c0 B6a: 標準 ledger not measurable as gated (±3 % noise vs a 1.00× gate; SwiftShader raster; undefined 2D flush) | Adopted. Every perf job runs an A/A pair; a ratio gate `g` passes at `≤ g + max(0.02, 2·\|A/A − 1\|)`. `__fx.c2d()` (in D0) counts Canvas2D calls by type and painted area per frame; a package whose ledger row claims ≤ 0 gates on that count, and its timing ratio is informational. 標準 frames end with `getImageData(0, 0, 1, 1)` on `#cv` in both arms. | §4.3, §4.5, §7.5, §6.S S0.7, S0.8, S1.5 |
| 3 | c0 B6b: ledger netted across packages but gated per merge, payer merging last | Adopted. Commit **L0** (L8's Canvas2D removals: `ambient.ts` sliding light effects, `labAmbient` scan line and beams) merges right after S1, before C and M; every merge after it is gated cumulatively against D0. L0's `labAmbient` removal may land before fix/skins (1b0047f does not touch `skinLab.ts`). | §4.5, §5.0, §5.2, §6.L L8 |
| 4 | c0 B8a: D2 forbids `pow` and the `sin` hash, but the carried haze and WATER use both (and `uTime % 1000`, and `pow(1 − nrm.z, 1.0)` can be NaN) | Adopted, preferred fix. L3a rebuilds `noise()` on integer cells with CPU-split lattice offsets (fp64, world origin snapped to 256 tiles), every drift and `sin` phase from the CPU (no `uTime` in FINAL), repeated squaring for `pow(…, 90)`, `max(1 − nrm.z, 0)`; the hash costs no more than today's in the proxy. D2 holds without exception; the selftest renders the real blocks at (10⁴, 10⁴) and after 10⁵ s. | §2 D2, §6.L L3a, §6.S S1.6 |
| 5 | c0 B8b: ESSL fragment shaders default to `mediump int` (may be 16-bit) | Adopted. Every shader that hashes declares `precision highp int;`; unit test on every assembled source; source cited. | §2 D2, §6.S acceptance, §11.1 |
| 6 | c0 N1: the 60 Hz cap passes the rAF `dt` to rendered frames: animation at half speed, play time at 50 % on 120 Hz | Adopted. `shouldRender` returns `rdt`; drawing, particles, plumes and fireworks integrate `rdt`; simulation, `input.tick`, camera, HUD and `addPlayTime` run on every rAF. Today's idle skip and fix/skins' veiled skip are folded into the same pure function (time-based). Tests at 60/90/120 Hz. Saver-idle time adds no play time (§12 #10). | §2 D8, §5.5, §6.S S1.2 |
| 7 | c0 N2: the ladder counts simulation-bound frames and now stores DPR caps | Adopted. The step loop is timed every frame; a slow frame counts only if `stepMs < 0.3·rdt` and it is outside grace; grace after `visibilitychange`, slot or save load and the first 5 s; `?gfx=slowsim:50` walks no rung and stores no `dprCap`. | §2 D8, §6.S S1.2, §7.4 c |
| 8 | c0 N3: an even-odd (or nonzero) clip puts night back on overlapping matter | Adopted. No clip: copy the 1/4-res N canvas into a 1/4-res scratch, punch matter with `destination-out`, `multiply` ×4; no scratch when no matter is on screen; punch dilation `max(3, 4/dpr + 1)` CSS px; `matterClip()` becomes `matterShapes(ctx, scale, dilate)`; 標準 21:30 rim and overlap test. | §4.5, §5.4 S3, S7, §6.L L7, §6.M M11 |
| 9 | c1: thermite caption would print the display clamp 「約 2000 ℃」; "≈ 3100" was kelvin | Adopted. T 2000 °C drives the colour only; caption temperature 「約 2500 ℃（鉄がとけるほどの高温）」 [WTH]; note corrected to adiabatic ≈ 2860 °C (3135 K); test that no caption prints a display clamp. | §10.7, §10.14, §6.C |
| 10 | c1: white steam and SO₃ fumes fall back to gas captions (teaches that water vapour is white) | Adopted. Captions `steam` and `so3Fume`, ahead of `heavyGas`/`lightGas`; the first ≈ 0.3 tile above a steam source is drawn as rings; H₂O (18.0, light) in §10.3; test: every caption on a white plume other than NH₄Cl or P₄O₁₀ contains 水滴 or 霧. | §10.3, §10.14, §6.M M13, M15 |
| 11 | c1: 'light' pops of colourless products glow in the element tint (SO₂ yellow, NH₃ blue) | Adopted. A 'light' pop or trail uses the skin's neutral `POP_LIGHT` (OKLCh C ≤ 0.03), never `sub(id).color`, a `LOOKS` or a §10 hex; the no-coloured-light test covers `popLook` and trails. | §5.5, §6.C C4, §6.M M14 |
| 12 | c1: 「物質の色は、光や画質で変わらない。」 is false (colour depends on light) | Adopted, in the notice's plain style: 「このゲームでは、物質の色はいつも白い光の下での色（教科書の色）で描く。時刻・光・画質の設定では変えない。」 | §10.14 |
| 13 | c1: burning reactions have no caption; the S flame reads as a heating burner | Adopted. `burn:S`, `burn:CO`, `burn:P4` (P1 `noBurn:Cu`, worded 「炎を出さずに」), the burn slot right after the flame test; S and CO flames drawn on the burning material, never as a cone under the vessel. | §10.14, §6.M M5, M15 |
| 14 | c1: heavy gases sink down the screen forever | Adopted. Downward displacement ≤ 0.3 tile below the vent mouth, then `vy = 0` and the cloud spreads as a pool (radius ×2, life ×1.5); test. | §6.M M13 |
| 15 | c1: a top-down rock-salt projection equals fcc (B5 returns for ionic types) | Adopted. NaCl type, zinc blende, fluorite, hcp and diamond always as the oblique cube, ionic types in two ion colours; the "no compound maps to a metal lattice" test is normative in §10.12. R3 data. | §9.3, §10.12 |
| 16 | c1: the Cr³⁺ bands belong to violet [Cr(H₂O)₆]³⁺, not the game's green Cr³⁺ | Adopted. Row dropped until a sourced band for the green complex exists; hexaaqua bands never attached to `#3f8f5a`; test reworded (Prussian blue holds, so it shows no strip). R3 data. | §10.12, §1.2 |
| 17 | c1: ninhydrin 紫色 (game card) vs 青紫色 (spec) | Adopted. 紫色 everywhere (the game's `org-ninhydrin` card); the swatch gets `cue: 'reagent'` (ΔE00 6.5 from starch, 4.4 from FeCl₃ + phenol). | §10.11, §10.14, §6.M P1, §12 |
| 18 | c1: ΔH shown without states | Adopted. Every species stored with its state and drawn as (気)(液)(固), carbon C(黒鉛), sulfur S(斜方), phosphorus P₄(黄リン); test that every species has one. | §10.9, §6.C C8 |
| 19 | c1: the allowed-word test fails on §10's own data | Adopted. Colour words are extracted with a colour-morpheme expression (qualifiers and non-colour phrases drop out); 淡黄白色 and 淡桃色 added with sources; V₂O₅ 黄〜橙色. | §10.13, §10.5, §6.C acceptance |
| 20 | c1: Tyndall caption implies the colloid emits; no light source | Adopted. Caption 「…コロイド粒子が光を散乱し、光の通り道が輝いて見える…」; the side lamp is drawn and is the light (kind `lamp`); the beam is scene paint, never in the glow layer or R2's emit layer. | §10.14, §6.M M9 |
| 21 | c1: [WBF] 1500–1600 °C is the oxygen blast furnace's combustion zone; low-pressure Na `#ff8b00` vs Na flame `#ffd43a`, both 589 nm | Adopted. Blast furnace 1500 °C re-cited to tapped hot metal 1480–1520 °C [SU]; low-pressure sodium marked "not drawn", no hex. | §10.7, §10.8, §11.2 |
| 22 | c2 1: every gate blocks every merge, but the gates need L, which merges last: S1, C, M, H cannot merge | Adopted. §7.0 gives each gate an owner; it blocks from that merge on; earlier merges must not make its metrics worse than the previous main or D0. §6.M acceptance now reads "b (ΔE00 clause) at M's merge; a and c at L's merge". | §7.0, §6.L, §6.M |
| 23 | c2 2: night: GL floor 0.26 gives 4.4:1, 標準 arcane floor 6.47:1, display-luma ratio unreachable, two night models, raw 2700 K key shifts hues | Adopted. One night field N per light look in display sRGB (lamp → floor at 0.7 × the farthest-corner distance; floors `#b4bccc`, `#c8ccd6`, `#c8ccd6`, `#d2d8e2`); 標準 multiplies by N; GL uses N²/`uExposure` as open-ground light with `vec3 uFloor`; gate e's ratio on linear Y (1.61 / 1.45); `nightFar` 標準 only. | §5.5, §5.7, §6.L L2, L3, L7, §7.3 e |
| 24 | c2 3: S7 runs before trains and particles, so they stay day-bright in 標準 | Adopted. `drawNear` order (S1.8): world (ground … trains, particles and plumes, 'puff' pops) → S7 → information overlays → light glints and 'light' pops; information inside `machine()` precedes S7 and is multiplied within the 7:1 floor (Invariant 3). | §2 D5, §3, §6.S S1.8, §6.M M14 |
| 25 | c2 4: D1 hand-over swings 27–31°/min at dusk and jumps 69° in June | Adopted. `dir = normalize(aS·dirSun + aW·(0, −1) + aK·dirKey)` with the checker's weights and blended `len`, `vis`, `soft`; worst 1.86°/min, `dir.y ≤ −0.44`, D1's four vectors unchanged (`gfx/crit2/spec2fix3.py`). | §2 D1, §5.5, §6.L acceptance |
| 26 | c2 5: tokens are lit world objects, so "ΔE00 ≤ 10 vs 標準 12:00" fails by design | Adopted. Tier agreement at the same time and condition (ΔE00 ≤ 10), hue within 20° of 12:00 open ground (C ≥ 0.05), outline or plate ≥ 3:1. | §7.3 d |
| 27 | c2 6: the rim gate fails every Beer–Lambert liquid | Adopted. Each ring pixel is compared with the 標準 12:00 pixel at the same position (ΔE00 ≤ 3). | §7.3 c |
| 28 | c2 7: puffs are translucent; the full-res dilated clip leaves plate un-multiplied; GL keep halo on swatches | Adopted. Only regions painted entirely by matter are marked (vessel interiors with glass back, swatches, jar fills); plumes, puffs and pops are lit with the world and checked by hue and tier agreement; records are undilated (the GL mask write and the 標準 punch each dilate for their own resolution, reconciling #8); every marked shape has ≥ 1.5 CSS px of ink around it. | §2 D4, §6.M M11, §7.3 b |
| 29 | c2 8: canvas `P.soft` is < 4.5:1 on paper in three light looks; theme.ts frozen | Adopted. Commit **T0** (R1-S, before D0) sets canvas `P.soft` to fix/skins' `--soft`: `#5d6b84` 4.90:1, `#725e45` 4.66:1, `#546471` 4.84:1; §5.0's theme.ts exception names it. | §5.0, §5.1 |
| 30 | c2 9: 画面写真 in 高/最高 loses `#info` | Adopted. `takeShot` composites `#info` after `#gl`, like `__fx.capture()`; `#info` is cleared only on rendered frames; §7.4 e checks photos. | §6.S S1.1, §7.4 e |
| 31 | c2 10: in 3D, information is in the plane textures (fog, blur, night); gate d's 3D crop cannot line up with 2D | Adopted. Invariant 3 holds for 2D views; D5 states the 3D exception for R1; gate d compares 3D 最高 with 3D 高 at the same camera and time; `R.info` follows `use()` in 3D and 標準 from S0. | §2 D5, §3, §6.S S0.2, §7.3 d |
| 32 | c2 11: `calm` does not freeze render.ts's own `t` animation; the never-resumed fake clock stops timers and busy-waits | Adopted. In `calm`, `draw()` passes t = 0 to every decorative animation and state blinks are steady; the step helper advances the fake clock with `page.clock.runFor(dtMs)`; under `?det`, `slow:N` adds N ms to the synthetic frame time. | §3 Inv. 7, §2 D8, §6.S S0.7, S1.9 |
| 33 | c2 12: exhaust from busy machines comes from the `react` branch of `spawn()`, which no seam covers | Adopted. Seam `reactPuff(f, P, tier)` in `plumes.ts`, S0 body = today's dust puffs. | §5.4 S4, §6.M M13 |
| 34 | c2 13: §7.4 g says a look toggle builds no chunk (`onThemeChange` clears the cache) | Adopted. §7.4 g covers tier and 3D toggles only. | §7.4 g |
| 35 | c2 14: carried heat haze moves belts and tokens by up to 2.25 CSS px | Adopted. Capped at 1 CSS px: `d = (noise − 0.5)·m.r·2·uDpr·px`. | §6.L L3a |
| 36 | c2 15: read marks drawn in the world (channel numerals, formula tags, electrode signs, resource-tile marks, 粒子の世界 caption) | Adopted. All added to D5 (drawn through `R.info`). | §2 D5 |
| 37 | c2 16: `__fx.mask()` has no emitter or particle mask (and 標準 has neither keep nor info alpha) | Adopted. `mask()` also returns an emitter mask (glow-layer alpha; 標準: the `fxOf` light discs) and a particle mask (discs recorded by `plumes.ts` under `?det`), in every tier. | §6.S S0.8, §7.3 g |

---
## 2. Decisions that change SPEC.md

### D1. North-up, and a light frame per look
The map stays north-up. Light never claims a compass direction. Each look has a physical light frame that puts the key light in
the upper half of the screen, and is physically correct in its own setting:

| Look | Frame | Day key | Night key (light looks) or key (dark looks) | `dir` toward the light (screen, y down) | Shadow length (tiles per unit height) |
|---|---|---|---|---|---|
| note-light | `window` | Kyoto sun through the viewer's south-facing room window, at the top of the page | desk lamp 2700 K, upper left (on the map: the night field N, white-balanced, §6.L L7) | window mapping / (−0.50, −0.87) | `sunLen` / 0.6 |
| arcane-light | `window` | as note-light, warmed 5 % | candle 1850 K, upper left (on the map: N, §6.L L7) | window mapping / (−0.71, −0.71) | `sunLen` / 0.6 |
| punk-light | `north` | diffuse sky through north-facing sawtooth roof glazing (map north = screen top); no direct sun | 4000 K floodlights overhead | (0, −1) | 0.45 (soft) / 0.25 |
| lab-light | `overhead` | 5000 K ceiling panels; daylight only tints the ambient | panels | (0, −1) | 0.25 |
| note-dark | `overhead` | 黒板灯 above the board | — | (0, −1) | 0.35 |
| punk-dark | `overhead` | overhead work light (R3 may add masts) | — | (0, −1) | 0.25 |
| arcane-dark | `window` | candle, upper left (the moon window is R3) | — | (−0.71, −0.71) | 0.6 |
| lab-dark | `overhead` | instrument light | — | (0, −1) | 0.25 |

- **Window mapping** (paper looks; the page lies on a desk, its top edge toward a south-facing window; a viewer facing the window
  has east on the left): `r = wrap180(A − 180°)`; `rc = clamp(r, −75°, 75°)`; `dir = (sin rc, −cos rc)`;
  `sunLen = 2.5·tanh((1/tan el)/2.5)` for `el > 0`; the sun behind the window wall (`|r|` > 60–110°) gives no direct light
  (weight `aS` below). 2026-11-12: 08:00 (−0.82, −0.58), 12:00 (0.10, −0.99), 15:00 (0.77, −0.64), 16:00 (0.87, −0.49).
  A is the azimuth clockwise from north, el the elevation (NOAA, §6.L L1).
- **Why this is honest**: a page on a desk is lit by the room, whatever the north of the map drawn on it; a factory hall under
  north-facing sawtooth glazing receives only diffuse north light, so its shadows point south (down the screen) in a north-up
  plan; ceiling lights cast short shadows straight down. No look shows outdoor direct sun on the map, so no shadow can contradict
  the compass words in `goals.ts`. The in-game notice and `docs/GRAPHICS.md` say exactly this (text in §10.14 C-notice).
- **Day → night hand-over** (window frames; weights from elevation, never from illuminance ratios, which swing where
  `Esun ≈ 0.01`): `aS = smoothstep(−4°, 8°, el)·(1 − smoothstep(60°, 110°, |r|))` (direct sun through the window),
  `aK = 1 − smoothstep(−8°, 0°, el)` (the night key; light looks), `aW = max(0, 1 − aS − aK)` (diffuse window sky, straight
  down). `dir = normalize(aS·dirSun + aW·(0, −1) + aK·dirKey)`; `len = aS·sunLen(max(el, 0.5°)) + aW·0.35 + aK·0.6`;
  `vis = aS·smoothstep(0°, 5°, el) + aW·0.3 + aK`; `soft = aW + 0.3·aK`. Checked over a year at 1-minute steps
  (`gfx/crit2/spec2fix3.py`): worst change 1.86° per minute (0.032), `dir.y ≤ −0.44`, and the 08:00/12:00/15:00/16:00 vectors
  above unchanged. All three inputs lie in the upper half, so shadows never point two ways and never swing through the lower
  half; on summer afternoons with the sun behind the wall (2027-06-21 from 16:41) shadows fall straight down from the window
  sky, not toward the unlit lamp. Building looks keep `dir = (0, −1)`; their `len`, `vis`, `soft` blend between the table's day
  and night values with `aK`. Night light colour on the map is the night field N (§6.L L7); the Planck key colours of L1 are
  used only for drawn emitters.
- **`prefs.dusk` off**: light looks use the `LightState` of 14:00 on the current date, `night = 0`; dark looks are unaffected.
  All values stay finite (unit test).
- **Top-light convention for baked art**: every light cue baked into Canvas2D art assumes light from straight above the screen:
  side faces and thickness at the bottom only, highlights on top edges, sheens symmetric about the vertical axis. Only cast
  shadows (S1, shape buffer) and the GL bevel follow `dir`; since `dir` is always in the upper half, the bevel never inverts.

### D2. Gamma-2 working space and an ALU-aware cost model
- FINAL works in gamma 2: `sl = s*s` for the scene, `disp = sqrt(max(c, 0.0))` at the end. For every 8-bit value,
  `round(255·sqrt((v/255)²)) = v` exactly in fp32 (checked; unit test). The sRGB-exact pair exists only in JS reference tests.
- PRE squares the glow canvas and the bright pass once, at 1/3 device resolution, multiplied by `uEmitGain`. Bloom, streak and
  lamp-spill textures are therefore already in the working space; FINAL never converts them.
- Bloom format: R11F_G11F_B10F when renderable (probe: complete FBO **and** a float `readPixels` round trip of 1.5); else RGBA16F
  under the same probe; else RGBA8 storing display values with variant bit `B8`, in which FINAL squares each bloom tap (3 mul)
  and `uEmitGain ≤ 1.5`.
- No `pow`, `exp`, `log` or `sin`-hash in any R1 FINAL variant, **including the blocks R1 carries from today's FINAL**: R1-L
  rebuilds the heat haze and WATER on integer-cell noise with CPU-supplied lattice offsets and phases (§6.L L3a). Dither uses an
  integer PCG hash of the pixel coordinate. No `uTime` reaches FINAL: every drift and `sin` phase is accumulated and wrapped on
  the CPU in fp64.
- Precision: positions, `uv`, world coordinates and time are `highp`; colour arithmetic may be `mediump`. **Every shader that
  hashes declares `precision highp int;`** (or `highp uint` on every hash variable): the ESSL fragment language predeclares
  `precision mediump int`, and a mediump integer may be 16-bit, which breaks 32-bit multipliers on drivers that honour it
  (Mali, Adreno). Unit test: every assembled FINAL variant and every hashing program contains the declaration (Khronos GLSL
  `chapters/variables.adoc`, §11.1).

### D3. FINAL variants and compile policy
- `src/ui/gfx/final.ts` assembles FINAL from ordered chunks; each chunk is wrapped in `#if` on feature bits. R1 bits: `T2` (最高
  2D extras: `tShade`, streak), `D3` (3D: tilt-shift, fog; no `tShade`), `B8` (§D2). A device compiles at most four FINAL
  variants: {高, 最高} × {2D, 3D} (B8 only replaces the float path).
- Inside a variant, data-dependent branches use `textureLod(…, 0.0)`. Uniform-gated blocks of today's FINAL that R1 keeps
  (water, heat haze, streak strength) stay uniform-gated, and R1's new per-look terms are uniform-gated too (`if (uPool.z > 0.0)`
  for the night pool, `if (uDither > 0.0)` for dither), so the ALU proxy prunes them in looks where they are 0 (§4.3).
- `src/ui/gfx/glutil.ts` compiles every shader of a program set, then links, then reads `LINK_STATUS` only; compile logs are
  fetched only after a failed link. With `KHR_parallel_shader_compile`, it polls `COMPLETION_STATUS_KHR` once per frame and
  never blocks. Without it, the title screen links at most one program per frame.
- At `createPost()`: PRE, BLUR and FINAL 高-2D compile (the minimum); the other variants and H's SH0/SH1 compile lazily on first
  use, or ahead of use on the title screen for the stored tier. While a needed variant is not ready, the frame uses the next lower
  ready variant (最高 → 高), or the 標準 path if none is ready. Frames that link a program are excluded from the ladder (D8).

### D4. Keep mask (matter exactness)
- **What is matter**: only regions painted entirely by matter — vessel interiors with their glass back, result swatches, jar
  fills. Plumes, puffs and pops are translucent (the floor shows through them), so they are lit with the world; they keep their
  hue and agree between tiers (§7.3 b3) but are never marked.
- `markMatter*` records each shape **undilated** (`matterShapes`, §5.4 S3: probe, gates and the 標準 night punch read the
  record) and writes it into the mask's G channel **dilated by 3 CSS px** (`gfx/crit2/keepdil.py`: 82–99 % of every tested shape
  stays exact at the 1/3 mask scale). Each consumer dilates for its own resolution (the 標準 punch: §6.L L7).
- **Ink border**: every marked shape is bordered by ≥ 1.5 CSS px of ink (the outline's outer half, or a dark plate), swatches
  included, so the GL keep halo (1.0–1.5 CSS px outside the true edge, `gfx/crit2/keephalo.py`) and the 標準 punch ramp fall on
  ink, not on paper.
- One keep function everywhere: `float keep = smoothstep(0.85, 0.98, m.g);` used by COMPOSE and TONE.
- Minimum matter feature: 6 CSS px. Matter thinner than that (test-tube contents, flames, bubbles, the Pt wire flash) carries a
  result **swatch** ≥ 6 px drawn as matter beside it; tests probe the swatch and captions name it.
- Belt tokens are identity glyphs, not matter: never written to keep. They stay in the lit world and pass the legibility gate.
- 3D: `sRaw` is the tilt-blurred, undistorted scene; fog applies to matter (it is a depth cue). Exactness gates run in 2D only.
- Vignette applies to every pixel, matter included (no self-lit interiors); `uVig ≤ 0.12` in light looks, `≤ 0.20` in dark looks.
  Matter gates sample the vignette-free centre (`|c|·1.7 < 0.35`). Dither never touches matter.

### D5. Information layer
- In the 2D GL tiers (高, 最高 flat), information is drawn into a transparent canvas `#info` stacked above `#gl`
  (`pointer-events: none`), with the same backing size and transform as `#cv`, cleared on every rendered frame (never on a
  skipped one). It is allocated only while a 2D GL tier is active (`width = height = 0` otherwise). In 標準 the information layer
  **is** `#cv`, drawn after the night (§6.S S1.8); in 3D it is whatever context the code draws into today (plane textures or
  `three.screen`): `R.info` follows `drawNear`'s `use()` in 3D and 標準 from S0 on. Code addresses it as `R.info`.
- **標準**: the information drawn inside `machine()` (port arrows, name tags, lamps, badges) and the labels drawn in the world pass
  (resource names, edge signposts, resource-tile marks) precede the night and are multiplied by N, which the floors bound at
  ≥ 7:1 ink/paper (§6.L L7); everything else in the list is drawn after it.
- **3D exception (R1)**: only edge signposts and glints reach `three.screen`; plates, name tags, port arrows, lamps and rate labels
  are drawn into the plane textures (`gnd`/`top`) and receive fog, tilt-shift blur and night. Invariant 3 therefore holds for 2D
  views only in R1; gate d compares 3D tiers with each other (§7.3 d). Moving 3D information to `three.screen` is R3-X work.
- Members: port arrows and port item discs, inlet notches, name tags (名札), ！/？ badges and the red dashed outline, the progress
  underline, status lamps, power and pole marks, resource names and edge signposts, stack badges (×n), priority triangles,
  稼働率 colouring and plates, jam lens, flow trace, district labels, rail preview, blueprint and move ghosts (OK/blocked), selected
  ports, same-recipe rings, area rectangle, build2 `over` drawings, reaction plates (with captions), selection marks, belt rate
  labels, the hub meter, `+1` delivery text; sensor and gate channel numerals, tank and separator formula tags (`sepTag`, tank
  labels), electrode −/+ signs, the resource-tile marks shown while an extractor is held, the 粒子の世界 caption.
- Not members: ground, belts, tokens, machine bodies, interiors, particles and plumes, trains and rails, mapfx light effects.
- Rule: a function that draws an information element takes the target from `R.info` and applies its transforms
  (`save/translate/rotate`) to that same context.

### D6. Only self-luminous things emit light
Additive light (the glow layer feeding bloom and lamp spill in R1; the emit layer feeding GI in R2) may come only from:
flames by fuel (§10.2, §10.6); the blue burner (weak); incandescence where `G(T) > 0` (§10.7); chemiluminescence (P₄ exposed
to air, luminol: R2/R3); discharge tubes (R3); electric lamps, status LEDs, sensor channel lamps, train headlights, town and hub
lights (lamp or UI colours, never a matter hex); fireworks and goal effects (airborne). Coloured gases, solutions and
precipitates absorb: they are drawn as matter and never as light. `glowOf` is deleted; `fxOf(e, …)` in `matter.ts` is the only
source of per-machine light and heat shimmer.

### D7. Chunk content is tier-independent
The ground-chunk cache key has no tier. Nothing tier-specific is baked into chunks (R2 water bakes a neutral base; FINAL
modulates it). A tier, 3D or DPR-rung change causes zero chunk rebuilds beyond those the DPR change itself forces (tested).

### D8. Frame safety in Round 1
- No inner watchdog in R1. The registry gives kill switches (`?gfx=off:<id>,…`) and error isolation only.
- The outer ladder in `main.ts` (45 ms for about 70 frames) keeps its order and gains:
  - **attribution**: the step loop is timed on every frame (one `performance.now()` pair, not only under `?perf`). The ladder runs
    once per rendered frame; the frame counts as slow only if `rdt > 45 ms`, `stepMs < 0.3·rdt` (`stepMs` = step-loop time since
    the previous rendered frame) and it is outside grace; a frame failing the attribution test neither adds nor subtracts. A big
    factory at speed ×4 (up to 24 steps per rAF) therefore never walks a rung: lower DPR or tier does not lighten the simulation,
    and a stored `dprCap` 1.25 would blur every 標準 label for nothing;
  - a 2 s grace period after a tier, look, floor or 3D change, a context restore, a resize, `visibilitychange` to visible, a slot
    or save load, and any frame that linked a program or built more than two chunks; and the first 5 s after boot;
  - a DPR rung: 3D off → 最高→高 → **高 at `dprCap` 1.5** → 標準 (keeps 1.5) → **標準 at `dprCap` 1.25**. A rung is skipped when
    `devicePixelRatio` is already at or below the cap. `dprCap` is stored in meta and cleared when the player picks 画質 by hand.
- **Render cap and skips**: one pure function `shouldRender(now, st)` (`gfx/frame.ts`) decides whether this rAF renders and
  returns `rdt = min(0.1 s, now − lastRenderedNow)`. Minimum interval between rendered frames: 14 ms normally (the 60 Hz cap:
  halves GPU work on 90/120 Hz panels, never triggers at 60 Hz), 98 ms while the saver is idle (today's 1 rAF in 6 at 60 Hz),
  248 ms while a sheet veils the map (fix/skins' 1 in 15); a pending photo always renders. `draw()`, particles, plumes, mapfx
  and fireworks integrate `rdt`; the simulation, `input.tick`, the camera ease, the HUD and `addPlayTime` run on every rAF with
  the rAF `dt`, rendered or not (fix/skins already does this for its veiled skip). Play time per wall-clock second is 1.0 while
  the player is active, at any refresh rate; during the saver-idle state it adds nothing (fix/skins adds nothing on idle-skipped
  frames; today's rendered sixth was a side effect of the skip, §12 #10).
- **Debug load**: `?gfx=slow:N` busy-waits N ms in the render path; `?gfx=slowsim:N` busy-waits N ms inside the step loop (it
  counts in `stepMs`). Under `?det` neither busy-waits: both add N ms to the synthetic frame time, and `slowsim` also to the
  synthetic `stepMs`.
- Resizes are debounced by 200 ms; GL targets are reallocated once per settled size (under `?det` the step helper advances the
  fake clock, so the debounce fires, §6.S S0.7).

### D9. Global illumination is the first package of Round 2, not Round 1
Reasons: (1) five engineers are fully used by the R1 packages; (2) GI is the feature that most needs safe shedding, and shedding
needs R2-WD's watchdog (critique 0 B3); (3) it adds about 15 programs, which is the Android compile risk of critique 0 B7, and
it must be lazily compiled behind its own variant bit; (4) its two inputs, self-luminous emitters (`fxOf`, D6) and the shape
texture `tShape` (R1-H), both land in R1, so R2-GI starts from clean inputs and a measured R1 baseline; (5) for this player
(after school and evening) GI would run in almost every session, so its cost must be measured on a device first.

---

## 3. Invariants (every package, every review)

1. **Matter is fact.** A colour drawn as matter is the §10 colour in every skin, theme, tier and hour, exact in the 2D
   vignette-free centre for every region painted entirely by matter (D4). Translucent matter in the open (plumes, puffs, pops)
   is lit with the world and keeps its §10 hue in every tier. Skins restyle frames, glass, metal, paper, ink and light, never
   matter. Identity colours
   (`sub(id).color`) stay on glyphs, port arrows, tokens and far-map strokes.
2. **One light.** Every layer that implies a light direction or colour reads `LightState` (§5.5). Baked art follows the
   top-light convention (D1).
3. **Information is never relit** (D5), in 2D views: no shadow, light, bloom, tone, gas or distortion reaches the information
   layer. In 標準 the information drawn inside `machine()` (port arrows, name tags, lamps, badges) and the world-pass labels come
   before the night (S7) and are multiplied by N, within the 7:1 floor; every other information element is drawn after S7. 3D
   keeps today's routing in R1 (D5 exception).
4. **Only self-luminous things emit** (D6).
5. **標準 stays cheap.** On the three standard views the 標準 ledger is ≤ 0 net; on the busiest chemistry view it is ≤ +0.6 ms,
   paid by named removals (§4.5).
6. **Tiers add light, depth and motion, never facts.** Every chemistry fact, caption and cue is visible in 標準.
7. **Motion safety.** Nothing repeats faster than 3 Hz; no full-field flash; `calm` freezes ambient motion at its t = 0 pose,
   passes t = 0 to every decorative animation in `draw()` (jam-lamp blink, punk ！ blink, flow-trace pulse, selection ring,
   resource-tile marks, glow pulses), makes state blinks steady (fix/draw's shape cues remain), and stops plumes and bubbles
   from moving (colours stay).
8. **Colour is never the only cue.** Pairs that can meet in one context have ΔE00 ≥ 10 under normal vision **and** under protan
   and deutan simulation, or carry a second cue (element symbol, reagent label, shape).
9. **Platform.** WebGL2 or 標準; no new dependency, no download, one HTML file. Every GPU object is created inside `createPost()`
   (so the F41 restore rebuilds it) and freed by `sleep()`/`drop3d()` (F36). Every new cache follows §5.6 rule 2.
10. **Determinism.** Random choices use `Math.random` (seeded in `?det`) or a world hash; animation reads the frame time and the
    render interval `rdt` passed in; time-budgeted builders are count-based in `?det`; the fake clock advances with `__step`.
11. **Geography.** North-up and the map are untouched; no picture or text ties light to a compass direction.
12. **Every new on-map sentence** comes from the captions table (§10.14) and has a source.

---

## 4. Budget model

### 4.1 Reference devices
- iPad (10th gen), A14: 2360×1640 device px at DPR 2 (1180×820 CSS), 3.87 M px. Stands for 9th gen too.
- Galaxy Tab A9+, Adreno 619: 1920×1200 at DPR 1.5 (1280×800 CSS), 2.30 M px. Stands for Mali-G72/G57 tablets.
- Floor class (A10/A12 iPads, Mali-G52 tablets): expected to live in 標準 or 高; R2 sets their acceptance target.

### 4.2 Conversion (planning numbers; R2-WD replaces them with device measurements)
Throughput: A14 ≈ 0.6 G ALU instructions/ms and ≈ 25 M bilinear RGBA8 fetches/ms; Adreno 619 ≈ 0.2 G instructions/ms and
≈ 10 M fetches/ms. Fetch weights: RGBA8 = 1, R11F_G11F_B10F or RGBA16F = 2, fractional-LOD trilinear = ×2. A render pass costs
≈ 0.05 ms fixed (tile load/store) whatever its size; count passes.

| Resolution | px (iPad / Tab) | 1 instr/px costs (ms, iPad / Tab) | 1 fetch/px costs (ms, iPad / Tab) |
|---|---|---|---|
| device (FINAL) | 3.87 M / 2.30 M | 0.0065 / 0.0115 | 0.155 / 0.23 |
| 1/3 device (bloom a1, PRE) | 0.43 M / 0.26 M | 0.0007 / 0.0013 | 0.017 / 0.026 |
| 1/2 CSS (`tShape`) | 0.24 M / 0.26 M | 0.0004 / 0.0013 | 0.0097 / 0.026 |
| 1/3 CSS (glow, mask, `tShade`) | 0.11 M / 0.11 M | 0.0002 / 0.0006 | 0.0043 / 0.011 |

Example: +30 instructions/px in FINAL ≈ +0.19 ms on the iPad and +0.35 ms on the Tab.
The survey's "46 M fetches" and gi.md's "85 M" for today's FINAL disagree; R1 uses neither. R1 gates use ratios measured on
the same machine (§4.3), and absolute milliseconds stay estimates until R2-WD measures devices.

### 4.3 How R1 measures
1. **ALU proxy** `scripts/gfx/alu.mjs` (R1-S): preprocesses each FINAL variant with its `#define`s and the per-look uniform
   values (blocks under `if (uX > 0.0)` with uX = 0 are pruned), then counts the worst path through `main()`: both sides of every
   remaining branch, loops unrolled. The uniform values are **each look's worst over the §7.2 capture times**, not one time: a
   block is pruned only if its gate is 0 at every capture time (the night pool and floor count at 21:30; dither counts in the
   looks that have it). Weights per scalar component: add, mul, mad, min, max, abs, floor, fract, step, compare, and integer
   `*`, `+`, `^`, `>>`, `&`, conversions = 1;
   `clamp` 2; `mix` 3; `smoothstep` 4; `dot` n; `length` n + 2; `normalize` 2n + 3; `sqrt`, `inversesqrt`, division 2;
   `exp2`, `log2` 4; `pow` 9; `sin`, `cos` 4. Texture calls are counted separately as fetches with the weights of §4.2.
   Output: instructions/px and fetches/px per variant and look; baseline = today's FS_FINAL with the same pruning.
2. **SwiftShader ratios** `scripts/gfx/bench-sync.mjs` (R1-S): headless Chromium, `?det`. Every frame ends with a flush, the
   same way in both arms: GL tiers a 1-px `readPixels` on `#gl`; 標準 `getImageData(0, 0, 1, 1)` on `#cv`. The synchronous frame
   time is used; A/B variants interleaved ABAB; 3 runs; the gate uses the minimum of the medians. Every job also runs an **A/A
   pair** (the reference build against itself, same order and length), and a ratio gate `g` passes at
   **`≤ g + max(0.02, 2·|A/A − 1|)`**, so a merge that does not touch a path is not failed by noise alone (±3 % against a 1.00×
   gate failed such a merge about half the time). Ratios only.
   SwiftShader rasterises Canvas2D on the CPU, unlike a tablet, so 標準 timing is informational wherever (3) applies.
3. **Canvas2D count** `__fx.c2d()` (R1-S, part of D0): under `?det`, a wrapper around `CanvasRenderingContext2D.prototype`
   counts, per frame and per canvas: calls by type (`fill`, `stroke`, `fillRect`, `strokeRect`, `drawImage`, `fillText`,
   `strokeText`, gradient and pattern creation, `clip`, `getImageData`, composite-operation and filter changes); the destination
   area of `fillRect` and `drawImage`; the bounding-box area of path fills and strokes. Summed over a fixed 60-frame run of each
   view, it is deterministic (same seed, same steps). The wrapper is installed only in count runs, never in timing runs.
4. **Device check** (manual, end of R1, with the player): `?perf` overlay on one iPad and one Android tablet, 最高 near view at
   21:30 in all 8 looks. Informational in R1; it is an entry criterion of R2.

### 4.4 Round 1 budgets (iPad 10 / Tab A9+)

| Package | 標準 CPU | FINAL ALU (instr/px, worst path, vs baseline variant) | FINAL fetches | Side passes | GPU estimate | Memory |
|---|---|---|---|---|---|---|
| R1-S | 0 | 0 | 0 | 0 | browser compositor blends `#info`: ≈ +0.1 ms (estimate) | `#info` canvas +15.5 MB / +9.2 MB, 2D GL tiers only |
| R1-L | ≤ 0 net (ledger) | ≤ +30 in non-lab looks; lab looks ≤ −40 (reflection loop deleted) | lab: −23 on floor px; others 0 | PRE +6 instr at 1/3 device (+0.004 / +0.008 ms); god-ray pass deleted (−1 pass) | ≤ +0.2 / +0.35 ms; lab-dark ≤ −1.0 / −1.5 ms | bloom R11F = RGBA8 bytes (0 MB); RGBA16F fallback +4.5 MB |
| R1-H | ≤ 0 (height-layer fills removed in 最高) | 0 (same `tShade` contract) | 0 | SH0 at 1/2 CSS ≈ 20 instr × overdraw 1.5; SH1 at 1/3 CSS: 28 fetches + ≈ 140 instr; replaces SHADE + 2 blurs | SH1 ≈ 0.15 / 0.4 ms, net vs today ≤ +0.05 / +0.1 ms | +0.7 MB net (`tShape` with guard band ≈ 1.6 MB, `tShade` 0.4 MB, minus old height, shade and blur targets) |
| R1-C | 0 | 0 | 0 | 0 | 0 | tables ≤ 40 KB of source |
| R1-M | ≤ +0.3 ms typical, ≤ +0.6 ms worst (chem view) | 0 | 0 | 0 | 0 | interior and sprite caches ≤ 4 MB, LRU, counted |

Build size growth for all of R1 ≤ +120 KB.

### 4.5 標準 ledger (R1)
Each package lists its 標準 additions and removals with the `?perf=sync` median (R1-S provides it) and the `__fx.c2d()` count
(§4.3) on four views: note-light z 12 at 21:30 (night active), punk-dark near (z 44), lab-dark big save — the **three standard
views** — and the `chem` scene.

**Gating (cumulative against D0, never against the previous main**, so no package is charged for the merge order; the payer L0
merges right after S1, before M, §5.2):
- a package whose row claims ≤ 0 (S1, L0, C, H, L): on the three standard views, `__fx.c2d()` of the merged tree ≤ the
  reference in total calls and in total painted area (per-type counts are reported, not gated, because a package may replace
  one call type by another); the reference is D0's count, plus the c2d delta accepted at M's
  merge once M has merged. Its timing ratio is recorded and informational;
- M (claims +): cumulative timing ratio of the merged tree against D0 ≤ 1.00 + a on the three standard views (L0's removals pay
  for M's additions) and ≤ 1.05 + a on `chem`, with `a = max(0.02, 2·|A/A − 1|)` (§4.3);
- the final tree: the same cumulative timing gates on all four views.

| Change | Package | Sign | Expected |
|---|---|---|---|
| Sliding light effects: punk-light 4 cloud blobs, 3 soft-light blobs and 4 sweeping bands; punk-dark rotating red wedges and 5 smoke blobs; note-light drifting trapezoid; arcane-dark rotating moonbeam band; lab scan line and two screen-anchored beams | **L0** | − | 0.3–1.0 ms (gradient fills) |
| Vessel interiors, analyzer tubes, settler, collector (cached images, redrawn at ≤ 15 Hz in 標準, blitted between) | M | + | ≤ 0.3 ms typical |
| Plume particles (≤ 60) and rings | M | + | ≤ 0.1 ms |
| Night: the 1/4-res cached N canvas; per frame, when matter is on screen, a 1/4-res scratch copy, matter punched with `destination-out`, one `drawImage` `multiply` ×4 (scratch skipped without matter) | L | + | ≤ 0.1 ms (same as a clip: 18.0 vs 18.5 ms per 30 frames with 80 shapes, readback included, `gfx/crit0/evenodd.cjs`) |
| Night: today's full-screen `fillRect` and one `createRadialGradient` pool per busy machine; today's dark-look dusk wash | L | − | 0.1–0.5 ms |
| `castShadow`: same number of fills as today | L | 0 | 0 |

---
## 5. Round 1 plan

### 5.0 Preconditions
- Merged into the main branch and green (`npm run typecheck`, `npm test`, `npm run build`, the browser regressions): fix/save,
  fix/learnA, fix/move, fix/robust, fix/engine, fix/learnB, fix/gpu, fix/layout, fix/draw, fix/input. The WIP branches
  fix/draw-wip and fix/input-wip are not merged as such; `isFar(cv, cam)` comes from fix/input's finished commit.
- fix/skins and fix/sheets: merge when finished. R1 may start without them. Until fix/skins is merged, R1-L does not touch
  `skinLab.ts` (its skinLab work is its last task) **except L0's removal of the `labAmbient` scan line and beams** (fix/skins
  1b0047f touches `main.ts`, `style.css`, `build2.ts` and `prefs.ts`, not `skinLab.ts`, so L0 cannot conflict with it), and no R1
  package edits `style.css` or `theme.ts` except R1-S's one `#info` rule and commit **T0** below.
  If fix/skins is still open when S0 starts, S0 leaves `skinLab.ts` untouched; R1-S adds its information routing (S0.2) and the
  S1 call in `shellOf` right after fix/skins merges, before L's skinLab work.
- Golden baseline (R1-S, first hour): R1-S first lands commit **T0** on the base — canvas `P.soft` in `theme.ts` set to fix/skins'
  `--soft` values: note-light `#5d6b84` (4.90:1 on its paper; today `#63718a` 4.49:1), arcane-light `#725e45` (4.66:1; today
  4.01:1), lab-light `#546471` (4.84:1; today 4.44:1), so resource subtitles, second plate lines and captions meet gate d's 4.5:1
  at baseline (`gfx/crit2/spec2v8.py`). Then commit **D0** — only `?det`, `__step`, `__fx.capture()` and `__fx.c2d()` (S0.7,
  S0.8 capture and count parts), which change no pixel — and captures from D0 the §7.2 matrix, the ALU proxy table (§4.3), the
  `__fx.c2d()` counts and the SwiftShader ratios (with their A/A pairs). Everything after D0 is compared with these captures.

### 5.1 Packages

| Key | Title | Owned files (R1, after S0) | Summary |
|---|---|---|---|
| **R1-S** | Seams, frame safety and test harness | `src/main.ts`, `src/ui/render.ts`, new `src/ui/rctx.ts`, `src/ui/ground.ts`; new `src/ui/gfx/{registry,index,caps,glutil,final,units,fxapi,det,frame,selftest}.ts`; `src/dev/{scenes,scene-legib}.ts`; `scripts/gfx/{shots,capture,alu,bench-sync,contact}.mjs`; `tests/gfx-seams.test.ts`, `tests/compass.test.ts`, `tests/gfx-frame.test.ts`; `src/content/goals.ts` (two words); one `#info` rule in `src/ui/style.css`; `src/ui/theme.ts` (commit T0 only) | Commits T0 (canvas `P.soft`) and D0 (`?det`, capture, count), then S0 moves code out of render.ts and adds every seam and stub with today's behaviour (pixel-identical). Then: information layer, `drawNear` order (world → night → information), `calm` at t = 0, ladder fixes (attribution, grace, DPR rung, 60 Hz cap with `rdt`, resize debounce), deterministic capture, `__fx` API, harness (matrix runner, capture, ALU proxy, sync bench, contact sheets, `legib` scene, selftest), compass test. Acts as integrator. |
| **R1-L** | One light, HDR and tone | `src/ui/gl.ts`; `src/ui/gfx/{light,sky,skytab,tonemath,post-looks,final.glsl}.ts`; `src/ui/machines.ts` (baked light cues and S1 calls only); `src/ui/skinLab.ts` (shell light cues, lab ambient removals, glare); `src/ui/ambient.ts`; `src/ui/far.ts` (the night call only); `tests/gfx-sky.test.ts`, `tests/gfx-tone.test.ts`; `src/dev/{scene-night,scene-sprites}.ts` | First, alone: **L0** (the Canvas2D removals of L8). Then `LightState` with per-look light frames (D1); gamma-2 FINAL, HDR bloom in R11F_G11F_B10F, exposure, neutral shoulder, exact matter passthrough; carried haze and water on integer noise; night = one field N with a floor in every tier (GL and 標準); removal of the GL effects that pretend to be light; top-light baked art; 3D boxes lit from `LightState`. |
| **R1-H** | Shape buffer | `src/ui/gfx/{shapes,shapes.glsl,sdf}.ts`; `tests/gfx-shapes.test.ts`; `src/dev/scene-shapes.ts` | Analytic silhouettes from today's art (round where the art is round), rasterised on the GPU with a guard band; contact-hardening shadows along `LightState.dir`, horizon AO without grey rings, bevel. 最高 2D only. Replaces FS_SHADE, its blurs and the Canvas2D height layer. |
| **R1-C** | Chemistry data and captions | `src/content/{looks,thermo,spectra,captions,colorsci}.ts`; `src/ui/subcard.ts`; `src/dev/metrics.ts`; `tests/{matter-data,chem-captions,colorsci}.test.ts` | §10 as code: appearance fields, burn table, process temperatures, blackbody, plume table, analyzer table, storage, ΔH, flame set, distinctness and CVD cues, allowed words, captions with sources; colour science and screenshot metric functions. |
| **R1-M** | Matter that teaches | `src/ui/{matter,keep,plumes,vessel,analyzer}.ts`; `src/ui/mapfx.ts` (pop/trail blending only); `tests/{matter,plumes}.test.ts`; `src/dev/scene-chem.ts` | Vessel interiors (Beer–Lambert, precipitate/turbidity/colloid, layers, 2:1 bubbles, burner, burn flames, incandescence), electrodes with indicator cue, settler, analyzer tubes incl. silver mirror and Tyndall, collector; keep marks for regions painted entirely by matter and `matterShapes`; self-luminous lights only; plumes with rings, buoyancy, NH₄Cl and NO → NO₂; absorbing pops; captions on the reaction plate. Every tier. |

### 5.2 Phases (one long session, five worktrees)
1. **Phase 0 — commit S0 (R1-S alone, target ≤ 2 h).** Moves, stubs, seam call sites, FINAL split and assembler, registry,
   `glutil`, `?det`, `__fx` skeleton. Gate: §6.S S0 acceptance (pixel-identical). Meanwhile the other four write only their
   **private new files** (below) and unit tests against the frozen interfaces of §5.5; they edit no existing file.
2. **Phase A — parallel.** Everyone rebases on S0 and works only in owned files (§5.3). R1-S builds the harness first (the other
   gates need it), then the ladder and the information layer.
3. **Phase B — integration.** Merge order: **S1** (harness, ladder, info layer, draw order) → **L0** → **C** → **M** → **H** →
   **L**. Each merge: rebase on main, run §7 on the merged tree with the gate owners of §7.0 and the cumulative ledger of §4.5,
   the integrator merges. L0 is R1-L's first commit after S0: only L8's Canvas2D removals (the `ambient.ts` sliding light effects,
   the `labAmbient` scan line and beams). It needs nothing from M, and it merges before M so that its savings are on main when
   M's additions are gated against D0. L merges last because its matter, night and legibility gates need M's keep and shapes
   and S's information layer. H may swap with M. A package that misses its gates by the end of the session does not merge; the
   seams keep today's behaviour, so the others are unaffected (if L0 has merged and L has not, the removals stand on their own:
   they are removals of decoration only).

Private new files (may be created before S0 lands): L `src/ui/gfx/{sky,skytab,tonemath}.ts` and its tests; H
`src/ui/gfx/{shapes.glsl,sdf}.ts` and its test; C `src/content/{spectra,captions,colorsci}.ts`, `src/dev/metrics.ts` and its
tests; M `src/ui/{vessel,analyzer}.ts`, `src/ui/plumephys.ts` and its tests. Every other new file in §5.1 is created by S0 as a
stub and is not created by its owner before S0 lands.

### 5.3 Ownership and contact points
- One owner per file (table §5.1). Others call exported functions only.
- `src/ui/gfx/index.ts` and `src/dev/scenes.ts` are append-only (one import or one line per package); the integrator resolves
  these trivial conflicts.
- `machines.ts` after S0 belongs to L, but M's interior code enters it only through `matterGlyph`, `tankFill`, `tankDress`
  (S14, S17), which S0 already calls. H reads the exported silhouette constants (`CARD`, `PUNK_BODY`, `LAB_SHELL`, `TANK_BODY`)
  that S0 hoists out of the drawing code; L must keep them true if it changes geometry (it should not in R1).
- `gl.ts` belongs to L. H plugs in through `GpuModule` and unit claims; S0 adds the claim check in `composite`.
- Legacy height path: S0 keeps it. Once H has merged, R1-S deletes the Canvas2D height layer in `main.ts`/`render.ts` and R1-L
  deletes FS_SHADE and its blurs in `gl.ts`.

### 5.4 Seams (S0 introduces each with today's behaviour; the owner changes only the body)

| Id | Signature | File (owner) | Called from | S0 behaviour |
|---|---|---|---|---|
| S1 | `castShadow(ctx, kind: ShadowKind, h: number, z: number, path: (dx: number, dy: number) => void, legacy: { dx: number; dy: number; fill: string })` | `gfx/light.ts` (L) | every baked shadow: belts and pipes (`// ---- ベルト`), rails and trains (`// ---- 貨物線`), hub, card shadows in `machine()`, `machinePunk()`, lab `shellOf` | fills `path(legacy.dx, legacy.dy)` with `legacy.fill` |
| S2 | `fxOf(e, P, t, mcx, mcy, z): { lights: Light[]; heat: Heat[] }` | `matter.ts` (M) | the `// 動いている装置は光をこぼす` block; render.ts calls `glow()`/`heat()` per entry | today's glow and heat calls |
| S3 | `beginMatterFrame(M, still)`, `markMatter(x, y, r, id?, hex?)`, `markMatterRect(x, y, w, h, id?, hex?)`, `matterShapes(ctx, scale, dilate): number` (fills every recorded shape, grown by `dilate` CSS px, into `ctx` at `scale` as one path and one nonzero `fill` with every subpath wound the same way, which is their union; returns the count), `matterProbe()` | `keep.ts` (M) | start of `draw()`; the `rgb(0,255,0)` keep write; L7's night punch | today's `M.arc` of radius `z·sz·0.4`; `matterShapes` draws nothing and returns 0 |
| S4 | `ventPuff(f, P, tier)`, `reactPuff(f, P, tier)`, `stepPlume(p, dt): boolean`, `drawPlume(ctx, p, sx, sy, z, P)`, `plumeReact(list, frame)` | `plumes.ts` (M) | `spawn()` vent branch (`ventPuff`) and `react` branch (`reactPuff`); the particle loop (`// ---- 粒子 ----`) for `p.kind === 'plume'` | today's smoke particle; today's 4–9 `P.soft` dust puffs per completion |
| S6 | `ambientLayer(phase: 'under' \| 'over', ctx, G, P, cw, ch, t, dt, hub, z)` | `ambient.ts` (L) | today's ambient call lines (`'over'`); new call right after `groundPass` (`'under'`) | the four calls; `'under'` no-op |
| S7 | `nightCanvas(ctx, f, punch)` (`punch` = S3's `matterShapes`), `nightFar(ctx, f)` | `gfx/light.ts` (L) | S0: the `// ---- 夕暮れ（実際の時刻）` block; from S1.8: the boundary between the world pass and the information overlays of `drawNear`; far.ts `drawFar` dusk fill (標準 only: fix/draw's `!G` guard stays) | today's wash and pools; far's fill |
| S8 | `postParamsFor(look, f, d3): PostParams` | `gfx/light.ts` (L) | main.ts, replacing `duskPost` and `sunNow` | `duskPost` exactly |
| S9 | `shapeOf(e, P, out: ShapeList)`, `paintHeight(HT, list)` | `gfx/shapes.ts` (H) | the 高さの層 loop | today's rects |
| S10 | `popLook(id): { rgb: string; mode: 'light' \| 'puff' }` | `looks.ts` (C) | mapfx.ts pop and trail colour sites | `{ rgb: hexRgb(sub(id).color), mode: 'light' }` (today's tint; from M14 a 'light' pop ignores `rgb` and uses the skin's neutral `POP_LIGHT`) |
| S12 | `processOf(recipeId): ProcessKind` | `thermo.ts` (C) | shapes.ts, machines.ts | `'vessel'` |
| S13 | `R.near` (what `draw()` drew this frame; wraps `farBegin`/`isFar`) | `rctx.ts` (S) | registry, shape module | — |
| S14 | `matterGlyph(ctx, P, e, cx, cy, u, t, line): boolean` | `matter.ts` (M) | `glyph()` in machines.ts, for chemistry kinds | moved chemistry cases |
| S15 | `captionOf(e, P): string \| null` | `matter.ts` (M) | reaction plate (`// ---- 反応式の札`), second line | `null` |
| S16 | `groundPass(ctx, P, view, cam, cw, ch, z)` | `ground.ts` (S) | drawNear ground blit | blit loop and F35 bookkeeping exactly as merged |
| S17 | `tankFill(ctx, P, e, x0, y0, wd, hh, t)`, `tankDress(ctx, P, e, x0, y0, wd, hh)` | `matter.ts` (M) | the tank case in machines.ts | moved fill; dress no-op |
| S18 | `R.info: CanvasRenderingContext2D` | `rctx.ts` (S) | every information draw (D5) | `R.info` = the context `drawNear`'s `use()` selected (標準 `ctx`; 3D the current plane texture or `three.screen`) |

S0's moves (pixel-identical): `render.ts` → `rctx.ts` (helpers `hash`, `rr`, `chamfer`, `lum`, `cyc`, `hexRgb`, `mod`, `rngOf`;
one exported mutable object `R = { calm, cvd, SIG, fontHand, fontSmall, info, near, shapes, still }`; `particles`, `born`, the
`Particle` type with optional `kind`, `sid`, `T0` fields); `ground.ts` (chunk build and cache with F35 exactly as merged,
`groundDetail`, `sigil`, `buildChunkPunk`, `punkDetail`, `waterAt`/`waterMemo`, `groundPass`); `ambient.ts` (`ambientNote`,
`ambientArcane`, `ambient`, the arcane mote and vignette block; L0 then deletes their sliding light effects); `machines.ts` (`machine`, `machinePunk`, `hub`, `powerMark`,
`poleMarks`, and the logistics and UI cases of `glyph`: splitter, sensor, gate, lift, station, depot, sampler, extractor, the
vent body, the tank frame); `matter.ts` (`reactionGlyph`, the reactor, electrolyzer, separator, battery, settler, collector,
analyzer, funnel and phoresis cases, `smokeTint`, `sepTag`, `hasSubLook`, flame and bubble helpers, `sceneImage` and its cache,
the tank fill); `plumes.ts` (vent smoke spawn, the `react` dust puffs, update, draw); `keep.ts` (the keep write).

### 5.5 Frozen interfaces (S0 ships these types; changing one needs the integrator)

```ts
// src/ui/gfx/registry.ts (S)
export type Tier = 0 | 1 | 2;                                    // 標準, 高, 最高
export type LookKey = 'note-light' | 'note-dark' | 'punk-light' | 'punk-dark' | 'arcane-light' | 'arcane-dark' | 'lab-light' | 'lab-dark';
export interface FxFrameCtx {
  tier: Tier; three: boolean; near: boolean; look: LookKey; dark: boolean; still: boolean; calm: boolean;
  cam: Camera; cw: number; ch: number; dpr: number; floor: number; now: number;
  dt: number;                                                      // rdt: seconds since the previous rendered frame (D8), ≤ 0.1
  frame: number;
  hub: { x: number; y: number }; light: LightState; shapeOn: boolean;   // shapeOn: R1-H produced tShade this frame
}
export interface GpuInputs { scene: WebGLTexture; glow: WebGLTexture; mask: WebGLTexture; W: number; H: number; mw: number; mh: number;
  shapes: Float32Array; shapeCount: number; water: Float32Array; waterCount: number }   // filled by render.ts through S9
export interface GpuModule {
  claims: number[]; bits: number;                                 // FINAL units it binds; FINAL variant bits it needs
  ready(): boolean;                                               // its programs are linked
  prepare(f: FxFrameCtx, inp: GpuInputs): void;                   // its passes, after PRE/bloom, before FINAL
  bindFinal(fin: Prog, f: FxFrameCtx): void;
  free(): void; free3d?(): void; reset?(): void;                  // sleep(), drop3d(), history reset
}
export interface FxFeature { id: string; minTier: Tier; enabled(f: FxFrameCtx): boolean;
  gpu?(gl: WebGL2RenderingContext, caps: Caps, util: GlUtil): GpuModule | null }   // called inside createPost()
export function registerFx(f: FxFeature): void;

// src/ui/gfx/light.ts (L)
export type RGB = [number, number, number];                       // gamma-2 working space, max channel 1
export interface LightState {
  minute: number; sunEl: number; sunAz: number;
  frame: 'window' | 'north' | 'overhead';
  dir: [number, number];   // unit vector toward the key light, screen space, y down; dir[1] ≤ −0.25 (≤ −0.44 by D1's weights)
  len: number;             // shadow length, tiles per unit height (D1 hand-over)
  soft: number;            // 0 hard … 1 diffuse
  vis: number;             // strength of cast shadows 0..1
  sunCol: RGB; skyCol: RGB; keyCol: RGB; Esun: number; Esky: number; Ekey: number;
  night: number;           // 0 day … 1 after civil twilight; 0 when prefs.dusk is off
  field: { lamp: string; floor: string; x: number; y: number; reach: number } | null;
                           // night field N (§6.L L7), light looks: display hexes; centre screen-normalised; reach in CSS px
                           // (0.7 × the distance from the centre to the farthest corner); uniform looks: lamp === floor; dark: null
  keyShare: number;        // share of the open-ground light that casts shadows (vis and bevel act on it), the rest is fill
  exposure: number;
}
export function lightNow(look: LookKey, date: Date, dusk: boolean): LightState;

// src/ui/matter.ts (M)
export interface Light { x: number; y: number; r: number; rgb: string; a: number;
  kind: 'burner' | 'flame' | 'incand' | 'chemilum' | 'lamp' | 'status' }
export interface Heat { x: number; y: number; r: number; a: number }

// src/content/looks.ts (C) — fields added in S0 as optional, filled by C (§10)
export interface Look { hex: string; word: string; aq?: boolean; metal?: boolean;
  sol?: Form; vap?: Form; anhyd?: Form; ppt?: boolean; turbid?: string; layer?: 'top' | 'bottom'; fume?: string;
  glowAir?: string; photo?: [string, string]; store?: Store; cue?: 'symbol' | 'reagent' | 'label' }
export interface Form { hex: string; word: string }
export type Store = 'kerosene' | 'water' | 'poly' | 'brown';
export interface ReactionLook { /* existing fields */ burn?: Burn; melt?: number; T?: number;
  Tcap?: string;           // caption temperature where T is a display clamp (thermite, §10.7)
  process: ProcessKind;
  exo?: boolean; indicator?: Indicator; catalyst?: Catalyst; gasIn: string[]; solidsIn: string[]; gasRatio: number[]; dH?: number }
export function popLook(id: string): { rgb: string; mode: 'light' | 'puff' };  // rgb: the appearance hex for 'puff'; unused for 'light'
export function plumeOf(id: string): { hex: string | null; M: number; cls: 'heavy' | 'light' | 'neutral';
  white?: 'smoke' | 'mist'; clearTiles?: number };   // smoke: NH₄Cl, P₄O₁₀; mist: SO₃, steam; steam: rings for clearTiles 0.3
```

### 5.6 Cross-package rules
1. **`view.still`** (fix/draw, album photos and title thumbnails): every per-frame recorder binds per `draw()` call from `view`
   (keep marks, probe, `fxOf` lights, plume spawning, information routing, shape list). Under `still` nothing is recorded or
   spawned, and no cache keyed by the main canvas is touched. Cached full-screen canvases are keyed by canvas size.
2. **Cache hygiene**: every new cache registers `onThemeChange`, frees canvases with `width = height = 0`, and reports its count
   and bytes to `__fx.mem()`.
3. **Errors**: the registry wraps every `GpuModule` call; a throw disables that feature for the session, records it in meta
   `gfxOff`, and shows one toast. Tests count `pageerror`, `console.error` and `frameFault` calls (`__fx.faults`).
4. **No new saved fields in R1.** (AgCl light exposure, which needs one, is R2 with the F40 validator.)
5. **Keep the fixes**: the paused ‖ state, the CVD heat ramp, hollow and hatched jams, `mapStats` layers and the pillar fix stay
   as merged; `tests/pillar3d.test.ts`, `draw`, `engine`, `robust` and `input` tests stay green.
6. **Text**: every new on-map sentence comes from `captions.ts` (§10.14).

### 5.7 Look × view matrix for R1

| Look | Light frame | Night (light looks, GL) | 標準 night canvas | `emitGain` | Streak | Shadows 標準/高 | Shadows 最高 2D | 3D |
|---|---|---|---|---|---|---|---|---|
| note-light | window | N: `#ffeedd` at (0.15, 0.10) → `#b4bccc` at 0.7 × the farthest-corner distance (desk lamp, white-balanced) | multiply by the same N | 1.0 | 0 | S1 along `dir` | `tShade` + contact S1 | boxes lit by L3; fog on matter |
| note-dark | overhead | — | none | 1.2 | 0 | S1 down | `tShade` | same |
| punk-light | north | floodlights overhead, even: uniform N `#c8ccd6` | uniform multiply `#c8ccd6` | 1.3 | 0 | S1 down, soft | `tShade` (soft) | same |
| punk-dark | overhead | — | none | 2.0 | 0.35 | S1 down | `tShade` | same |
| arcane-light | window | N: `#fff6ea` at (0.10, 0.20) → `#c8ccd6` (candle, white-balanced) | multiply by the same N | 1.2 | 0.06 | S1 along `dir` | `tShade` | same |
| arcane-dark | window (candle) | — | none | 2.0 | 0.2 | S1 from upper left | `tShade` | same |
| lab-light | overhead | panels stay: uniform N `#d2d8e2` | uniform multiply `#d2d8e2` | 1.2 | 0 | S1 down | `tShade` | same |
| lab-dark | overhead | — | none | 2.0 | 0.2 | S1 down | `tShade` | same |

Far view: tone only (no `tShade`); light looks at night: 標準 uses `nightFar` with the same N as `nightCanvas` (fix/draw's `!G`
guard in far.ts stays), GL far frames get FINAL's night. God rays: none in
R1 (the arcane-dark moon window returns in R3 with a window-mask source). Dark looks do not change with the clock in R1.

---
## 6. Round 1 packages

Each package: goal, owned files (§5.1), decisions, per-tier behaviour, budget (§4.4 row), fallbacks, acceptance. "Probe",
"capture", "matrix" and the gates are defined in §7.

### 6.S R1-S — Seams, frame safety and test harness

**Goal.** Make parallel work possible without changing a pixel (S0), then give everyone the information layer, a safer ladder
and the tools that run every gate (S1). R1-S is also the integrator.

**S0 (pixel-identical; first ≤ 2 h)**
- S0.1 Moves and seams of §5.4, stub bodies with today's behaviour, exported silhouette constants (`CARD`, `PUNK_BODY`,
  `LAB_SHELL`, `TANK_BODY`) hoisted from the drawing code.
- S0.2 Every information draw (D5 list) takes its target from `R.info` and applies its own transforms to that context
  (`port()`, `inDoors`, name tag, badges, status lamp, stack badges, plates…). In S0 `R.info` follows `drawNear`'s `use()`: the
  main `ctx` in 標準 and 2D, the current plane texture or `three.screen` in 3D, so S0 stays pixel-identical.
- S0.3 `FxFrameCtx` built once per frame in `main.ts`; `near` = the value `draw()` recorded from `farBegin` (wraps
  `isFar(cv, cam)`); `light` from `lightNow` (stub: today's `sunNow`); `shapeOn` false.
- S0.4 FS_FINAL split into ordered chunks in `gfx/final.glsl.ts` (BASE_SAMPLE, LIGHT, COMPOSE, HALO, WATER, FOG3D, TONE);
  `gfx/final.ts` assembles them under `#if` bits; with S0's bit choices the assembled source is today's FS_FINAL token for token.
  Units keep today's numbering (`gfx/units.ts` documents it); `composite` skips a legacy pass whose unit a ready module claims.
- S0.5 `gfx/glutil.ts`: `program`, `target`, `drop`, `into`, `bind`, `tri`, `invalidate` moved from gl.ts; compile policy of D3;
  data uploads set `UNPACK_FLIP_Y_WEBGL = false`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL = false`, `UNPACK_ALIGNMENT = 1` and restore
  the canvas-upload state afterwards.
- S0.6 `gfx/registry.ts`, `gfx/index.ts`, `gfx/caps.ts` (`f16` and `rg11b10`: extension present, FBO complete, clear to 1.5,
  float `readPixels` returns 1.5 ± 0.01; `parallelCompile`; `maxUnits`), probed inside `createPost()` so they re-run after a
  restore. Kill switch `?gfx=off:<ids>`; error isolation (§5.6 rule 3).
- S0.7 (lands first, right after T0, as commit D0, §5.0) `?det=<seed>` (`gfx/det.ts`): `Math.random = mulberry32(seed)`; the rAF loop is not started;
  `window.__step(n, dtMs = 1000/60)` runs fix/robust's `frameBody` n times synchronously with synthetic timestamps;
  `__step(1, 0)` renders without advancing time. Time-budgeted builders become count-based (far.ts `regionImage`, mapfx pop
  budget). Playwright uses `page.clock.install({ time })` and never lets it run free; the harness's step helper advances it
  explicitly, per frame `await page.clock.runFor(dtMs)` and then `__step(1, dtMs)`, so timers (the 200 ms resize debounce,
  toasts) fire exactly as in real time and identically in every run. `?gfx=slow:N` and `slowsim:N` add N ms to the synthetic
  frame time instead of busy-waiting (D8). Playwright blocks the Google Fonts requests so fallback fonts are used identically in
  every run.
- S0.8 `__fx` (`gfx/fxapi.ts`, present under `?det` or `?fw`): `features()`, `set(id, on)`, `light()`, `mem()` (GL targets and
  bytes, live canvases and bytes via a wrapped `document.createElement('canvas')`, per-cache counts), `mask()` (with sizes, in
  every tier: keep mask G and information alpha where they exist; an **emitter mask** = the glow-layer alpha in GL tiers, the
  `fxOf` light discs rasterised in 標準; a **particle mask** = the particle and plume discs that `plumes.ts` and the particle loop
  record under `?det`), `probe()` (M's `matterProbe`), `faults`, `chunks()` (chunk builds since the last call), `capture()`
  (composited RGBA of what is on screen: `#gl` `readPixels` in the same task as the frame, alpha-composited with `#info`; `#cv` in
  標準), `c2d()` (§4.3 (3), part of D0), `shade()` (H's `tShade` readback, debug only).

**S1 (after S0)**
- S1.1 Information layer (D5): `#info` canvas created in `main.ts`, sized and transformed with `#cv`, cleared on every
  rendered frame and only then (the 60 Hz cap and the idle and veiled skips leave it as drawn), allocated only in 2D GL tiers.
  One CSS rule (`position` like `#gl`, above it, `pointer-events: none`). If allocation fails, `R.info = ctx` and one
  `console.warn`. `takeShot()` (画面写真) composites `#info` after `#gl`, the same composite as `__fx.capture()` (today it draws
  only `#gl` in 2D GL tiers, so every photo in 高/最高 would lose labels, plates, port arrows and lamps).
- S1.2 Ladder and pacing (D8), logic in `gfx/frame.ts` as pure functions (`shouldRender` → `{ render, rdt }`, `nextRung`,
  `inGrace`, `countsAsSlow(rdt, stepMs, grace)`) used by `main.ts`. `main.ts` times the step loop on every frame (one
  `performance.now()` pair; `PERF` keeps its own record), runs the simulation, `input.tick`, the camera ease, the HUD and
  `addPlayTime` on every rAF, and passes `rdt` to `draw()`, `drawFireworks()` and the particle, plume and mapfx steps. Today's
  idle skip (1 of 6) and fix/skins' veiled skip (1 of 15) are replaced by `shouldRender`'s intervals.
- S1.3 Harness, all outside npm dependencies (globally installed Playwright as the existing scratch scripts do; esbuild from
  devDependencies bundles TS helpers for Node):
  - `scripts/gfx/shots.mjs`: builds once, runs the §7.2 matrix and scene jobs, writes PNGs and a JSON of metrics;
  - `scripts/gfx/capture.mjs`: `__fx.capture()` + `__fx.mask()` + `__fx.probe()` per shot;
  - metric functions come from `src/dev/metrics.ts` (R1-C);
  - `scripts/gfx/alu.mjs` (§4.3 (1), worst uniform values over the capture times), `scripts/gfx/bench-sync.mjs` (§4.3 (2),
    with the A/A pair and the per-tier flush), the `__fx.c2d()` count runs (§4.3 (3));
  - the step helper (`page.clock.runFor(dtMs)` then `__step(1, dtMs)` per frame, §6.S S0.7);
  - `scripts/gfx/contact.mjs`: one PNG per merge with fixed 1:1 crops (hub entry, belt with heaps, analyzer, shore, screen
    corner, 3D top row) across looks × tiers × times;
  - `src/dev/scenes.ts`: `?det&scene=<id>` builds a fixed world; packages append their scene; R1-S writes `legib` (§7.3).
- S1.4 `tests/compass.test.ts`: for every goal hint containing 東/西/南/北 and a `zone`, the 8-way bearing from `HUB_CENTER` to
  the zone anchor, north-up, equals the word. Fix the two content misses (sulfur 南東 → 北東, farm 南 → 南東). Update the in-game
  notice and `docs/GRAPHICS.md` with C's notice text (§10.14).
- S1.5 `?perf=sync`: overlay with main-thread time per frame (`performance.now()` around `frameBody`) and, when `sync`, a flush
  after each rendered frame — a 1-px `readPixels` on `#gl` in GL tiers, `getImageData(0, 0, 1, 1)` on `#cv` in 標準 — the same way
  in every arm; shows median and p95 over 5 s. Used for the 標準 ledger with `__fx.c2d()` (§4.5).
- S1.6 `?gfx=selftest`: renders known patterns and prints a JSON checksum the player can paste back: FBO completeness and float
  round trip for RGBA8, RGBA16F, R11F_G11F_B10F; `sqrt(max(x, 0))` on negative inputs (no NaN); the **real assembled heat-haze and
  WATER blocks** (L3a) on a water test tile at camera (0, 0) and (10⁴, 10⁴) and at t = 0 and t = 10⁵ s: the four value
  histograms agree within 2 % and no pixel is NaN (a lattice pattern or a precision loss shows as a histogram change); a 32-bit
  integer hash check (`highp int`: known outputs of the hash for large inputs); the PCG dither pattern hash.
- S1.7 Integration: merges in the §5.2 order, runs §7 with the gate owners of §7.0 and the cumulative ledger of §4.5, keeps
  `docs/GRAPHICS.md` (feature list, tier matrix, budgets, ledger, known limits). After H merges, deletes the Canvas2D height
  layer in main.ts/render.ts.
- S1.8 **`drawNear` order** (render.ts): (1) the world pass — ground (`groundPass`, with the resource-tile marks, resource names
  and signposts at their places), belts, machines (with the information drawn inside `machine()`), rails and trains (貨物線),
  particles and plumes (`// ---- 粒子 ----`, without text particles) and M14 'puff' pops; (2) S7 `nightCanvas` (標準 light looks;
  replaces the `// ---- 夕暮れ` block); (3) the information overlays in today's relative order — jam lens, flow trace, 稼働率
  colouring and plates, district labels, rail preview, blueprint ghost, selected ports, same-recipe rings, area, build2 `over`,
  reaction plates, selection marks, `+1` text particles — all through `R.info`; (4) light: busy-machine work-lamp sprites,
  light-mode glints (`drawGlints`) and M14 'light' pops. In GL tiers (1) and (4) go to `#cv` and the glow layer as today and (3)
  to `#info`; the order matters only in 標準, where trains and plumes no longer stay day-bright at night.
- S1.9 **`calm` at t = 0**: under `calm`, `draw()` passes t = 0 to every decorative animation in render.ts and its helpers
  (jam-lamp blink `sin(t·9)`, punk ！ blink, flow-trace pulse, selection ring, resource-tile marks, glow pulses), and state blinks
  are drawn steady; fix/draw's shape cues (hollow and hatched jams, ‖) remain.

**Per tier.** 標準: draw order of S1.8 (information is `#cv`, after the night). 高/最高 2D: information on `#info`. 3D: unchanged
(D5 exception). Far: unchanged. Every tier: `rdt`, attribution, `calm` at t = 0.

**Budget.** §4.4 row R1-S. `#info` is the only memory added; freed outside 2D GL tiers.

**Fallbacks.** `#info` allocation failure → today's behaviour. Missing `parallelCompile` → title-screen one-link-per-frame.

**Acceptance**
- S0: typecheck, test, build; the §7.2 matrix (all tiers, 3D, far) and the three scene-free views are **pixel-identical** to the
  golden baseline (max channel difference 0) and their `__fx.c2d()` counts equal D0's; `tests/gfx-seams.test.ts`: chunk order,
  assembled source equals today's FS_FINAL for today's bits, owner-prefixed uniform names unique, unit table unique and ≤ 16,
  every assembled FINAL variant and every program whose source declares a `uint`, `uvec*` or integer hash contains
  `precision highp int;` (D2), the S8 stub equals a frozen copy of the old
  `duskPost` for 8 looks × 3 tiers × 2D/3D × 4 clock times; context loss and restore once: no error, a frame renders.
- S1 information layer: on the `legib` scene, the `#info` pixels are byte-identical across 高/最高 and 12:00/16:00/21:30
  (nothing lit reaches them); `#info` width is 0 in 標準 and 3D.
- S1 ladder: `?gfx=slow:50` (50 ms in the render path) walks 3D off → 高 → 高@1.5 → 標準@1.5 → 標準@1.25 with one toast per
  rung; `?gfx=slowsim:50` (50 ms inside the step loop) walks no rung and stores no `dprCap`; a tier toggle inside the 2 s grace
  does not count; a manual 画質 choice clears `dprCap`. `tests/gfx-frame.test.ts`: `shouldRender` with 120 Hz timestamps renders
  ≤ 61 frames per second while the simulation step count is unchanged; at 60, 90 and 120 Hz timestamps a test particle covers the
  same distance per wall-clock second (± 1 %) and play time per wall-clock second is 1.0 ± 0.01; idle and veiled intervals; the
  saver-idle state adds no play time; `countsAsSlow` false when `stepMs ≥ 0.3·rdt` or in grace; rung order; grace windows
  (change, restore, resize, `visibilitychange`, slot or save load, first 5 s).
- S1 photo and order: a 画面写真 in 高 and 最高 contains the `#info` pixels (§7.4 e); on the `legib` scene in 標準 at 21:30 a
  train and a coloured plume over open paper are under S7 (they change between 12:00 and 21:30 like the paper beside them),
  while selection marks, reaction plates and `+1` text keep their 12:00 pixels; from L's merge the train and plume pixels equal
  their 12:00 pixels × N within ΔE00 2.
- S1 calm: gate h (§7.3) on the near view and the `legib` scene.
- Determinism: the full matrix run twice produces identical image hashes.
- `tests/compass.test.ts` 18/18.
- Cache and canvas hygiene test (§7.4 b).

### 6.L R1-L — One light, HDR and tone

**Goal.** One light per look, from its physical frame (D1) and the real Kyoto sun; night as a lit pool with a readable floor, not
a veil; emission with headroom that rolls off instead of clipping; matter leaves the compositor unmodified; effects that pretend
to be light are gone; 3D boxes agree with the shadows.

**L1. Sun and sky (`gfx/sky.ts`, `gfx/skytab.ts`).**
- Sun position: NOAA general solar position for Kyoto (35.0116 N, 135.7681 E, JST = UTC+9):
  ```
  g    = 2π/365 · (doy − 1 + (hour − 12)/24)
  eqt  = 229.18·(0.000075 + 0.001868 cos g − 0.032077 sin g − 0.014615 cos 2g − 0.040849 sin 2g)        // minutes
  decl = 0.006918 − 0.399912 cos g + 0.070257 sin g − 0.006758 cos 2g + 0.000907 sin 2g − 0.002697 cos 3g + 0.00148 sin 3g
  tst  = hour·60 + eqt + 4·lon − 60·9 ;  ha = rad(tst/4 − 180)
  cos zen = sin lat sin decl + cos lat cos decl cos ha ;  el = 90° − zen
  az   = deg(atan2(sin ha, cos ha sin lat − tan decl cos lat)) + 180     // clockwise from north
  ```
- Sky colours (gamma-2 = square of the sRGB value/255) by elevation, linear interpolation between rows. Generated once by the
  prototype `gfx/tech/sky/sun.py` (Rayleigh λ⁻⁴ with the Hansen–Travis form, Ångström aerosol 0.08·(λ/550)^−1.3, Chappuis ozone
  300 DU, Kasten–Young air mass, single-scattering zenith sky, Wyman–Sloan–Shirley CMF fit); the table is the data, no
  generator ships:

  | el (°) | −8 | −6 | −4 | −2 | 0 | 2 | 5 | 10 | 15 | 20 | 30 | 45 | 60 | 90 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | sun disc | — | — | — | — | `#ff6200` | `#ffa000` | `#ffc45e` | `#ffd993` | `#ffe1ab` | `#ffe5b9` | `#ffe9c7` | `#ffebd1` | `#ffecd5` | `#ffedd8` |
  | Esun (rel.) | 0 | 0 | 0 | 0 | 0.001 | 0.024 | 0.134 | 0.334 | 0.472 | 0.564 | 0.674 | 0.756 | 0.796 | 0.820 |
  | zenith sky | `#000000` | `#aaf2ff` | `#a1dcff` | `#c0e7ff` | `#c7efff` | `#b8e9ff` | `#a9dcff` | `#9fcfff` | `#9bc9ff` | `#99c5ff` | `#97c1ff` | `#96bfff` | `#95beff` | `#94bdff` |
  | Esky (rel. to zenith sun) | 0 | 0.0006 | 0.012 | 0.070 | 0.208 | 0.371 | 0.561 | 0.736 | 0.825 | 0.876 | 0.933 | 0.971 | 0.989 | 1 |

- `night = 1 − smoothstep(−6°, 2°, el)` (0 above 2°, 1 after civil twilight). Recomputed once a minute, on look change and on
  `visibilitychange`; transitions ease over 0.6 s (instant in `calm`). `duskOf()` stays for `sleep.ts` only.
- Key colours (Planck through the CMF fit; §10.7): candle 1850 K `#ff8500`, tungsten 2700 K `#ffae59`, LED 4000 K `#ffd4a5`,
  panels 5000 K `#ffe7d0`. In R1 they colour only drawn emitters (lamp sprites, candle flames); the light the map receives at
  night is the white-balanced night field N (L7). Under the raw 2700 K key, 24 element-colour pairs would drop below ΔE00 10 and
  N's hue would turn 134° (`gfx/crit2/spec2v7.py`); under N's lamp colours none does.

**L2. Key light per look**: D1 table and hand-over. Night field N (L7): centres (screen-normalised, origin top-left) note-light
(0.15, 0.10), arcane-light (0.10, 0.20); reach 0.7 × the distance from the centre to the farthest screen corner; punk-light and
lab-light uniform. Key share at night (starting values, calibrated with the gates): 0.6 note-light and arcane-light, 0.4
punk-light, 0.3 lab-light. Dark looks: overhead key with `Ekey` such that open floor renders its painted value (today's
appearance), no clock dependence in R1.

**L3. FINAL in gamma 2 (`gfx/final.glsl.ts`).** CPU folds sun, sky, key, white balance and night into two colours and the night
field, so FINAL stays small:
```glsl
// header: precision highp float; precision highp int;   (D2: FINAL hashes)
// BASE_SAMPLE: offsets d from heat haze (≤ 1 CSS px) and water ripple, rebuilt per L3a; aberration; keep is the single function of D4
float keep = smoothstep(0.85, 0.98, m.g);
// LIGHT
vec3 sl = s * s;
#if T2
vec3 sh = textureLod(uShade, uv, 0.0).rgb;            // r shadow, g ao, b bevel (0.5 neutral) — from R1-H, or the neutral dummy
float vis = 1.0 - sh.r * uShadow, ao = 1.0 - sh.g * uAO, bev = 1.0 + (sh.b - 0.5) * 2.0 * uBevel;
#else
const float vis = 1.0, ao = 1.0, bev = 1.0;
#endif
vec3 nf = vec3(1.0);                                  // N² of the night field (L7); uniform looks fold N² into uDirCol/uFillCol
if (uPool.z > 0.0) {                                  // note-light and arcane-light with night > 0 only (the proxy prunes it elsewhere)
  float t = min(1.0, length((uv - uPool.xy) * uRes) / uPool.z);   // uPool.z: reach in device px
  vec3 n = mix(uLampDisp, uFloorDisp, t);             // display sRGB, mixed from white by `night` on the CPU
  nf = n * n;
}
vec3 lampL = (b3 + 0.5 * b2) * uLampGain;             // bloom is gamma-2 already (B8: squared at fetch)
vec3 light = max((uDirCol * (vis * bev) + uFillCol * ao) * nf, uFloor) + lampL;   // vec3 uFloor = night·floor²/uExposure
// COMPOSE
vec3 col = sl * mix(light, vec3(1.0), keep);
// HALO (additive, never screen-blended); streak = today's streak sum (T2 only), already gamma-2
col += ((b1 * 0.5 + b2 * 0.45 + b3 * 0.35) * uBloom + streak) * (1.0 - keep);
// WATER: today's look, rebuilt per L3a (integer noise, CPU phases, no pow), constants converted to gamma 2 (R2 replaces it)
#if D3
// FOG3D: col = mix(col, uFogCol, fogK);                // working space (uFogCol = the fog colour squared, CPU)
//        sRaw = mix(sRaw, uFogDisp, fogK);             // display space, uFogDisp = sqrt(uFogCol) on the CPU (fog applies to matter)
#endif
// TONE
col *= uExposure;
col = mix(vec3(dot(col, LUM709)), col, uSat);
col = neutralCompress(max(col, 0.0), uToneStart);
vec3 disp = sqrt(col);
disp = mix(disp, disp * disp * (3.0 - 2.0 * disp), uContrast);
disp *= mix(uShTint, uHiTint, smoothstep(0.08, 0.9, dot(disp, LUM601))) * uTint;  // today's look grading, non-matter only
disp = mix(disp, sRaw, keep);                         // matter leaves FINAL unmodified
disp *= 1.0 - smoothstep(0.35, 0.95, length(c * vec2(1.0, uRes.y / uRes.x) * 1.7)) * uVig;   // every pixel (D4)
if (uDither > 0.0) disp += (pcg01(uvec2(q)) - 0.5) * uDither * (1.0 - keep);    // dark looks only; pruned elsewhere
o = vec4(disp, 1.0);
```
**ALU.** Against today's FS_FINAL (§4.3 weights), R1 adds the shoulder and `max` (≈ 33), keep, `s*s`, `sqrt` and the `sRaw` mix,
the night pool (≈ 20–24, live in note-light and arcane-light at 21:30) and the PCG dither (≈ 30: one `pcg2d` plus its scaling),
and removes relief, grain, scan, cloud fbm and the screen-to-add halo. Unpruned, that was ≈ +40 in 高 light looks and ≈ +58 in 3D
高 (the checkers' count, §1.5 #1). The `if` gates prune dither in every light look, and display-space fog on `sRaw` costs one
`mix` (≈ 9) instead of `sqrt(mix(sRaw², …))` (≈ 18), which brings both under +30 with the pool live. R1-L's PR carries the proxy
table per variant and look. If a look is still over +30, R1-L puts that look's grade terms under the same pruning (`uContrast`
0 and `uSat` 1 skip their lines; the tint `mix` folds into `uTint` when `uShTint = uHiTint`) and recalibrates its L11 values;
the gate is not waived.
`neutralCompress(c, start)`: identity when `max(c) < start`; else `d = 1 − start`, `np = 1 − d²/(peak + d − start)`,
`c *= np/peak`, `g = 1 − 1/(0.15·(peak − np) + 1)`, `return mix(c, vec3(np), g)` (Khronos PBR Neutral shape without its 0.04
offset). `uToneStart` 0.94 in light looks (paper `#f6f4ec` squares to 0.93 and passes unchanged; pure white rolls to 251/255),
0.80 in dark looks.
CPU side (`postParamsFor`): `uDirCol` = the shadow-casting light (sun by day in window frames, the window sky or key per D1's
weights); `uFillCol` = sky or room ambient; by day in light looks `uDirCol + uFillCol` (= open ground) is normalised to
luminance 1 with 40 % of its chroma kept (`open·mix(1/Y(open), 1/open, 0.6)`), so paper is the 標準 pixel at noon and warms at
golden hour. Toward night (light looks) `uDirCol`/`uFillCol` blend by `night` to neutral shares `keyShare/uExposure` and
`(1 − keyShare)/uExposure`, and the night field supplies all colour: pool looks pass `uPool` (centre, reach in device px),
`uLampDisp = mix(1, lamp, night)` and `uFloorDisp = mix(1, floor, night)`; uniform looks set `uPool.z = 0` and multiply
`uDirCol`/`uFillCol` by `mix(1, N, night)²`. `uFloor = night·floor²/uExposure` (vec3; 0 by day; dark looks 0). Open paper
therefore displays `paper·N_eff` before the look's grade, exactly the 標準 multiply (L7), and the key never carries more chroma
than N. `uExposure` 1 by day; night per look 1.0–1.25, deterministic from `LightState`, never from frame luminance; `uFogDisp =
sqrt(uFogCol)`; every noise offset and phase per L3a.

**L3a. Carried haze and water on integer noise (D2).** R1 keeps today's heat-haze and WATER looks but not their arithmetic:
- `noise(p, o)` interpolates hashes of integer cells, `hash(ivec2(floor(p)) + o + corner)`, with `fract(p)`. The hash is
  `pcg2d(uvec2(…)).x` (Jarzynski & Olano) where the proxy allows it; otherwise a single-round multiply–xorshift of ≤ 8 integer
  operations per corner (`h = c.x·0x8da6b343u ^ c.y·0xd8163841u; h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u`), evaluated
  for the four corners as one `uvec4`. Either way the proxy count of `noise()` must not exceed today's `sin`-hash `noise()`.
- Lattice offsets: for each noise call k (lattice frequency `f_k` per tile for world-anchored calls, per device px for
  screen-anchored ones; drift `v_k` per second) the CPU computes in fp64 `A_k = f_k·uOrigin + v_k·t` (screen-anchored:
  `v_k·t`) and passes `o_k = floor(A_k)` and `r_k = A_k − o_k`; the shader calls `noise(f_k·(wp − uOrigin) + r_k, o_k)`
  (screen-anchored: `noise(f_k·q + r_k, o_k)`). `uOrigin` is the camera position snapped to a multiple of 256 tiles (fp64 on the
  CPU), and `wp − uOrigin` is built from `uCam − uOrigin` (CPU, fp64), so float magnitudes stay small at the big save
  (|wq| ≈ 330 today) and at 10⁴ tiles. The seven noise calls (haze 2, water n1, n2, foam, two glint fields) use
  `ivec4 uNCell[4]` and `vec4 uNFrac[4]`.
- Every `sin` term gets its phase from the CPU, `φ = (f·uOrigin + v·t) mod 2π` in fp64 (`vec4 uPhase[2]`: two ripple, two
  caustic and one foam phase). No `uTime` and no `uTime % 1000` reaches FINAL, so nothing jumps after 1000 s.
- `pow(max(dot(nrm, hv), 0.0), 90.0)` becomes repeated squaring (x² … x⁶⁴; x⁹⁰ = x⁶⁴·x¹⁶·x⁸·x²); `pow(1.0 − nrm.z, 1.0)`
  becomes `max(1.0 − nrm.z, 0.0)` (after `normalize`, 1 − nrm.z can be −1 ulp, and `pow` of a negative base is undefined: NaN on
  some devices).
- Heat haze is capped at 1 CSS px: `d = (noise − 0.5)·m.r·2·uDpr·px` (today `·9·px`, up to 4.5 device px beside burn,
  incandescent and exo machines).
- The patterns change in detail, not in kind; R1 still does not change water styles (§8.4 is R2's). Unit (`tests/gfx-tone.test.ts`
  with a JS mirror): `noise(p, o)` with the CPU split equals the unsplit evaluation at world 0 and at 10⁴ tiles within 1e-5 for
  t ≤ 10⁶ s; phases are continuous across their wrap; the FINAL sources contain no `pow(`, `exp(`, `log(` and no
  `sin(dot(`.

**L4. Keep and 3D**: D4 exactly. `sRaw` is the scene fetched without heat or water distortion; in 3D it is the tilt-blurred
scene, fogged as above.

**L5. HDR bloom (gl.ts, PRE).** PRE writes `g*g*uEmitGain + brightPass(s*s*uExposure)` into a1 (1/3 device) in the D2 format;
blur chain and streaks stay as today but in that format. Delete FS_GOD, its target and `uGod*`. Per-look `emitGain`: §5.7.

**L6. Baked shadows (S1 `castShadow`).** One fill per object, as today. Offset `= −dir · min(len, 1.2) · h · z · 0.35`; alpha
= the look's base alpha × `vis`; no `shadowBlur`, no `filter`. `ShadowKind` heights: card 0.44 (2×2: 0.62), belt 0.24, pipe 0.24,
rail 0.36, train 0.5, hub 0.95, tank 0.44, shell as its card. When `f.shapeOn` (最高 2D with R1-H ready): contact shadow only,
offset 1 CSS px along −dir, alpha × 0.35. In 3D: no baked shadow into the plane textures.

**L7. Night field N (one model for every tier; S7 in 標準).** Light looks only, when `night > 0.01`:
- **N(x, y)**, display sRGB, per light look: `N = mix(lamp, floor, min(1, |p − c| / reach))`, `reach = 0.7 ×` the distance from
  the centre c to the farthest screen corner (CSS px), then `N_eff = mix(white, N, night)`. note-light: lamp `#ffeedd` at
  (0.15, 0.10) → floor `#b4bccc` (ink/paper 7.84:1 at the floor); arcane-light: `#fff6ea` at (0.10, 0.20) → `#c8ccd6` (7.37:1;
  the old `#b4bccc` gave 6.47:1); punk-light uniform `#c8ccd6` (7.48:1); lab-light uniform `#d2d8e2` (9.54:1). The lamp colours
  are the desk lamp and the candle white-balanced (the eye adapts to a warm room light). Relative luminance (linear Y)
  brightest/darkest cell: 1.61 note-light, 1.45 arcane-light (`gfx/crit2/spec2v5.py`); in display luma 標準 can only darken, so
  gate e measures linear Y.
- **標準** (`nightCanvas(ctx, f, punch)`): one cached N canvas at 1/4 of the backing size, rebuilt on resize or when `night` or the
  field changes by > 0.05. Each frame: with no matter on screen, `drawImage` it with `multiply` scaled ×4. Otherwise copy it into
  a 1/4-res scratch (`globalCompositeOperation = 'copy'`), fill every matter shape into the scratch with `destination-out`
  through `punch(scratch, dpr/4, dil)` — the union is correct where shapes overlap, whereas an even-odd or nonzero single-path
  clip puts night back on the overlap of two shapes (`gfx/crit0/evenodd.cjs`: one disc stays `#ffffff`, the overlap of two
  becomes `#b4bccc`) — and `drawImage` the scratch with `multiply` scaled ×4. `dil = max(3, 4/dpr + 1)` CSS px (3 at DPR 2,
  3.7 at the 1.5 rung, 4.2 at 1.25) covers the bilinear edge of one 1/4-res texel (4/dpr CSS px: 2 at DPR 2), so matter stays exact; the
  partly un-multiplied ramp outside the shape falls on its ink border (D4) and fades out within ≈ 3 CSS px beyond it (§12 #9).
  Scratch and N canvas are keyed by backing size, registered with `onThemeChange`, reported to `__fx.mem()`.
- **GL** (FINAL, L3): N computed analytically; `N_eff²/uExposure` is the open-ground light at night, split into key
  (`keyShare`) and fill for the shadow terms; `vec3 uFloor = night·floor²/uExposure` replaces the scalar 0.26 (which displayed
  ink/paper at 4.4–5.2:1 in note-light and 3.7–4.4:1 in arcane-light). Open paper displays `paper·N_eff` in both tiers: they agree
  by construction.
- busy-machine work lamps: one cached warm sprite per size bucket via `drawImage` (replaces per-machine `createRadialGradient`),
  drawn after S7 with the light pass (§6.S S1.8);
- far view: `nightFar` (標準 only; fix/draw's `!G` guard in far.ts stays) multiplies the far map by the same N (replaces far.ts's
  `rgba(14,20,44,0.36·dusk)` fill), so the near ↔ far crossfade does not change night model; GL far frames get FINAL's night;
- order: S7 runs after the world pass and before the information overlays (§6.S S1.8);
- by day, 標準 draws no key shape (`ambientLayer('under')` stays a no-op).

**L8. Removals.** GL (with L): relief emboss, lab floor reflection loop and `uRefl`/`uReach`, cloud shadows, scanlines,
per-frame grain (→ static PCG dither, dark looks only, ≤ 1.5/255), god rays. **Commit L0** (first, alone, merged right after S1,
§5.2): the Canvas2D sliding light effects of §4.5 in every tier — in `ambient.ts` and in `skinLab.ts` (`labAmbient` scan line
and beams; allowed before fix/skins merges, §5.0). L0 needs nothing from M or from `LightState`. Particle ambients (embers,
motes) stay until R3.

**L9. Top-light baked art (D1).** machines.ts: punk chamfer bevel strokes become a light top edge and a dark bottom edge (left and
right neutral); arcane brass highlights on top edges only; note cards already have straight-down thickness. skinLab `shellOf`:
sheen band vertical and symmetric, rim highlight on the top edge, window glare moved onto the top frame rim with ≤ 10 % α over the
window (the matter probe zone).

**L10. 3D (gl.ts `render3d`, FS_BOX).** Box shadow vector `uSh = −dir · len` (was the fixed (0.5, 0.38)). Face shading from
`L3 = normalize(dir.x, dir.y, 1/len)` in plane coordinates: side face `amb + k·max(0, dot(n, L3))`, top `amb + k·L3.z`, with
per-skin `amb`, `k` chosen so that at the 14:00 reference the four side faces keep today's mean brightness ± 0.05. Relief stays
off. No mipmaps in R1 (measure in R2).

**L11. `gfx/post-looks.ts`.** BASE/LOOKS moved from gl.ts. Per-look fields (starting values; calibrate with the gates):

| Look | uShadow | uAO | uBevel | bloom | emitGain | streak | vig | dither | sat | contrast | toneStart |
|---|---|---|---|---|---|---|---|---|---|---|---|
| note-light | 0.38 | 0.06 | 0.15 | 0.25 | 1.0 | 0 | 0.04 | 0 | 1.0 | 0.04 | 0.94 |
| note-dark | 0.22 | 0.10 | 0.10 | 0.25 | 1.2 | 0 | 0.20 | 1/255 | 1.02 | 0.08 | 0.80 |
| punk-light | 0.30 | 0.08 | 0.6 | 0.55 | 1.3 | 0 | 0.12 | 0 | 1.03 | 0.10 | 0.94 |
| punk-dark | 0.24 | 0.12 | 0.5 | 0.8 | 2.0 | 0.35 | 0.20 | 1.5/255 | 1.06 | 0.10 | 0.80 |
| arcane-light | 0.40 | 0.06 | 0.3 | 0.5 | 1.2 | 0.06 | 0.12 | 0 | 1.04 | 0.08 | 0.94 |
| arcane-dark | 0.20 | 0.12 | 0.45 | 0.85 | 2.0 | 0.2 | 0.20 | 1.5/255 | 1.06 | 0.12 | 0.80 |
| lab-light | 0.22 | 0.06 | 0.32 | 0.45 | 1.2 | 0 | 0.12 | 0 | 1.04 | 0.10 | 0.94 |
| lab-dark | 0.20 | 0.12 | 0.42 | 0.95 | 2.0 | 0.2 | 0.20 | 1/255 | 1.06 | 0.14 | 0.80 |

`PLAIN_LOOK` (高) keeps tone, bloom and night but zeroes shadow, AO, bevel and streak. Removed fields: `god`, `relief`,
`cloud`, `reflect`, `scan`, `grain`.

**Colour spaces (one table, c2-S2).** Scene, glow, mask canvases: display sRGB. PRE output, bloom chain, streaks: gamma 2 (or
display with B8). `tShade`: linear data. FINAL working space: gamma 2. Output: display. Nothing else converts.

**Per tier.** 標準: S1 along `dir`, L7 night (multiply by N, matter punched out), L0 removals. 高: + gamma-2 light, HDR bloom,
exposure, tone, matter passthrough, the same N analytically with its floor, L3a haze and water. 最高 2D: + `tShade` (R1-H) and
streaks. 3D (高/最高): + L10, fog on matter (display space for `sRaw`). Far: tone; `nightFar` in 標準, FINAL's night in GL.

**Budget.** §4.4 row R1-L; 標準 ledger rows of §4.5.

**Fallbacks.** No float bloom → B8 path, `emitGain ≤ 1.5`. Variant not ready → lower variant. `uShade` unclaimed → neutral dummy
(0, 0, 0.5) and `uShadow = uAO = uBevel = 0`. Context lost → 標準 (F41) until restored.

**Acceptance**
- Unit `tests/gfx-sky.test.ts`: against NAOJ for Kyoto 2026-11-12 — sunrise 06:28 (az 111.0°), transit 11:41 at 37.3°, sunset
  16:54 (az 248.8°); ±2 min at el −0.833°, ±0.5° elevation, ±1° azimuth; 15:00 el 19.4 ± 0.5°, az 230.4 ± 1°; civil twilight end
  17:22 ± 3 min; transit 2026-06-21 78.4 ± 0.3°, 2026-12-22 31.6 ± 0.3°. Window mapping at 08:00/12:00/15:00/16:00 equals D1's
  vectors ± 0.02; over a year at **1-minute** steps, in all looks, `dir.y ≤ −0.44` and `|Δdir| ≤ 0.05` per minute (D1's weights
  give 0.032), including 2026-11-12 16:40–16:50 and 2027-06-21 16:35–16:50; `len`, `vis`, `soft` finite and continuous; with
  `dusk = false` at 21:30 the state equals 14:00's and is finite; sky interpolation hits every table node exactly.
- Unit `tests/gfx-tone.test.ts` (`gfx/tonemath.ts` mirrors the GLSL): gamma-2 8-bit round trip exact for all 256 values;
  `neutralCompress` identity below both starts; for 1,000 seeded random colours above, OKLab hue change ≤ 2°, luminance
  monotonic, no NaN or negative output for inputs in [−0.1, 64]; `postParamsFor` never emits removed fields, respects the
  vignette caps, and gives open-ground luminance 1 ± 0.005 at 12:00 in light looks; at 21:30 in each light look, the JS mirror of
  LIGHT and TONE (grade neutral) on open paper equals the 標準 multiply `paper·N` within 1/255 at the pool centre, the reach and
  a corner, and the key and fill colours have no more OKLCh chroma than N; L3a's noise and phase tests.
- Playwright (`?det`, §7.2 matrix and the `night` scene): the gates L owns (§7.0: a, b2, c, d at 16:00 and 21:30 and in 3D, e);
  night overlap (標準 at 21:30, `chem` scene, every light look): inside two overlapping marked shapes (a precipitate pile over its
  liquid, a swatch over its tube's window) and a two-layer vessel, every pixel is within ΔE00 3 of the 標準 12:00 pixel, and two
  overlapping coloured plume puffs are multiplied by N like the paper around them (they are not matter, D4); paper gate (light looks 12:00, GL tiers vs
  標準 open-paper probes in the vignette-free centre within ΔE00 1.5; the look's `sat`/`contrast` grade is the only residual); one-direction gate (note-light and arcane-light
  at 16:00 and 21:30, 高 and 最高: the shadow centroid of a test card lies within 15° of −dir; 最高: paper 10–35 px outside the
  card on the light side within 2 % of open paper; 3D 最高 16:00: the box face toward `dir` is ≥ 8 % brighter than the opposite
  face); night gates (§7.3 e); clipping (arcane-dark hub entry < 0.5 % of pixels with all channels ≥ 254); flash test; legibility
  gate; sprite scan (`?det&scene=sprites`, cached cards and shells on a neutral ground: bottom-edge mean luma ≤ right-edge mean,
  right within 5 % of left, shells left/right symmetric within 2/255 mean); a tier or 3D toggle builds 0 chunks.
- Frame time (§7.5): ALU proxy per variant (each look's worst uniform values over the capture times) ≤ baseline + 30 instr/px
  in non-lab looks and ≤ baseline − 40 in lab looks; SwiftShader compositor ratio 最高 ≤ 1.05× (non-lab), lab-dark 最高 ≤ 0.75×,
  高 ≤ 1.05× (each + the A/A allowance); 標準 on the three standard views: `__fx.c2d()` ≤ the reference at L0's merge and at L's
  (§4.5), timing informational.
- L0 (its own merge): only the removed effects change — captures change only in the looks that drew them, and with
  `?gfx=off:ambient` on both trees they are pixel-identical; `__fx.c2d()` (calls and area) is lower than D0's on the standard
  views of the looks that had them and equal elsewhere; gates f, i, j green; the other gates no worse (§7.0).

### 6.H R1-H — Shape buffer (最高, flat view)

**Goal.** The height field follows what is drawn: rounded cards cast rounded-rectangle shadows, round lab reactors and pipes cast
round ones, shadows are sharp at contact and soften with distance, no grey ring around every card, no pop-in at the screen edge.

**H1. Records.** `ShapeList` = growable `Float32Array`, stride 8: `[x0, y0, x1, y1 (tiles), h (0..1), kind + 16·cls, r (corner
radius or half-width, tiles), lift]`. `kind`: 0 rounded rect, 1 disc, 2 capsule (axis along the longer side), 3 octagon (punk
chamfer), 4 dome (disc with profile `h·sqrt(1 − ρ²)`). `cls` (ordered so that MAX blending keeps the top surface's class):
0 water, 1 ground, 2 belt, 3 rail, 4 machine, 5 hub, 6 train.

**H2. Silhouettes from today's art** (from S0's exported constants; one `shapeOf` per entity per frame, in the 高さの層 loop):

| Entity | note / arcane | punk | lab | h | lift |
|---|---|---|---|---|---|
| 1×1 machine | rounded rect 0.84, r 0.12 | octagon a 0.46, c 0.14 | rounded rect, r 0.07 | 0.44 | 0 |
| 2×2 machine | rounded rect 0.84·2, r 0.12·2 | octagon | reactor: dome of the shell radius; others rounded rect | 0.62 | 0 |
| tank | as its card | as its card | as its shell | 0.44 | 0 |
| solid belt | rect, width 0.56 | same | same | 0.24 | 0 |
| liquid / gas pipe | capsule, width = drawn pipe width | same | same | 0.24 | 0 |
| bridge / tunnel mouth | rect 0.76 / rect | same | same | 0.36 / 0.30 | 0 |
| hub | rounded rect, inset 0.06 | same | same | 0.95 | 0 |
| elevated rail | capsule width 0.18 | same | same | 0.36 | 0.30 |
| train car | rounded rect | same | same | 0.5 | 0.30 |
| water run (from render.ts row runs) | rect | same | same | 0 | 0 |

Ground is the clear value 0.1. All sizes are fractions of the entity's tile size and must equal the exported constants.

**H3. SH0 raster.** `tShape` RGBA8 (R h, G cls/16, B lift, A 1) at 1/2 CSS resolution plus a guard band
`g = min(3, len·0.95) tiles · z/2` px on every side, so casters just off screen exist. Water runs first with blending off, then
all shapes as instanced quads (one VAO, attribute divisor 1) with `blendEquation(MAX)`; the fragment shader evaluates the kind's
SDF with a 1-px anti-aliased edge. Upload with `bufferSubData` (≤ 4,096 shapes = 128 KB, the buffer doubles when needed).

**H4. SH1 shade.** `tShade` RGBA8 at 1/3 CSS resolution (the mask's size; FINAL's `uShade` contract: r shadow, g ao, b bevel
with 0.5 neutral, a top). No blur pass. `tShape` is sampled through `uShapeScale`/`uShapeOff` because of the guard band.
```glsl
float h0 = H(uv);
float res = 1.0;                                     // contact-hardening shadow: march toward the light
for (int i = 1; i <= 12; i++) {
  float t = float(i) / 12.0;
  vec2 p = uv + uDirUV * (t * uLenUV);               // uLenUV: shadow length of a unit-height caster, in uv
  res = min(res, clamp(uK * (h0 + t - H(p)) / t, 0.0, 1.0));   // uK = 2 + 14·(1 − soft): penumbra width
}
float shadow = 1.0 - res;                            // a top is shadowed only by a taller caster
float ao = 0.0;                                      // horizon AO: 4 directions × 3 steps, higher neighbours only
for (int k = 0; k < 4; k++) for (int j = 1; j <= 3; j++)
  ao += max(0.0, H(uv + DIRS[k] * float(j) * uAOStep) - h0 - 0.02) / float(j);
ao = clamp(ao * uAOK, 0.0, 1.0) * step(h0, 0.15);   // tops get no AO
vec2 g = vec2(H(uv + vec2(px.x, 0)) - H(uv - vec2(px.x, 0)), H(uv + vec2(0, px.y)) - H(uv - vec2(0, px.y)));
float bevel = 0.5 + clamp(dot(-g * uBevK, uDirUV), -0.5, 0.5);
o = vec4(shadow * uVis, ao, bevel, step(0.15, h0));
```
`H(p)` is `textureLod(tShape, map(p), 0.0).r`. `uDirUV`, `uLenUV`, `uK`, `uVis` come from `LightState` (`dir`, `len`, `soft`,
`vis`). The look's `uAO` (§6.L L11) times `uAOK` is capped so the darkest AO pixel stays ≥ 0.92 of open ground in light looks and
≥ 0.85 in dark looks.

**H5. Module.** `FxFeature` `shape`: `minTier 2`, `enabled(f) = f.tier === 2 && !f.three && f.near && !f.still`; its `GpuModule`
claims the `uShade` unit, bit `T2`; `prepare` uploads, runs SH0 and SH1 with `invalidateFramebuffer` before each; `ready()` false
until both programs link (lazy, D3), and while false the frame uses baked shadows; `free()` deletes everything (rebuilt on the
next `prepare`); exposes `tShape` for R2-GI. `f.shapeOn` is true exactly on frames where `tShade` was produced.

**Per tier.** 最高 2D near only. 標準, 高, 3D (boxes keep their own shadows; 3D boxes stay square through R2), far: off.

**Budget.** §4.4 row R1-H: SH1 28 fetches + ≈ 140 instr at 1/3 CSS (≈ 0.12 + 0.03 ms iPad, 0.32 + 0.08 ms Tab), SH0 negligible,
two passes replacing three; Canvas2D height fills removed (CPU ≤ 0).

**Fallbacks.** Not ready, killed (`?gfx=off:shape`) or thrown → full baked shadows (`castShadow`), neutral dummy on `uShade`.

**Acceptance**
- Unit `tests/gfx-shapes.test.ts` with the JS SDF mirror (`gfx/sdf.ts`): distance error ≤ 0.01 tile at sample points for every
  kind; `shapeOf` returns ≥ 1 primitive inside the footprint for every kind in `MACHINES` plus belt, pipe, bridge, tunnel, rail,
  train, hub, in all four skins, matching the exported constants within 1 %; `kind`/`cls` packing round trip; guard-band formula;
  buffer growth.
- Playwright (`?det&scene=shapes`, four skins in their light theme, 最高, 08:00/12:00/16:00):
  - round shadow: the lab reactor's shadow boundary sampled on 16 rays fits a circle offset along −dir with radius residual ≤ 8 %;
    a note card's fits a rounded rectangle (corner residual ≤ 10 %);
  - direction: shadow centroid offset within 10° of −dir (paper looks, three times) and of straight down (building looks);
  - contact hardening: 10–90 % edge ramp narrower at 0.2 tile from the caster than at 1.5 tiles;
  - no ring: mean `tShade.g` on 2×2 tops < 0.02 (`__fx.shade()`); open ground 0.2–0.5 tile from a card on the side away from
    the light ≥ 0.95 of open-ground luma;
  - edge pop-in: after a 3-tile pan, shadows entering at the screen edge are present on their first frame;
  - stability: static camera 60 frames, ground luma std ≤ 1/255 per pixel; 1-tile pan over 30 frames, no change > 8/255 away
    from moving objects;
  - 高, 3D and far captures are unchanged by this package (pixel-identical to the tree before the merge).
- Frame time: SwiftShader compositor ratio of the shape path vs the legacy SHADE path ≤ 1.0× at DPR 1 and 2; SH1 proxy ≤ 30
  fetches and ≤ 160 instr/px; 最高 main-thread draw time ≤ baseline.

### 6.C R1-C — Chemistry data and captions

**Goal.** §10 becomes code that every renderer reads, with tests that fail if a colour, a rule or a sentence drifts from its
source.

**Decisions**
- C1 `Look` fields of §5.5 filled per §10.3–§10.5 and §10.15. `word` stays the primary form (mock.ts builds colour questions
  from it and skips words containing `（`); context forms live in `sol`, `vap`, `anhyd`.
- C2 `ReactionLook` derivations:
  - `gasRatio`: coefficients of the gaseous products (same temperature and pressure: volume ratio = mole ratio);
  - `burn`: the explicit table of §10.6 (five recipe ids), never derived from O₂ being an input;
  - `melt`: from the condition text (`融解塩`, `融解した氷晶石`, `アルカリ融解`), which replaces the `/酸|水|溶液/` test that made
    molten NaCl a pale aqueous bath; molten recipes are never "wet";
  - `T` and `process`: `PROCESS_T` (§10.7, with the caption temperature `Tcap` where `T` is a display clamp) and `processOf` (S12: `cell` for electrolyzer/battery recipes; `furnace` for
    blast-furnace, copper-matte, copper-converter, zinc-roast, lead-roast; `kiln` for lime-kiln; `pressure` for recipes whose
    condition is 高温・高圧; `column` for distillation separators; `vessel` otherwise);
  - `exo`: explicit list (slaking, so3-absorb, phosphoric); `indicator`, `catalyst`: §10.16; `gasIn`, `solidsIn`: inputs with a
    `LOOKS` entry, by state, in wet reactions; `dH`: §10.9.
- C3 `FLAMES` gains Li `#e8283c` and Sr `#a8001e` and a `sym` on every row (the second cue). `flamesFed` is unaffected.
- C4 `ANALYZER` (§10.11), `PLUMES` (§10.3, with H₂O and the `white` kinds) with `plumeOf`, `popLook` (S10: `'puff'` with the
  appearance hex for coloured products; `'light'` for colourless ones, whose `rgb` is unused: mapfx draws every 'light' pop and
  trail in the skin's neutral `POP_LIGHT`, M14, never `sub(id).color`, a `LOOKS` hex or a §10 hex), `STORE` (§10.15).
- C5 `thermo.ts`: ΔfH table and per-recipe ΔH (§10.9; CaCO₃ = −1207.6 kJ/mol), `PROCESS_T`, `processOf`.
- C6 `spectra.ts`: the blackbody table as constants (no runtime generation), `blackbodyHex(T)` (linear interpolation in
  gamma-2 between rows, clamped at 2000 °C), `G(T)`, `V(T)`, white-hot mix; atomic lines of Li, Na, K for R2.
- C7 `captions.ts`: §10.14 as data, each with source keys; helper `caption(key, vars)`. The in-game notice text (C-notice).
- C8 `subcard.ts`: the appearance sentence with forms, e.g. 「黒紫色の固体（蒸気は紫色、KI 水溶液に溶かすと褐色）」; a storage line
  where `store` is set; a ΔH line with its equation, every species with its state in Japanese (原則として化学式に状態を付記):
  「N₂(気) + 3H₂(気) → 2NH₃(気)　ΔH = −92 kJ」, rounded to integers. `thermo.ts` stores each species with its state (§10.9);
  rows with H₂O must say (液) or (気), because the value depends on it.
- C9 `colorsci.ts`: sRGB ↔ linear, CIELAB, OKLab/OKLCh, CIEDE2000 (Sharma, Wu, Dalal), WCAG contrast, Machado et al. 2009
  protan and deutan matrices at severity 1.0.
- C10 `src/dev/metrics.ts` (pure functions over RGBA arrays, used by R1-S's harness): display-luma percentiles, 3×3-cell
  medians, WCAG contrast between two point sets, ΔE00 at probes, 8×8 SSIM, HSV hue and OKLCh at points, changed-pixel share
  between frames (with an exclusion mask), Laplacian energy, ring/rim statistics for keep regions.

**Per tier.** Data only; identical in every tier.

**Budget.** Zero runtime cost; tables ≤ 40 KB of source.

**Acceptance (unit)**
- `tests/matter-data.test.ts`: every table equals §10 (the test holds a copy of each §10 table); every colour word extracted
  (§10.13's expression) from every `word`, form and analyzer result is in §10.13 — qualifiers (濃いと, 薄いと, がかった, 光で, 以外)
  and non-colour phrases (白濁, 赤熱, 青い炎, 明るい炎, 気体が発生, 光の通り道が見える) are not colour words; mock.ts colour questions still build;
  every species of every §10.9 equation carries a state, and every H₂O says (液) or (気); a `PROCESS_T` row whose `T` is a display
  clamp (thermite) has a `Tcap`, and no caption or sub-card line prints a clamp value as a temperature; the ninhydrin swatch has
  `cue: 'reagent'`; `burn` is set exactly for sulfur-burn, carbon-burn,
  co-burn, coke-burn, p4-burn and is false for copper-oxide, ostwald-2, zinc-roast, lead-roast, copper-matte,
  copper-converter; no recipe with 融解 in its condition is wet; `gasRatio('water-electrolysis')` = [2, 1] (H₂ : O₂); I₂ formed
  in water has `sol` brown; plume tint is `null` for every colourless gas of §10.3 and the hex for the six coloured ones; molar
  masses from `formula.ts` within ±0.1 of §10.3; class by the ±2 rule (HCN neutral); blackbody within one 8-bit step of §10.7;
  `G` monotonic, `G(450) = G(500) = 0`, `V(800) < 0.2`, `G(1500) > 0.9`; every `PROCESS_T` row has a source key and lead-roast
  has none; ΔH rows within ±0.5 kJ; `popLook` of every coloured product is `'puff'` and of every colourless product `'light'`.
- Distinctness (§10.10): flame set minimum ΔE00 ≥ 10 under normal vision and every flame has `sym`; under protan and deutan
  simulation every same-context pair below 10 has a `cue`; the five analyzer blue pairs and the ninhydrin swatch have
  `cue: 'reagent'`.
- `tests/chem-captions.test.ts`: every caption has ≥ 1 source key; a caption containing 上方置換 or 下方置換 also contains
  水に溶け; one containing 重い or 軽い (for gases) also contains 同じ温度; no caption calls P₄'s light 燐光; no caption puts
  ナトリウム灯 and 589 together; the Beilstein caption contains F 以外; every caption that `captionOf` can show on a white plume
  other than NH₄Cl or P₄O₁₀ contains 水滴 or 霧, and the steam and SO₃ plumes resolve to `steam`/`so3Fume` before any gas caption;
  `burn:S`, `burn:CO`, `burn:P4` exist for sulfur-burn, co-burn, p4-burn; the Tyndall caption contains 散乱 and not 光る; the
  ninhydrin caption and §10.11 use the same colour word as `knowledge.ts` (紫色); the C-notice contains 白い光の下.
- `tests/colorsci.test.ts`: CIEDE2000 matches the first ten pairs of Sharma's test data to 1e-4; WCAG contrast of known pairs;
  Machado matrices give the published values for pure red, green, blue.

### 6.M R1-M — Matter that teaches (every tier)

**Goal.** Every substance and reaction drawn as matter shows its exam appearance in every tier; the analyzer performs the real
tests; vents show real gases; only self-luminous things give light. Canvas2D and data only; no new GPU object.

**P0 (must ship)**
- M1 **Beer–Lambert liquids** (`vessel.ts`): a three-stop vertical gradient — meniscus `enc(T^0.5)`, half depth = the §10 hex
  exactly, bottom `enc(T^1.5)`, with `T = dec(hex)` per channel (sRGB decode/encode). A second solute draws its own gradient
  with `multiply` (Cu²⁺ + Fe³⁺ reads green, not "first ion wins"). Cached per (hexes, height in 8-px buckets, dark/light), LRU 64.
  Dark looks draw liquids as transmitted light (lighter glass behind), same stops. Mn²⁺ baths at α ≤ 0.15 (near clear).
- M2 **Solids by mode**: precipitate grains spawn ∝ progress, fall at 0.6 window-heights/s and pile (crystalline AgCl, PbSO₄,
  BaSO₄, CaCO₃ as small squares; flocs Al(OH)₃, Zn(OH)₂, H₂SiO₃ as translucent blobs α 0.6); turbidity (`turbid`) is a uniform
  veil, α 0.15 + 0.55·progress, never settling (SO₂ + H₂S, phenol release, limewater, acetylene); colloidal Fe(OH)₃ stays
  dispersed (uniform α 0.5).
- M3 **Immiscible layers** (`layer`): ester and ether float, nitrobenzene sinks, meniscus line between; ether is colourless
  glass tinted only by solutes.
- M4 **Gases in vessels**: bubble spawn ∝ `gasRatio` per outlet or electrode (counters `bubbles.cathode`, `bubbles.anode` in
  `matterProbe`); coloured product gases colour their bubbles and the headspace; `gasIn` gases enter as coloured bubbles that
  shrink and fade; NO is colourless inside and turns red-brown only at the mouth over 0.6 s.
- M5 **Flames and heat**:
  - heating burner (heated recipes without `burn` or incandescence): blue inner cone `#4a7bff`, faint outer flame `#9fb6ff`
    α 0.35; light kind `burner`, α ≤ 0.15;
  - `burn` (§10.6): the flame sits **on the burning material**, never as a cone under the vessel (that shape is the heating
    burner's, and the S flame is only ΔE00 5.4 from it): S blue `#4a6bff` on the burning sulfur inside the dark vessel (no
    molten-sulfur pool); CO blue `#3d6cff` in the gas stream at the outlet; C and coke a red-hot bed `#ff5400` without a tall
    flame; P₄ yellow-white `#fff1d6` with white smoke `#f4f4f0`; `burn` recipes get no heating burner; the plate carries the
    `burn:*` caption (M15);
  - incandescence (recipes with `T` and `G(T) > 0`): bath or bed in `blackbodyHex(T)` at α = `G(T)` over a dark interior
    `#2a1a14`, white-hot core mixed by `smoothstep(0.7, 1, G)`; molten-nacl bath (801 °C) with a silvery Na bead floating at the
    cathode; hall-heroult bath (960 °C) with molten Al collecting at the bottom; roasts and converters glow by `T`; lead-roast shows
    only its burner (no sourced T);
  - copper-oxide: red Cu turns black CuO as progress rises, burner below, no flame; ostwald-2: colourless gas turns red-brown, no
    flame, no burner (condition なし).
  - heat shimmer (mask R) only for `burn`, incandescence and `exo` (never on information, D5).
- M6 **Halogens in context**: I₂ formed in water is a brown I₃⁻ solution (`sol`), not black grains; HI decomposition shows violet
  vapour (`vap`); iodometry fades brown → colourless (blue-violet → colourless with starch).
- M7 **Electrodes**: product colour spreads from the correct electrode as a radial gradient whose radius grows with progress —
  KI: brown I₃⁻ at the anode; brine: Cl₂ (yellow-green) bubbles at the anode; CuSO₄: blue fades near the cathode as Cu deposits;
  copper refining: the anode thins, slime drops below it, the electrolyte stays CuSO₄ blue. Phenolphthalein pink at a cathode is
  drawn only together with the **indicator cue** (a dropper icon and the tag フェノールフタレイン on the information layer); water
  electrolysis shows no indicator. Recipe ids are taken from `recipes.ts` by equation; list them in the PR.
- M8 **Settler** (系統分離): reagent drop in its colour (K₂CrO₄ yellow; others colourless; H₂S as bubbles); filtrate colour by
  multiplicative mixing of the remaining ions; two phases of `e.prog`, "a little" then "excess" — NH₃: Cu(OH)₂ pale-blue cloud
  → deep-blue [Cu(NH₃)₄]²⁺ `#1b3fa8`; Zn(OH)₂ and Ag₂O redissolve colourless ([Zn(NH₃)₄]²⁺, [Ag(NH₃)₂]⁺); Fe(OH)₃ and Al(OH)₃
  stay. NaOH: Al, Zn, Pb hydroxides redissolve; Fe(OH)₃ red-brown, Cu(OH)₂ pale blue, Ag₂O brown stay. `mud-oh` red-brown;
  `sludge` multiplies its precipitates.
- M9 **Analyzer** (`analyzer.ts`, §10.11): reagent drop → colour develops over 0.4 s → the tube tilts toward 陽 or 陰. A result
  swatch ≥ 6 CSS px beside the tube is drawn as matter (probe point); the reagent name is always drawn on the information layer
  (the cue for the blue pairs). Flame tests: Pt wire into the blue burner; the outer flame flashes the element colour; the swatch
  carries the element symbol; light kind `flame`, α 0.5. Beilstein (`has_cl`): heated Cu wire, blue-green flame. Silver mirror
  (`silver`, `hyd_silver`, `oxald`): tube wall gradient `#d9dde2` → `#8d949c` with a highlight streak on the side facing
  `LightState.dir`. Tyndall (`tyndall`): a small side lamp is drawn beside the tubes and is the light (`fxOf` kind `lamp`); its
  beam crosses the colloid tube as a bright band (white, α 0.5, scene paint in every tier — scattered light is not an emitter, so
  never in the glow layer nor in R2's emit layer, D6) **and** crosses the true-solution tube beside it without a band; caption
  `tyndall`. Gas tests: colourless bubbles drawn as rings. Negative results
  keep the reagent colour ("no change"). Structural and theory tests keep the magnifier.
- M10 **Collector**: the vessel shows the method — 水上置換 inverted jar in a trough with the water level falling; 上方置換 inverted
  jar; 下方置換 upright jar filling from the bottom (coloured gases visibly); the drying agent from the condition (soda lime white
  granules, conc. H₂SO₄ wash bottle with bubbles, CaCl₂ white granules, P₄O₁₀ white powder); `jar-*` items and tank fills carry
  the gas colour inside clear glass.
- M11 **Keep** (`keep.ts`, D4): `markMatter*` marks only regions painted entirely by matter — vessel interiors with their glass
  back, result swatches, jar fills — and records each `(shape, id, hex)` **undilated** for `matterShapes(ctx, scale, dilate)`
  (fills every recorded shape, grown by `dilate`, into a context; L7's night punch and the probe use it) and `matterProbe()`
  (centre and expected hex of each region ≥ 6 px, the half-depth row for liquids); the GL mask write alone dilates by 3 CSS px.
  Every marked shape is bordered by ≥ 1.5 CSS px of ink (the outline's outer half or a dark plate), swatches included. Tokens,
  plumes, puffs and pops are never marked (they are lit with the world; §7.3 b3 checks their hue). Under `view.still` nothing is
  recorded.
- M12 **Lights** (`fxOf`, D6): burner, burn flame, incandescence (α ∝ G), analyzer flame flash, busy-machine work lamp in a neutral
  lamp colour (`255,214,140`, or the skin's UI glow in punk/lab), sensor channel lamps (UI colour, as today). Vents and tanks emit
  nothing (P₄ exposed to air is R2). Heat entries only for burn, incandescence, `exo`.
- M13 **Plumes** (`plumes.ts`, S4):
  - colour: `vap` → gas hex → steam for H₂O(g). Colourless gases are **hollow rings**: stroke 1 CSS px, `P.ink` α 0.35
    (light looks) or `P.soft` α 0.35 (dark looks), radius 0.15 → 0.5 tile, never filled, in every tier. Opaque white only for
    white smoke (NH₄Cl, P₄O₁₀) and white mist (SO₃ fumes: H₂SO₄ mist formed with moisture in the air; condensed steam).
    **Steam**: the first ≈ 0.3 tile above the source is drawn as rings (water vapour is colourless), white only beyond it (湯気 =
    droplets that formed as it cooled); captions `steam` and `so3Fume` (§10.14) name what the white is;
  - motion (screen up = rising): `vy = −0.8 · (28.8 − M)/28.8` tiles/s, plus a thermal term `−0.6·exp(−age/1.5 s)` for hot
    sources (burn, incandescence, exo, heated recipes); light gases fade faster (life ×0.7). **Heavy gases** sink on screen by at most
    the height of the vent mouth (≈ 0.3 tile): once a particle is 0.3 tile below the mouth, `vy = 0` and the cloud spreads outward as a pool (radius
    growth ×2, life ×1.5), so a north-up plan never shows gas falling forever or streaming south, and 低くたまる is what is drawn;
  - air chemistry every 4th frame on a 1-tile hash: where NH₃ and HCl particles share a cell, a white NH₄Cl puff (≤ 4 per second,
    consuming one of each); NO particles go from ring to filled `#a4532c` over their first 0.6 s;
  - busy machines emit exhaust particles only for reactions with a gaseous product, coloured by the same rules (none otherwise),
    through `reactPuff` (S4) from the `react` branch of `spawn()` (S0 body: today's dust puffs);
  - caps 60 / 120 / 200 particles (標準 / 高 / 最高); `calm`: plumes freeze at their spawn pose.
- M14 **Pops** (mapfx.ts): `popLook(id).mode === 'puff'` → drawn on the scene canvas with normal blending, α ≤ 0.5 (an absorbing
  puff: an NO₂ pop is a brown puff, not brown light), in the world pass before the night (§6.S S1.8); `'light'` → glow layer, in
  **one neutral UI colour per skin** `POP_LIGHT` (near-white, OKLCh C ≤ 0.03; never `sub(id).color`, a `LOOKS` hex or a §10 hex,
  so SO₂ and H₂S do not pop yellow nor NH₃ and NO blue), drawn after the night. Trails likewise. Train arrival rings stay
  identity-coloured (UI).
- M15 **Captions** (`captionOf`): one line under the reaction plate of the selected machine (and of every visible machine at the
  zoom where plates show), chosen in this order: indicator, flame test, **burn** (`burn:S`, `burn:CO`, `burn:P4`), Beilstein,
  Tyndall/mirror, incandescence, burner, plume (vents and collectors; `steam` and `so3Fume` before `heavyGas`/`lightGas`), ΔH (P1),
  storage (P1). Text only from §10.14.

**P1 (should ship)**: heat in/out by ΔH (exothermic: outward motes and shimmer; endothermic: motes stream in from the burner;
labelled 図解; never light); electrolysis ion sprites (≤ 40; cations to the cathode, anions to the anode; K⁺ crowds without
discharging); battery plates (Daniell: Zn thins, Cu thickens, each half-cell its own colour; lead-acid: PbSO₄ whitens both plates
on discharge); titration burette with indicator colour by pH and the indicator cue (neutralize-acetate phenolphthalein, scrub-nh3
methyl orange); storage dressing drawn on the container frame, contents untouched (§10.15); Cu catalyst red ⇄ black in
`formaldehyde`; ninhydrin flash on phoresis (spots 紫色, swatch `cue: 'reagent'`, §10.11); copper-oxide plate caption `noBurn:Cu`;
after acidic H₂S the settler filtrate turns from Fe³⁺
yellow-brown to Fe²⁺ pale green with faint S turbidity (caption in §10.14).

**Per tier.** Every P0 item in every tier. GL tiers add glow and bloom of the lights and the heat shimmer. Interiors redraw at
≤ 15 Hz in 標準 (cached image blitted between); off-screen vessels are not drawn.

**Budget.** §4.4 row R1-M; caches bounded, cleared on theme change, counted in `__fx.mem()`.

**Fallbacks.** Cache over budget → evict LRU; vessel smaller than 18 CSS px → swatch only.

**Acceptance**
- Unit `tests/matter.test.ts`, `tests/plumes.test.ts` (pure modules `vessel.ts`, `plumephys.ts`): the half-depth stop equals the
  hex exactly; Cu²⁺ + Fe³⁺ mix has OKLCh hue in 100–170°; the bubble scheduler gives cathode/anode = 2.0 ± 0.1 over 600 simulated
  frames for water electrolysis; light gases rise faster than heavy ones and HCN is neutral; NH₄Cl only where both gases are
  present; NO colour monotonic; particle caps; **no coloured light**: for every recipe in both busy states, no `fxOf` light
  carries a `LOOKS` or §10.4–10.5 hex (flame and blackbody colours are emission data and allowed), and for every colourless
  product `popLook` is `'light'` and the colour mapfx uses for its pop and trail is the skin's `POP_LIGHT` (C ≤ 0.03), never
  `sub(id).color`; heat entries only for burn, incandescence and exo; heavy gases: Cl₂ particles never go more than 0.3 tile below
  the vent mouth and the cloud radius keeps growing over 8 s; steam particles are rings for their first 0.3 tile; caches ≤ 64
  entries with bytes reported; nothing recorded under `still`; nothing but interiors with glass back, swatches and jar fills is
  marked.
- Playwright `?det&scene=chem` (note-light, lab-dark, punk-dark, arcane-light × 標準/高/最高 × 12:00/21:30):
  - sulfur-burn flame swatch HSV hue 215–245°, its flame inside the vessel and no burner cone below it, plate caption `burn:S`;
    copper-oxide, ostwald-2 and the roasts show no flame-coloured pixels (HSV hue 200–250°, saturation > 0.5) above their vessels; molten-nacl bath HSV hue 10–35° and saturation > 0.5 (not pale blue);
    H₂O₂ + KI liquid hue 20–45°, L\* 30–60; the `jar-NO2` fill within ΔE00 3 of NO₂; Solvay shows a white precipitate layer;
  - bubble counters cathode/anode = 2.0 ± 0.2 over 10 s;
  - settler: NH₃ excess filtrate within ΔE00 3 of `#1b3fa8`; NaOH excess keeps red-brown Fe(OH)₃;
  - analyzer: each P0 test's swatch within ΔE00 3 of its §10.11 hex (標準, 12:00); a reagent label is present on the
    information mask; Tyndall beam luminance in the colloid tube ≥ 1.15× the true-solution tube, the side lamp present on the
    emitter mask and the beam absent from it; silver wall luma range ≥ 0.25
    with the highlight on the `dir` side;
  - indicator cue: counters `indicatorDrawn` = `indicatorTag`;
  - plumes after 8 s: Cl₂ centroid lower on screen (by ≤ 0.3 tile below the mouth) and wider than H₂'s; coloured plume pixels
    keep their §10.3 hue within 15° in 標準 at 12:00 and agree between tiers at the same time within ΔE00 5 (§7.3 b3); the steam
    vent shows rings next to the mouth and white beyond 0.3 tile; within 1.5 tiles of colourless vents no pixel exceeds
    OKLab C 0.03 relative to the vent-off capture except ring pixels; near-white filled pixels (L\* > 90, C < 0.02) occur only
    between the NH₃ and HCl vents and at fume sources, in every tier; brown pixels downstream of the NO vent, not at it;
  - no coloured light: in lab-dark 最高 at 21:30 the floor 0.5–1.5 tiles from a CuSO₄ tank and a Cl₂ reactor differs by
    ΔE00 ≤ 2 from the same scene with them idle;
  - the gates M owns (§7.0): b1 (ΔE00 clause) and b3 at M's merge, the motion budget g and calm h, on this scene; a and c run on
    this scene at L's merge.
- Frame time (§4.5, cumulative against D0, with the A/A allowance): 標準 `chem` scene ≤ 1.05 + a; the three standard views
  ≤ 1.00 + a (L0 has merged before M).

---

## 7. Round 1 gates (run by R1-S on every merge, and on the final tree)

### 7.0 Gate owners
Every gate runs on every merge, but a gate **blocks** only from its owner's merge on (§5.2 order S1 → L0 → C → M → H → L). On a
merge before the owner's, the gate's metrics must be **no worse** than both the previous main and the D0 captures (per probe,
element, cell or frame pair). L0 is part of L for ownership: L's gates block at L's own merge, not at L0's.

| Gate | Owner (blocks from) |
|---|---|
| a matter, relative | L |
| b1 matter, absolute (ΔE00 clause) | M |
| b2 overlays over probe zones (α ≤ 10 %; L9 moves the lab window glare) | L |
| b3 plumes, puffs, pops (hue, tier agreement) | M |
| c rim | L |
| d legibility at 12:00 | S1 |
| d legibility at 16:00 and 21:30, and 3D | L |
| e night | L |
| f flash, i errors, j detail | every merge |
| g motion budget, h calm | M (S1.9 lands the `calm` part in render.ts first) |
| `chem` scene checks (§6.M) | M |
| §7.4 robustness | every merge (c and the photo check of e from S1, d from L, f from H) |
| §7.5 performance | per row (§4.5 for 標準) |

### 7.1 Build
`npm run typecheck`, `npm test` (all test files), `npm run build`; one HTML file; size growth recorded (R1 total ≤ +120 KB); no
new `package.json` dependency; no network request from `dist/index.html` beyond the existing Google Fonts link (Playwright request
log).

### 7.2 Capture matrix (`?det`, 1180×820 CSS at DPR 2, date 2026-11-12 unless stated)
- Near view (camera (43, 27.5), z 44, big save + showcase district): 8 looks × {標準, 高, 最高} × {08:00, 12:00, 16:00, 17:15,
  21:30} = 120 captures. The player's sessions are after school and in the evening; 16:00, 17:15 and 21:30 carry most weight.
- Light looks also at 2027-06-21 19:00 (summer evening: the sun is behind the window wall, `aS` → 0, the window sky `aW` carries
  the light).
- Ledger and perf views (§4.5): note-light z 12 at 21:30, punk-dark near, lab-dark big save, `chem`.
- Big save (203, 206, z 44) 最高 at 16:00 and 21:30; wide (z 12) 標準 and 最高 at 16:00.
- 3D 最高 × 8 looks × {16:00, 21:30}; far (z 6) × 8 looks × {16:00, 21:30}.
- Scenes: `chem` (§6.M), `legib` (§7.3 d), `shapes` (§6.H), `sprites` (§6.L), `night` (§6.L: open paper with an ink test
  pattern — `P.ink` strokes 3 CSS px wide, drawn as world decoration — in each cell of a 3×3 grid, every light look).
- A contact sheet per merge (`contact.mjs`). The integrator looks at it before merging.

### 7.3 Automatic gates (thresholds are merge blockers)
- **a. Matter, relative** (L): at every `matterProbe` point in the vignette-free centre, ΔE00(高, 標準) ≤ 2 and ΔE00(最高, 標準) ≤ 2
  at all five times (2D only). Today's worst is 9.7.
- **b. Matter, absolute**: **b1** (M) 標準 at 12:00, ΔE00(probe, expected hex) ≤ 3; **b2** (L) skin overlays drawn above contents
  have α ≤ 10 % inside probe zones; **b3** (M) plumes, puffs and pops (not matter-marked, D4): for pixels whose §10.3 colour has
  OKLCh C ≥ 0.05, OKLCh hue within 15° of the §10.3 hex in 標準 at 12:00, and ΔE00 ≤ 5 between tiers at the same time and
  condition.
- **c. Rim** (L): for every probe region ≥ 18 CSS px, each pixel of the ring 1–3 CSS px inside the true boundary is within ΔE00 3
  of the **標準 12:00 pixel at the same position** (the expected row of the M1 gradient, whose meniscus and bottom stops differ
  from the half-depth hex by ΔE00 7.6–22.9), 最高 at 21:30 and 標準 at 21:30 (the night punch, L7), 8 looks.
- **d. Legibility** (`?det&scene=legib`, R1-S): belts carrying one token of each shape (gas ○, liquid drop, solid □, `?` sample),
  a ×12 stack, a priority triangle, a selected machine's port arrows, status lamps in all six states (running, waiting, jammed,
  paused ‖, no recipe, bad input), a reaction plate with a caption, a resource label and the hub meter — each group placed on open
  ground; in the shadow of a tall machine at 16:00; one tile from a burning `p4-burn` reactor and a positive flame test; under a
  Cl₂ plume, an NO₂ plume and NH₄Cl smoke; at a shore; in the screen corner at 21:30; plus a sensor and a gate with channel
  numerals, a tank and a separator with formula tags, an electrolyzer with −/+ signs, held-extractor resource marks and the
  粒子の世界 caption (D5 members). Per element:
  - information elements, against the 標準 12:00 crop of the same element: glyph/plate contrast ≥ 3:1 and text ≥ 4.5:1 against
    the pixels around them (T0 makes `P.soft` text pass at baseline); SSIM ≥ 0.85; displacement 0 (`__fx.mask()` information
    alpha identical with heat shimmer on and off);
  - tokens (world, lit): (i) ΔE00 ≤ 10 against the 標準 crop of the same element at the same clock time and condition (tier
    agreement); (ii) for tokens with OKLCh C ≥ 0.05, OKLCh hue within 20° of the 12:00 open-ground 標準 crop; (iii) outline or
    plate contrast ≥ 3:1 against the belt (a lit token in a tall machine's shadow at 16:00 is ΔE00 11–12 from its noon colour, and
    13.7–17.2 under the 標準 night floor, by design);
  - status lamps: hue class (OKLCh hue band per state) and shape unchanged, also under protan and deutan simulation.
  Run for 8 looks × {標準, 高, 最高} × {12:00, 16:00, 21:30} (S1 owns 12:00, L owns 16:00 and 21:30). **3D** (L; D5 exception):
  3D 最高 against 3D 高 at the same camera and time, 16:00 and 21:30 — the contrast thresholds and status hue classes above, no
  SSIM against a 2D crop (the perspective crop cannot line up with it).
- **e. Night** (L; light looks, 21:30, all tiers, the `night` scene): darkest 3×3-cell median display luma ≥ 0.45; ink/paper
  ≥ 7:1 in every cell (the ink strokes vs the paper beside them; N's floors give 7.84, 7.37, 7.48 and 9.54:1); note-light and
  arcane-light: brightest/darkest 3×3-cell median of **relative luminance (linear Y)** ≥ 1.4 (N gives 1.61 and 1.45; a pool, not
  a veil) and GL tiers p95 display luma ≥ 0.80; |p50(標準) − p50(最高)| ≤ 0.08 (N is the same function in both).
- **f. Flash** (every merge): 10 s at 10 fps, no frame pair with > 10 % luminance change over > 25 % of the frame.
- **g. Motion budget** (M): simulation paused, camera static, 2 s: the share of map pixels changing by > 4/255 between frames ≤ 2 %
  outside emitters and particles (the emitter and particle masks of `__fx.mask()`, every tier); with `?gfx=off:ambient,plumes`
  (the registry also gates these Canvas2D layers) the remaining difference on an empty region is 0.
- **h. Calm** (M): simulation paused, `calm` on: two frames 2 s apart are hash-identical (S1.9: decorative animation at t = 0,
  steady state blinks).
- **i. Errors** (every merge): across the whole matrix, `pageerror` = `console.error` = `frameFault` = 0 and `gl.getError()` (checked once per frame
  in `?det`) = 0.
- **j. Detail** (every merge): Laplacian energy of the map region per look ≤ baseline + 5 % (R1 adds no texture).

### 7.4 Robustness
- a. Context loss and restore twice in a row (`WEBGL_lose_context`): no error; a frame renders; `__fx.mem()` returns to its
  previous counts.
- b. Hygiene: 標準 ↔ 高 ↔ 最高 ↔ 3D toggled 10 times and 8 theme switches: GL targets and bytes, live canvases and bytes, and every
  registered cache return to their start values (the chunk cache is bounded by F35 and reported separately).
- c. `?gfx=slow:50`: the ladder walks its rungs in order (§6.S); `?gfx=slowsim:50`: no rung, no stored `dprCap`; under `?det`
  both add synthetic frame time instead of busy-waiting (D8).
- d. `?gfx=nof16`: B8 bloom path renders; no error.
- e. Save and load, floor switch, theme switch mid-session; an album photo (`view.still`) taken during a 最高 frame leaves the next
  main frame hash-identical to a run without the photo; a 画面写真 (`takeShot`) in 高 and in 最高 contains the information pixels
  (its `#info` region equals `__fx.capture()`'s), also when taken on a frame after a skipped rAF.
- f. `?gfx=off:shape` → baked shadows, no error; `?gfx=throw:shape` (test hook) → the feature is disabled with one toast and no
  further frame faults.
- g. A tier or 3D toggle builds no chunk beyond those the DPR rung forces (`__fx.chunks()`). (A look toggle rebuilds the visible
  chunks through `onThemeChange`; that is expected and not gated.)

### 7.5 Performance (§4.3 methods; minimum of 3 ABAB runs; every ratio gate `g` passes at `≤ g + a`, `a = max(0.02, 2·|A/A − 1|)`)

| View | Gate |
|---|---|
| 標準, the three standard views (note-light z 12 at 21:30 / punk-dark near / lab-dark big) | packages claiming ≤ 0 (S1, L0, C, H, L): `__fx.c2d()` total calls and total painted area ≤ the reference (D0, plus M's accepted delta after M), timing informational; M and the final tree: timing vs D0 ≤ 1.00 + a (§4.5) |
| 標準 `chem` scene | M and the final tree: timing vs D0 ≤ 1.05 + a |
| 高 compositor, all looks | ≤ 1.05 + a |
| 最高 compositor, non-lab looks | ≤ 1.05 + a |
| 最高 compositor, lab-dark | ≤ 0.75 + a |
| 最高 shape path vs legacy SHADE path | ≤ 1.00 + a |
| ALU proxy per FINAL variant and look (worst uniform values over the capture times) | ≤ baseline + 30 instr/px (non-lab), ≤ baseline − 40 (lab) |

### 7.6 Device check (end of R1, with the player; entry criterion of R2)
On the player's iPad (and an Android tablet if one is available): 最高 near view at 21:30 in all 8 looks with `?perf`; p50/p95 noted;
`?gfx=selftest` checksum pasted into `docs/GRAPHICS.md`; a visual check at 16:00 and after 17:30 (one light direction, readable
night, exam colours, labels crisp).

### 7.7 Documentation
`docs/GRAPHICS.md`: the light frames (D1, in Japanese for the in-game help too), tier matrix (§5.7), budgets with measured ALU and
ratio numbers, the 標準 ledger, kill switches, known limits. The in-game notice (C-notice, §10.14).

---

## 8. Round 2 (world fields and measured light)

### 8.1 Entry criteria
1. R1 merged; every §7 gate green on main.
2. The device check of §7.6 is done; any look over p95 20 ms at 最高 21:30 on the iPad has a named cause.
3. The player has seen the R1 contact sheet and the game on their device, with no open legibility complaint.
4. `docs/GRAPHICS.md` records R1's ALU and fetch numbers per variant.
R2 runs as five parallel packages; R2-WD merges first and R2-GI merges only after it.

### 8.2 R2-WD Watchdog and device bench (critique 0 B3, suggestions 2, 6, 8, 16, 19)
- Inner, value-ranked shedding (`{ id, estMs, value }` per feature) only when the frame is **GPU-bound** (a `fenceSync` of frame N
  still unsignalled at N+2) and main-thread work is < 70 % of the cadence; thresholds relative to the chosen cadence.
- Cadence detection: `dt` clustered at 33.3 ± 1.5 ms with main-thread work far below it = capped (iOS Low Power Mode): never shed,
  never persist. Mid Android may choose paced 30 fps (render every second rAF) instead of shedding.
- Grace periods as R1; multi-frame features split into equal per-frame slices (no heavy even frames); one toast per episode;
  shedding frees the feature's GPU memory; one step back up after 30 s of margin.
- `?gfx=bench`: synchronous 1-px `readPixels` per frame on devices; 60 s warm-up; ABAB on/off per feature; fixed camera path (near,
  big, wide); `window.__bench` JSON and an overlay; results replace `estMs` and go into `docs/GRAPHICS.md`.
- Starting tier: a ≈ 1 s synthetic probe on the title screen (FINAL + GI-B, 1-px `readPixels`) and the renderer string choose the
  initial tier and GI level; faster shedding in the first 10 s.
- Thermal soak: 20 min of punk-dark 最高 at 21:30 with GI on, p50/p90 per minute, judged at minute 20.
- Floor class acceptance: 標準 ≥ 30 fps at DPR ≤ 1.5 on an A10/A12 iPad or a Mali-G52 tablet.
- FINAL uniforms in one std140 UBO updated once per frame; GL targets allocated with slack and drawn into a viewport.

### 8.3 R2-GI 2.5D global illumination (radiance cascades, gi.md; SPEC.md §7.3–7.6 as the base design)
- Inputs: an emit layer drawn **only** from `fxOf` lights (D6), packed beside the glow layer in one canvas (one upload), allocated
  only while GI is enabled; `tShape` from R1-H; light plane Hp = 0.33.
- Activation: 最高, flat, near, (dark look or `night > 0.15`), at least one emitter in view. Budget it as on in most sessions.
- Compile: FINAL bit `GI` and the cascade programs compile lazily on first activation (≤ 1 link per frame without the KHR
  extension). GI's resolve writes a 1/2-CSS "light" target that FINAL taps once; the key pool and shadow terms move there too.
- Formats: RGBA16F only with the float-readback probe; without it GI is off. Levels A and B; B's cascades in equal per-frame slices.
- Learning: a positive flame test lights the floor around the analyzer in its flame colour; per-element brightness (Na far brighter
  than K); decorative emitters within 4 tiles of an analyzer keep ΔE00 ≥ 10 from every flame-test colour.
- `calm`: no flicker, temporal α ≤ 0.35; `?det`: jitter frozen.
- Gates: synthetic scene (floor hue 1.5 tiles from each burner within 20° of its flame hue; behind a wall ≤ 0.5× the lit side; light
  passes through gaps); calibration (GI-on mean luminance within ±5 % of GI-off); temporal stability; all R1 gates unchanged;
  device bench GI-B ≤ 1.0 ms on the Android tablet and GI-A ≤ 1.5 ms on the iPad.

### 8.4 R2-W Water field (critique 0 B4, B8; critique 1 erratum 6; critique 2 B7, B9)
- SPEC.md §9.1's design (per-chunk exact distance transform, toroidal world-anchored texture, world-space normals, Fresnel, glint)
  with these changes: square slot grid sized from max(cssW, cssH) at the minimum water zoom; a per-slot tag texture and a fallback
  to mask water when a slot's tag does not match; minimum zoom per viewport.
- World-anchored patterns use the scheme R1 already applies to the carried water (§6.L L3a): a CPU-snapped world origin (fp64,
  period 256 tiles), integer-cell noise with CPU-split lattice offsets, `highp int`, and phases accumulated on the CPU (no
  `time % 1000` jump).
- Chunks bake a neutral base only (flat bed colour, shore line); FINAL modulates it (D7). S5
  `paintWaterTile(g, P, tx, ty, px, py, ts, zone)` gains the tile-size argument; `waterField(cx, cy)` hook for the distance field.
- Absorption ratio from Pope & Fry (a(650) : a(550) : a(450) ≈ 0.34 : 0.0565 : 0.0092, i.e. ≈ 0.45 : 0.075 : 0.012 normalised), or no
  attribution.
- Legibility without lamps, every tier and look at 16:00 and 21:30: shore line ≥ 3:1 against the floor; water/floor ΔE_OK ≥ 0.10;
  arcane-light water OKLab chroma ≥ 0.04 at hue 200–260°. Anchoring and DPR-independence gates (SPEC.md §9.5).

### 8.5 R2-G Gas field (critique 0 B4, suggestions 14, 17, 18; critique 1 B6, suggestion 17; critique 2 B8.7, B10.7)
- SPEC.md §9.2's design, 最高 only, with: a square grid sized from max(cssW, cssH) at the activation zoom; equal round-robin step
  slices (coupled species in the same target); point-sprite source splats; a small subtractive floor against fp16 stalls (JS
  reference with fp16 rounding).
- No displacement on information; ≤ 1 CSS px on belts and tokens; heavy-gas absorption skipped where `tShape` height exceeds the
  gas layer.
- 気体レンズ: its own CVD-safe 8-colour palette (Okabe–Ito), outlines or hatching with formula labels rather than fills, caption
  「色は目印。実際は無色」. Captions follow §10.14's rules (solubility first for 置換; same temperature for buoyancy).

### 8.6 R2-T Teaching extras
Faraday meter on electrolyzers (deposit thickness and gas volume from one Q/F); AgCl darkening on open belts and in clear tanks
while daylight is on (a saved per-entity field with serializer and F40 validator; an `itemToken` seam for belt tokens); P₄ glow
`#bfe8ff` where exposed to air at night (化学発光, never 燐光); spectroscope strip with atomic lines only (Li, Na, K; caption
輝線スペクトル); K flame vignette with cobalt glass (直接は淡紫、コバルトガラス越しに赤紫; Na masking); NO₂ ⇄ N₂O₄ as a labelled
illustration on NO₂ tanks (「2NO₂ ⇄ N₂O₄（無色）ΔH < 0。冷やすと淡く」, 図解); 熱の出入り lens with equations; cryogenic air
separation (frost, pale-blue liquid O₂, N₂ leaves first). Cleanup (integrator): legacy paths deleted; 3D mipmaps decided by
measurement (`texStorage2D` + `texSubImage2D` vs today); near ↔ far crossfade fades the near-only terms.

---

## 9. Round 3 (eight looks: art direction)

### 9.1 Entry criteria
R2 merged (or GI dropped after its bench); fix/skins merged (its token values are the starting point; no new `backdrop-filter`
over the live canvas); the harness green; the player approves a direction board built from idea-art.

### 9.2 Packages
R3-note, R3-punk, R3-arcane, R3-lab (each both themes: key shapes, value plan, palette, materials, one ambient layer, signature)
and R3-X (crisp ground: per-frame grid path with minor lines faded below z 16 and snapped to device pixels; hi-res chunk bucket
with a `requestIdleCallback` fallback (`setTimeout` and time slicing by tile rows), F35 counting the bucket's real bytes, a
one-chunk prefetch ring and a 150 ms crossfade; process silhouettes by `processOf` matching `FOOTPRINT`, with the 3D decision —
cylinder instances for disc kinds or square boxes — made explicitly; overlays (heat squares, selection rings, jam cells) on
`FOOTPRINT`; UI tokens; far.ts colours moved to shared tokens with a near/far token test; a hub per skin; the 見やすさ優先
preference built on the kill switches).

### 9.3 Rules carried from the critiques
- Key shapes (window patch, mullion moon window, 黒板灯 row) are drawn by FINAL in GL tiers; 標準 shows none by day. The
  arcane-dark moon uses a real lunar position and phase (Astronomical Almanac low-precision formula; window dark when the moon is
  down); its god rays use a window-mask source, never the bright pass.
- Sodium masts (punk-dark): caption 高圧ナトリウムランプ（圧力で線が広がる）; no "same 589 nm" sentence; masts only on empty dry tiles,
  head ≤ 0.2 tile, re-placed when `world.version` changes; their pools pass the legibility gate.
- Lab-light spectrum strips: curated `BANDS` (§10.12), sourced rows only; only beside the selected or hovered belt; plain white
  otherwise.
- Arcane circles: lattice of the substance handled (§10.12 lattice table); compounds get their own lattice type or none; bcc and
  fcc metals may use the top-down [001] projections of §10.12; **NaCl type, zinc blende, fluorite, hcp and diamond are always drawn
  as the oblique cube**, ionic types with two ion colours (seen along [001], rock salt puts an ion on every projected fcc site and
  would look like Cu or Ag); lattice name and coordination number engraved; rotation ≤ 6°/s; circles within the footprint + 0.25
  tile and under the belts. The unit tests of §10.12 are normative.
- Luminol (lab-dark): milestone events only, or ≤ 1 per 2 s per screen; hue ≥ ΔE00 10 from the burner (e.g. `#7a5cff`, ΔE00 12.4);
  caption ルミノールの化学発光を使った完了ランプ.
- Discharge tubes: channel numerals; channel 5 labelled 水銀（アルゴン入り）; decorative emitters away from analyzer flame colours.
- Iron-gall ink links to the FeCl₃ test for phenols (black = Fe³⁺–polyphenol complex), never "Fe³⁺ is black".
- Galvanised steel: white rust only on トタン; red rust only on bare steel or at ブリキ scratches.
- Cyanotype: the confirm animation only; the paste preview keeps 置ける所は蛍光、ふさがっている所は赤 and the CVD ✕; any outline
  ≥ 3:1 on every ground.
- Pencil hatching (note-light): only the cast-shadow term (AO stays a ≤ 5 % multiply); fades out below z 20; never on belts or
  machine edges (`tShape` class).
- 消し残し (note-dark): hit-testing only with the 見る tool, through main.ts; empty tiles only, never within one tile of a port; a
  smudged style distinct from labels; shows the card's prompt side (reactants → ?).
- Motion: strip pulses out of phase with item motion; nothing animates within 0.3 tile of a port arrow.
- Gates: value plans (idea-art §2.2) at 15:00 **and** 21:30 for light looks; arcane-dark with the moon up, down and at new moon;
  chroma budget with `__fx.mask()`; anchoring; legibility; motion budget; thumbnail identification by a reviewer.

### 9.4 Not scheduled
Molecule dive and bond ledger (T7/3.1), SDF relightable machine bodies (T8), procedural ground (T10), cartographic far map (T11),
Kyoto seasonal weather and acid rain (T9), GI in 3D, crystal lens (3.9), wrong-answer vignettes (3.12), picture review cards.

---
## 10. Chemistry data (normative; R1-C ships it, tests pin it)

Hex values are sRGB, chosen (chem.md) to match the textbook colour word at a typical test-tube concentration and to read on paper
and on dark floors; where the game's hex already matched, it is kept. Critique 1 re-checked every value below (its §B) unless a
row says otherwise. Source keys are in §11.2. "word" = the stored textbook word.

### 10.1 Flame tests (`FLAMES`; every flame is drawn with its element symbol)
| Element | Word | Hex | Notes | Source |
|---|---|---|---|---|
| Li | 赤色 | `#e8283c` | 670.8 nm | [C1][N2] |
| Na | 黄色 | `#ffd43a` | 589.0 / 589.6 nm (D lines) | [C1][N2] |
| K | 赤紫色 | `#c98bff` | 766.5 / 769.9 + 404.4 nm; seen directly 淡紫, through cobalt glass 赤紫 | [C1][N2][JF] |
| Ca | 橙赤色 | `#ff7b3a` | molecular bands | [C1] |
| Sr | 紅色（深赤色） | `#a8001e` | crimson, darker and less blue than Li; ΔE00 14.8 from Li | [C1][FT] |
| Ba | 黄緑色 | `#b9e24a` | | [C1] |
| Cu | 青緑色 | `#3ad9b4` | also the Beilstein colour: detects Cl, Br, I, not F | [C1][BE] |
| gas burner, air adjusted | 青い炎 | inner cone `#4a7bff`, outer `#9fb6ff` (art) | an orange flame is incomplete combustion | [CT] |

### 10.2 Combustion flames and self-luminous matter
| What | Word | Hex | Round | Source |
|---|---|---|---|---|
| S burning | 青い炎 | `#4a6bff` | R1 | [C30] |
| CO burning | 青い炎 | `#3d6cff` | R1 | [C31] |
| C (coke) burning | 赤熱 | `#ff5400` (≈ 900 °C, §10.7) | R1 | [D1] |
| P₄ burning | 明るい炎 + 白煙 | flame `#fff1d6`, smoke `#f4f4f0` | R1 | [C32] |
| P₄ exposed to air (dark) | 青白く光る（化学発光） | `#bfe8ff` | R2 | [JP4] |
| luminol | 青白い化学発光 (λmax 425 nm) | R3: a hex ≥ ΔE00 10 from the burner, e.g. `#7a5cff` | R3 | [LU1][LU2] |

### 10.3 Gases and plumes (air = 28.8, N₂ : O₂ = 4 : 1; class: heavy if M > 30.8, light if M < 26.8, else neutral)
Coloured (plume and vessel colour): Cl₂ 黄緑色 `#b9cf4a` (70.9, heavy) [C46]; NO₂ 赤褐色 `#a4532c` (46.0, heavy) [C15]; O₃ 淡青色
`#a9cfe8` (48.0, heavy) [C16]; F₂ 淡黄色 `#e6e2a0` (38.0, heavy) [C47]; Br₂ vapour 赤褐色 `#b0482a` (159.8, heavy) [C21]; I₂
vapour 紫色 `#9b4fd0` (253.8, heavy) [C22][C4].
Colourless (plume = rings, tint `null`): N₂ 28.0 neutral · O₂ 32.0 heavy · H₂ 2.0 light · NH₃ 17.0 light · NO 30.0 neutral (browns
in air → `#a4532c`) [C34] · SO₂ 64.1 heavy · HCl 36.5 heavy · CO₂ 44.0 heavy · CO 28.0 neutral · H₂S 34.1 heavy · HI 127.9 heavy ·
HF 20.0 light · CH₄ 16.0 light · C₂H₄ 28.1 neutral · C₃H₆ 42.1 heavy · C₂H₂ 26.0 light · HCHO 30.0 neutral · CH₂=CHCl 62.5 heavy ·
C₂H₄O 44.1 heavy · CH₃Cl 50.5 heavy · HCN 27.0 **neutral** · 1,3-butadiene 54.1 heavy · H₂O 18.0 light (water vapour is
colourless; its plume is steam, below) [JYG]. Molar masses from `formula.ts` (±0.1).
White plumes (opaque white, the only white plumes), each with a caption that says what the white is:
- white smoke (solid particles): NH₄Cl 白煙 `#f4f4f2` (NH₃ + HCl) [C18][C45]; P₄O₁₀ `#f4f4f0` [C32];
- white mist (droplets): SO₃ fumes `#f4f4f2` — SO₃ itself is colourless; the white is sulfuric-acid mist formed with moisture in
  the air (caption `so3Fume`) [C48]; steam `#f2f4f6` — rings for the first ≈ 0.3 tile above the source (水蒸気 is a colourless
  gas), white only beyond it, where it has cooled into droplets (湯気 is liquid; caption `steam`) [JYG].
Jars: `jar-<gas>` = clear glass with the gas colour inside, or clear for colourless gases.

### 10.4 Ions, solutions and indicators
| Species | Word | Hex (dilute / conc.) | Source |
|---|---|---|---|
| Cu²⁺ (CuSO₄, Cu(NO₃)₂) | 青色 | `#7fb6e8` / `#3b82d6` | [C5][C39] |
| CuCl₂ aq | 青色（濃いと青緑色） | `#3aa0c8` | [C20] (wording uncertain, §12) |
| [Cu(NH₃)₄]²⁺ | 深青色 | `#1b3fa8` | [C10] |
| Fe²⁺ | 淡緑色 | `#b9d8b0` | [C7] |
| Fe³⁺ (FeCl₃) | 黄褐色 | `#b98a2c` | [C7][C29] |
| Fe³⁺ + SCN⁻ | 血赤色 | `#9a0a10` | [C10] |
| MnO₄⁻ | 赤紫色 | `#8e2a7e` | [C7][C40] |
| Mn²⁺ | ほぼ無色（淡桃色） | `#f0dfe3`, drawn at α ≤ 0.15 | [C7] |
| CrO₄²⁻ | 黄色 | `#f2c81e` | [C5] |
| Cr₂O₇²⁻ → Cr³⁺ | 橙赤色 → 緑色 | `#e8641e` → `#3f8f5a` | game test text (§12) |
| I₂ in KI aq (I₃⁻) | 褐色 | `#c08a3a` / `#8a4a14` | [C7][C8] |
| I₂ + starch | 青紫色 | `#3b2a8a` | [C22][C7] |
| Br₂ water | 赤褐色（薄いと黄褐色） | `#c8642a` | [C21] |
| Cl₂ water | 淡黄緑色 | `#e3eba0` | (§12) |
| Fehling's solution | 深青色 | `#1f4fb0` | [C25] |
| colourless ions (Ag⁺, Pb²⁺, Al³⁺, Zn²⁺, Ca²⁺, Na⁺, K⁺, Ba²⁺; ammine and hydroxo complexes of Ag, Zn, Al) | 無色 | transparent | general |

Indicators [C38]: phenolphthalein 無色 → 赤色（淡赤色）`#ffb3cf` (faint) / `#ff5fa2`, 8.0–9.8; methyl orange 赤色 `#e0362a` → 黄色
`#f2b81e`, 3.1–4.4; BTB 黄色 `#e8d02a` → 緑色 `#3faa5a` → 青色 `#2a6ad0`, 6.0–7.6; litmus 赤色 `#d8404a` / 青色 `#3a5ad0`.

### 10.5 Precipitates and solids
| Substance | Word | Hex | Source |
|---|---|---|---|
| AgCl | 白色（光で紫 → 黒） | `#f4f4f1` → `#8a7a9a` → `#3a3640` (darkening is R2) | [C33][C2] |
| PbCl₂, PbSO₄, CaCO₃, CaSO₄, BaSO₄ | 白色 | `#f4f4f1` / `#f2f1ec` | [C2][C56] |
| Al(OH)₃, Zn(OH)₂, Pb(OH)₂ | 白色（Al はゲル状） | `#f2f2ee` | [C57][C59] |
| ZnS | 白色 | `#f3f3ef` (natural ore `#4a2a1e`) | [C37] |
| CuS, PbS, Ag₂S, FeS | 黒色 | `#222226` | [C2][C55][C58] |
| Fe(OH)₃ | 赤褐色 | `#9a4a26` | [C54] |
| Cu(OH)₂ | 青白色 | `#a9cfe2` | [C9][C44] |
| Ag₂O | 褐色 | `#6a4a32` | [C42] |
| PbCrO₄ | 黄色 | `#e8c62a` | [C10] |
| Ag₂CrO₄ | 赤褐色 | `#8f3a26` | [C43] |
| Cu₂O (Fehling) | 赤色 | `#b8321e` | [C25] |
| CHI₃ (iodoform) | 黄色 | `#f2d23a` | [C28] |
| Prussian blue | 濃青色 | `#1f3a8a` | [C7] |
| NaHCO₃ (Solvay), CaSO₃ | 白色 | `#f6f6f3` | general |
| S from SO₂ + H₂S | 白濁（淡黄白色） | turbidity `#efe9c4` | [C17] (wording, §12) |
| `mud-oh` (Fe(OH)₃ + Al(OH)₃) | 赤褐色 | `#b0603a` | [C54][C57] |
| I₂ solid | 黒紫色 | `#3a2440` | [C22] |
| CuSO₄ anhydrous / aq | 白色 / 青色 | `#eceae4` / `#3b82d6` | [C2][C39] |
| CuCl₂ anhydrous / aq | 褐色がかった黄色 / 青色 | `#a0702a` / `#3aa0c8` | [C20] |
| Cu / CuO | 赤色 / 黒色 | `#c8733f` / `#222224` | [C3] |
| Fe₂O₃ / Fe₃O₄ | 赤褐色 / 黒色 | `#9a3a22` / `#26262a` | [C41] |
| V₂O₅ catalyst | 黄〜橙色 | `#e8a83a` | [C23] |
| MnO₂ | 黒色 | `#28262a` | [C40] |

### 10.6 Burning (`ReactionLook.burn`, explicit)
| Recipe | Flame | Notes |
|---|---|---|
| `sulfur-burn` | blue `#4a6bff` | drawn over the dark vessel; no molten-sulfur pool (sulfur far above its melting point darkens; critique 1 C18) |
| `co-burn` | blue `#3d6cff` in the gas | |
| `carbon-burn`, `coke-burn` | red-hot bed `#ff5400`, no tall flame | |
| `p4-burn` | yellow-white `#fff1d6` + white smoke `#f4f4f0` | |

Not burning (no flame): `copper-oxide` (Cu turns black CuO; burner below) [C3]; `ostwald-2` (spontaneous at room temperature, colourless
→ 赤褐色) [C34]; `zinc-roast`, `lead-roast`, `copper-matte`, `copper-converter` (incandescence by temperature, §10.7). `hcl-synthesis`
(H₂ burning in Cl₂) is not drawn as a flame until a source for its flame wording is added (§12).

### 10.7 Incandescence and process temperatures
Blackbody colour (Planck spectrum through the CIE 1931 fit; critique 1 verified against the Helland fit within a few 8-bit steps):

| T (°C) | 450 | 525 (Draper) | 600 | 700 | 800 | 900 | 1000 | 1200 | 1400 | 1500 | 1600 | 1800 | 2000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hex | `#ff0000` | `#ff1a00` | `#ff2a00` | `#ff3b00` | `#ff4900` | `#ff5400` | `#ff5e00` | `#ff6e00` | `#ff7b00` | `#ff8100` | `#ff8600` | `#ff9120` | `#ff9b36` |
| log₁₀(Y/Y₆₀₀) | −2.37 | −1.08 | 0 | +1.19 | +2.17 | +2.99 | +3.68 | +4.80 | (interp.) | +6.02 | (interp.) | (interp.) | +7.36 |

`G(T) = clamp((log₁₀(Y/Y₆₀₀) + 1.2)/7.5, 0, 1)` (0 below ≈ 520 °C: glow starts near the Draper point, 525 °C [D1]); white-hot
core mix `smoothstep(0.7, 1.0, G)` toward `#fff1d6`; daylight visibility `V(T) = smoothstep(1.5, 4.0, log₁₀(Y/Y₆₀₀))`.

`PROCESS_T` (all sources checked 2026-11-12):
| Recipe | T (°C) | G | Source |
|---|---|---|---|
| `haber-bosch` | 500 | 0 (does not glow) | [WHB] "500 °C" for most plants |
| `contact` | 450 | 0 | [WCP] "typically around 450 °C" |
| `ostwald-1` (Pt gauze) | 800 | 0.45 | [JOS] 800 °C |
| `cracking` | 850 | 0.50 | [WSC] "around 850 °C" |
| `molten-nacl` | 801 | 0.45 | [WNaCl] mp 800.7 °C |
| `hall-heroult`, `hall-heroult-co` | 960 | 0.61 | [WHH] 940–980 °C |
| `lime-kiln` | 900 | 0.56 | [WLK] "about 900 °C" |
| `zinc-roast` | 980 | 0.63 | [WZS] suspension roaster about 980 °C |
| `copper-matte` | 1100 | 0.73 | [WCE] matte about 1100 °C |
| `copper-converter` | 1100 (lower bound: the matte entering) | 0.73 | [WCE] |
| `blast-furnace` | 1500 | 0.96 | [SU] hot metal at tapping 1480–1520 °C (the hearth; [WBF]'s 1500–1600 °C is the oxygen blast furnace's combustion zone and is not used) |
| `thermite` | 2000 = display clamp, colour only; caption `Tcap` 「約 2500 ℃（鉄がとけるほどの高温）」 | 1 | [WTH] up to about 2500 °C in practice; adiabatic ≈ 2860 °C (3135 K). [JTH] gives 約3100度 without a unit (it is kelvin) and is not used for the number |
| `lead-roast` | none (no sourced value: burner only) | — | §12 |

A row whose `T` is a display clamp carries `Tcap`, the temperature text the captions print; `incand`/`noglow` print `Tcap` when
present and `約 {T} ℃` otherwise, so no caption ever prints the clamp (tested).

Light-source colours: candle 1850 K `#ff8500`; tungsten 2700 K `#ffae59`; LED 4000 K `#ffd4a5`; panels 5000 K `#ffe7d0`.

### 10.8 Lamps and discharge tubes (R3 data)
Low-pressure sodium: **not drawn** (no hex: it would show a second 589 nm colour beside the Na flame `#ffd43a`). High-pressure sodium: pressure-broadened, D line
self-reversed, art `#ffb24d`; never described as "the same 589 nm light as the flame" [SL]. Tubes (hue from NIST strong lines,
display hex art-directed) [N1]: Ne `#ff5b2e`, He `#ffa08f`, Ar `#b469ff`, Kr `#e6c8ff`, Hg in Ar `#8fb0ff` (label
水銀（アルゴン入り）).

### 10.9 Reaction enthalpies (`thermo.ts`; ΔfH at 298 K [OS], CaCO₃ = −1207.6 kJ/mol [ET]; 発熱 = ΔH < 0)
Every species is stored with its state at 298 K and drawn in Japanese, as Japanese textbooks write equations with ΔH
(原則として化学式に状態を付記): (気), (液), (固); carbon as C(黒鉛), sulfur as S(斜方), white phosphorus as P₄(黄リン) — the
reference forms of the ΔfH data. Rows with H₂O say (液) or (気) because the value depends on it. The sub-card and the `dH`
caption print the equation exactly as in this table, with ΔH rounded to an integer: 「N₂(気) + 3H₂(気) → 2NH₃(気)　ΔH = −92 kJ」.

| Recipe | Equation | ΔH (kJ) |
|---|---|---|
| `haber-bosch` | N₂(気) + 3H₂(気) → 2NH₃(気) | −91.8 |
| `contact` | 2SO₂(気) + O₂(気) → 2SO₃(気) | −197.8 |
| `sulfur-burn` | S(斜方) + O₂(気) → SO₂(気) | −296.8 |
| `hcl-synthesis` | H₂(気) + Cl₂(気) → 2HCl(気) | −184.6 |
| `carbon-burn` | C(黒鉛) + O₂(気) → CO₂(気) | −393.5 |
| `co-burn` | 2CO(気) + O₂(気) → 2CO₂(気) | −566.0 |
| `coke-burn` | 2C(黒鉛) + O₂(気) → 2CO(気) | −221.0 |
| `co2-reduce` | CO₂(気) + C(黒鉛) → 2CO(気) | +172.5 |
| `lime-kiln` | CaCO₃(固) → CaO(固) + CO₂(気) | +179.2 |
| `slaking` | CaO(固) + H₂O(液) → Ca(OH)₂(固) | −64.5 |
| `soda-ash` | 2NaHCO₃(固) → Na₂CO₃(固) + H₂O(気) + CO₂(気) | +135.6 |
| `steam-reforming` | CH₄(気) + H₂O(気) → CO(気) + 3H₂(気) | +205.9 |
| `methanol` | CO(気) + 2H₂(気) → CH₃OH(気) | −90.5 |
| `ethylene-hydration` | C₂H₄(気) + H₂O(気) → C₂H₅OH(気) | −45.4 |
| `ostwald-1` | 4NH₃(気) + 5O₂(気) → 4NO(気) + 6H₂O(気) | −906.3 |
| `ostwald-2` | 2NO(気) + O₂(気) → 2NO₂(気) | −114.1 |
| (R2 illustration) | 2NO₂(気) → N₂O₄(気) | −55.3 |
| `thermite` | 2Al(固) + Fe₂O₃(固) → Al₂O₃(固) + 2Fe(固) | −851.8 |
| `blast-furnace` | Fe₂O₃(固) + 3CO(気) → 2Fe(固) + 3CO₂(気) | −24.8 |
| `hi-decomp` | 2HI(気) → H₂(気) + I₂(気) | +9.5 |
| `water-electrolysis` | 2H₂O(液) → 2H₂(気) + O₂(気) | +571.7 (supplied as electricity) |
| `fuel-cell` | 2H₂(気) + O₂(気) → 2H₂O(液) | −571.7 |
| `p4-burn` | P₄(黄リン) + 5O₂(気) → P₄O₁₀(固) | −2984.0 |
| `phosphoric` | P₄O₁₀(固) + 6H₂O(液) → 4H₃PO₄(固) | −417.0 |
| `so3-absorb` | SO₃(気) + H₂O(液) → H₂SO₄(液) | −132.4 |

Recipes without clean data (cracking, polymerisations) show no number.

### 10.10 Distinctness and colour-vision rules (unit-tested with `colorsci.ts`)
- Flames: minimum ΔE00 14.8 (Li–Sr), then 19.3 (Na–Ba), 21.6 (Li–Ca). Under protan simulation Na–Ba is 1.4 and Li–Sr 11.6; under
  deutan Na–Ba 3.6 and Ca–Ba 9.9: the element symbol is drawn on every flame swatch (`cue: 'symbol'`).
- Analyzer blues below 10 (critique 1): fecn 濃青 vs [Cu(NH₃)₄]²⁺ 4.4; Fehling vs [Cu(NH₃)₄]²⁺ 5.3; FeCl₃ + phenol 紫 vs starch 6.0;
  fecn vs starch 7.7; fecn vs Fehling 8.0 → `cue: 'reagent'`; the reagent label is always drawn. Ninhydrin `#5a3a9a` (紫色) vs
  FeCl₃ + phenol (紫色) 4.4 and vs starch 6.5 → `cue: 'reagent'` (the phoresis swatch is labelled ニンヒドリン).
- Cu₂O 赤 vs Fe(OH)₃ 赤褐 8.6 and Fe(OH)₃ vs I₃⁻ 6.8 → `cue: 'label'` (different machines; the plate names the product).
  Fe(OH)₃ vs Ag₂CrO₄ 6.5 share the word 赤褐色. Sr flame vs FeSCN²⁺ 4.2: different contexts, both cued.
- Coloured gases: Cl₂–F₂ 12.4; NO₂–Br₂(g) 5.0 share the word 赤褐色. Colourless gases carry the ring cue.

### 10.11 Analyzer tests (R1-M M9; reagent label always drawn)
| Test id | Reagent drawn | Before → after | Result word | Kind | Source |
|---|---|---|---|---|---|
| `flame_y`, `flame_rp`, `flame_or`, `flame_yg`, `flame_bg` | Pt wire in the blue burner | `#4a7bff` → Na / K / Ca / Ba / Cu of §10.1 | 黄色 / 赤紫色 / 橙赤色 / 黄緑色 / 青緑色 | flame | [C1] |
| `has_cl` | heated Cu wire | → `#3ad9b4` | 青緑色（F 以外のハロゲン） | flame | [C1][BE] |
| `fecl3` | FeCl₃ aq | `#b98a2c` → `#5b2a8e` | 紫色 | tube | [C29][GS] |
| `iodoform` | I₂ + NaOH, warm | → `#f2d23a` grains | 黄色 | tube, ppt | [C28] |
| `silver`, `hyd_silver`, `oxald` | アンモニア性硝酸銀, warm | wall `#d9dde2` → `#8d949c` | 銀白色（銀鏡） | mirror | [GS] |
| `fehling` | フェーリング液, heat | `#1f4fb0` → `#b8321e` ppt | 赤色 | tube | [C25] |
| `iodine`, `starch` | ヨウ素液 / デンプン | `#c08a3a` → `#3b2a8a` | 青紫色 | tube | [C22][C7] |
| `biuret` | NaOH + 少量の CuSO₄ | `#a9cfe2` → `#9a3a8a` | 赤紫色 | tube | [GS] |
| `xantho` | 濃 HNO₃, heat; then NH₃ | `#e6c02a` → `#f0a020` | 黄色 → 橙黄色 | tube | [GS] |
| `sulfur` | NaOH, heat + 酢酸鉛(II) | → `#222226` ppt | 黒色 | tube | [GS][C2] |
| `br2`, `aldose` | 臭素水 | `#c8642a` → clear | 無色（脱色） | tube | [C21] |
| `oxid` | 硫酸酸性 K₂Cr₂O₇, warm | `#e8641e` → `#3f8f5a` | 橙赤色 → 緑色 | tube | [GS] |
| `fecn` | K₄[Fe(CN)₆] | → `#1f3a8a` ppt | 濃青色 | tube | [C7] |
| `hcl`, `h2so4`, `co3` | HCl / H₂SO₄ / (NH₄)₂CO₃ | → `#f4f4f1` ppt | 白色 | tube | [C33][C56][C2] |
| `h2s_acid`, `h2s_base` | H₂S | → `#222226` (ZnS `#f3f3ef`) | 黒色（ZnS は白色） | tube | [C2][C37] |
| `nh3_few`, `nh3_ex` | NH₃ aq, a little then excess | Cu: `#a9cfe2` → `#1b3fa8`; others per M8 | 青白色 → 深青色 | tube, 2 phases | [C10] |
| `naoh_ex` | NaOH aq, excess | per M8 | §10.5 | tube, 2 phases | [C57][C59] |
| `na`, `cold_water`, `acid_h2`, `nahco3`, `ext_nahco3`, `gas_hcl`, `water_o2` | Na / 水 / 希塩酸 / NaHCO₃ aq | colourless bubbles (rings) | 気体が発生 | bubbles | [GS] |
| `tyndall` | 横から光 | beam in the colloid; none in the true solution beside it | 光の通り道が見える | tyndall | [GS] |
| P1: `displace_cu`, `displace_ag`, `to_cathode`, `acidic`, `basic`, `has_n`, `passive`, `ox_br`, `coag_small` | chem.md §3 | | | | |
| P1: phoresis ninhydrin | ニンヒドリン, warm | spots → `#5a3a9a`; swatch `cue: 'reagent'` (ΔE00 6.5 from starch `#3b2a8a`, 4.4 from FeCl₃ + phenol `#5b2a8e`) | 紫色 (the word of the game's `org-ninhydrin` card) | spots | [JNH][GK] (hex chosen for the word, §12) |

Structural, theory and nucleic-acid tests keep the magnifier.

### 10.12 R3 data drafts (not shipped in R1)
- `BANDS` (absorbed light for the lab-light strip; a species without a sourced row shows no strip): Cu²⁺ aq absorbs the red end,
  band ≈ 600–900 nm peaking in the near infrared [CG]; CrO₄²⁻ and Cr₂O₇²⁻: a violet/blue edge, cut-off values to be read from [DB]
  before shipping; MnO₄⁻ ≈ 500–570 nm, phenolphthalein (basic) λmax ≈ 552 nm, Prussian blue ≈ 700 nm: **hold** until a primary
  source is added. **No Cr³⁺ row**: the bands at ≈ 400 and ≈ 580 nm [DB] belong to violet-blue-grey [Cr(H₂O)₆]³⁺, while the game's
  green Cr³⁺ (`#3f8f5a`, from Cr₂O₇²⁻ reduced in H₂SO₄) is a sulfate or chloride aqua complex; the hexaaqua bands are never
  attached to `#3f8f5a`, and the green Cr³⁺ shows no strip until a sourced band for it is added. Green solutions with a sourced row
  draw two dimmed regions; yellow and brown species a dimmed violet/blue end, never a band in the middle. Unit tests (normative):
  Cu²⁺'s band lies above 600 nm; Prussian blue, the held species and the green Cr³⁺ show no strip until they have a sourced row.
- Lattices (arcane circles) [XT][CS]: bcc (2 atoms per cell, coordination 8, 68 %) Na, K, Fe; fcc (4, 12, 74 %) Cu, Al, Ag, Au, Ni,
  Pb; hcp (12, 74 %) Zn, Mg; NaCl type 6:6 (NaCl, KCl, AgCl); zinc blende 4:4 (ZnS); fluorite 8:4 (CaF₂); diamond 4 (Si). Top-down
  along [001] (bcc and fcc only): bcc = square corners + centre; fcc = square corners + centre + the four edge midpoints
  (side-face centres project onto the edges). **NaCl type, zinc blende, fluorite, hcp and diamond are always drawn as the oblique
  cube**, ionic types with two ion colours: along [001] rock salt puts a Na⁺ and a Cl⁻ on every projected site, the same grid as an
  fcc metal, so NaCl, KCl and AgCl would look like Cu or Ag. Unit tests (normative here): no compound id maps to a metal lattice;
  every ionic type is drawn as the oblique cube with two ion colours; no compound's drawing equals a metal's projection.

### 10.13 Allowed colour words (test list)
白色, 黒色, 赤色, 赤褐色, 褐色, 黒褐色, 黒紫色, 紫色, 赤紫色, 青紫色, 青色, 深青色, 濃青色, 青白色, 青緑色, 緑色, 淡緑色, 黄緑色,
淡黄緑色, 黄色, 淡黄色, 黄褐色, 黄金色, 橙赤色, 橙色, 橙黄色, 淡青色, 淡赤色, 銀白色, 灰色, 灰黒色, 無色, ほぼ無色（淡桃色）,
白色（ゲル状）, 血赤色, 紅色, 深赤色, 淡黄白色 [C17] (wording, §12), 淡桃色 [C7]. A new word needs a source in §11.

The test checks colour **words**, not whole fields: it extracts every match of `/[淡濃深薄青赤黄緑紫白黒褐橙紅灰銀金血桃無]+色/g` from
every `word`, form, analyzer result and caption, and each match must be in the list. Qualifiers (濃いと, 薄いと, がかった, 光で,
ほぼ) and non-colour phrases (白濁, 赤熱, 青い炎, 明るい炎, 青白く光る, 気体が発生, 光の通り道が見える, F 以外のハロゲン) contain no
match or are cut off by it: 「褐色がかった黄色」 yields 褐色 and 黄色; 「青色（濃いと青緑色）」 yields 青色 and 青緑色; 「白色（光で紫 → 黒）」
yields 白色.

### 10.14 Captions (`captions.ts`; Japanese text is normative)
| Key | Text | Source |
|---|---|---|
| `burner` | 青い炎：空気を調節したバーナー（赤っぽい炎は不完全燃焼） | [CT] |
| `flame:<El>` | 炎色反応：{El} は{word} | [C1] |
| `burn:S` | 硫黄は青い炎を出して燃え、SO₂ になる | [C30] |
| `burn:CO` | CO は青い炎を出して燃え、CO₂ になる | [C31] |
| `burn:P4` | 黄リンは明るい炎を出して燃え、白煙（P₄O₁₀）を出す | [C32] |
| `noBurn:Cu` (P1, copper-oxide) | 銅は炎を出さずに酸化され、表面が黒い CuO になる | [C3] |
| `beilstein` | 青緑の炎：ハロゲン（F 以外）を含む（バイルシュタイン試験） | [C1][BE] |
| `mirror` | 銀鏡反応：還元されて生じた銀が、試験管の内側に付く | [GS] |
| `tyndall` | チンダル現象：コロイド粒子が光を散乱し、光の通り道が輝いて見える（となりの真の溶液では見えない） | [GS] |
| `incand` | {Tcap}：熱で光っている（約 525 ℃から赤く見え始める）; `{Tcap}` = the row's `Tcap`, else 約 {T} ℃ | [D1] + the `PROCESS_T` source |
| `noglow` | {Tcap}：まだほとんど光らない | [D1] + the `PROCESS_T` source |
| `moltenNaCl` | 赤く光るのは高温のため（融解した NaCl そのものは無色） | [D1][WNaCl] |
| `indicatorPP` | フェノールフタレインを加えてある（塩基性で赤） | [C38] |
| `indicatorMO` | メチルオレンジを加えてある（酸性で赤、中和が進むと黄） | [C38] |
| `heavyGas` | {gas}：空気（平均分子量 28.8）より重い。同じ温度で比べると低くたまる | §10.3 |
| `lightGas` | {gas}：空気より軽い。同じ温度で比べると昇る | §10.3 |
| `neutralGas` | {gas}：空気とほぼ同じ重さ | §10.3 |
| `hotGas` | 熱い気体は、まず昇る（重い・軽いは同じ温度で比べる） | general |
| `colourless` | 無色の気体（輪は目印） | §10.3 |
| `steam` | 白く見えるのは冷えてできた小さな水滴（湯気）。水蒸気そのものは無色 | [JYG] |
| `so3Fume` | 白く見えるのは空気中の水分と反応してできた硫酸の霧（SO₃ 自体は無色） | [C48] |
| `nh4cl` | NH₃ + HCl → NH₄Cl（白煙） | [C18][C45] |
| `no2` | 無色の NO は、空気中の O₂ と反応して赤褐色の NO₂ になる | [C34] |
| `collectWater` | 水上置換：水に溶けにくい気体 | [GR] |
| `collectUp` | 上方置換：水に溶けやすく、空気より軽い気体 | [GR] |
| `collectDown` | 下方置換：水に溶けやすく、空気より重い気体 | [GR] |
| `electrolysis21` | 同じ温度・圧力で、体積比 H₂ : O₂ = 2 : 1 | general (Avogadro) |
| `ammine` | 過剰の NH₃：Cu²⁺ は深青色の [Cu(NH₃)₄]²⁺。Zn²⁺・Ag⁺ も錯イオンになって溶ける（無色） | [C10][GI] |
| `amphoteric` | 過剰の NaOH：Al・Zn・Pb の水酸化物は溶ける。Fe(OH)₃ は残る | [C57][C59][GI] |
| `h2sFe` | H₂S で Fe³⁺ は Fe²⁺ に還元される（あとで HNO₃ で酸化して戻す） | [C10][GI] |
| `prussian` | 濃青色沈殿：Fe³⁺ と [Fe(CN)₆]⁴⁻ | [C7] |
| `dH` | {equation}　ΔH = {dH} kJ | [OS] |
| `storeNa` | ナトリウム：灯油の中に保存 | [JNa] |
| `storeP4` | 黄リン：空気中で自然発火するので、水の中に保存 | [JP4] |
| `storeHF` | フッ化水素酸：ガラスを溶かすので、ポリエチレンの容器 | [JHF] |
| `storeBrown` | 光で分解するので、褐色びんに保存 | [JHNO3][JAgNO3][C8] |
| `storeNaOH` | NaOH：ガラスを侵すので、すり合わせのガラス栓は使わない。潮解性があり CO₂ を吸うので密栓 | [JNaOH] |
| `cuCat` (P1) | 銅は 赤（Cu）⇄ 黒（CuO）をくり返す：触媒はもとに戻る | [MK] |
| `ninhydrin` (P1) | ニンヒドリン反応：アミノ酸をニンヒドリン水溶液と温めると紫色になる | [JNH][GK] |
| C-notice | 影と光：紙のスキンは、部屋の窓から入る実際の京都の太陽（朝は左上から、夕方は右上から）。工場は北向きの天窓、研究所は天井の灯りで、光はいつも画面の上から。地図の方角（上が北）とは別。夜は机の灯り・ろうそく・天井灯。このゲームでは、物質の色はいつも白い光の下での色（教科書の色）で描く。時刻・光・画質の設定では変えない。 | D1 |

Rules (tested): 置換 captions state solubility first; buoyancy captions say 同じ温度; P₄'s light is 化学発光, never 燐光; no caption
equates a sodium lamp with the flame's 589 nm; the Beilstein caption says F 以外; every caption shown on a white plume other than
NH₄Cl or P₄O₁₀ contains 水滴 or 霧 (`steam` and `so3Fume` take priority over `heavyGas`/`lightGas` for those plumes); no caption
prints a display clamp as a temperature; the Tyndall caption says the particles scatter light (散乱), never that the colloid
glows; the ninhydrin word equals the game's card (紫色); the C-notice says the game draws every substance in its colour under
white light (the textbook colour) and does not change it with the time, the light or the quality setting (the old 「物質の色は、
光や画質で変わらない」 was false as a general statement: colour depends on the light, the lesson of 吸収と補色 and of cobalt
glass).

### 10.15 Storage (`store`; drawn on the container frame, contents untouched)
| Substance | `store` | Drawn as | Source |
|---|---|---|---|
| Na | `kerosene` | a faint colourless liquid layer over the metal (excluded from the matter probe) | [JNa] |
| P₄ | `water` | a water layer; no glow | [JP4] |
| HF aq | `poly` | matte white polyethylene bottle frame | [JHF] |
| conc. HNO₃ | `brown` | brown glass frame | [JHNO3] |
| KMnO₄ aq | `brown` | brown glass frame | [C8] |
| AgNO₃ | `brown` | brown glass frame | [JAgNO3] |
| NaOH | `poly` | plastic bottle, no ground-glass stopper | [JNaOH] |

Only substances present in `substances.ts` get a row in code.

### 10.16 Catalysts and indicators per recipe
`haber-bosch` Fe₃O₄ black granules `#26262a` [C41]; `contact` V₂O₅ yellow–orange `#e8a83a` [C23]; `ostwald-1` Pt gauze glowing at
800 °C [JOS]; MnO₂ recipes black powder `#28262a` [C40]; `formaldehyde` Cu `#c8733f` ⇄ CuO `#222224` (P1) [MK];
`neutralize-acetate` phenolphthalein 無色 → 淡赤色 `#ffb3cf` at the end point [C38]; `scrub-nh3` methyl orange 赤色 `#e0362a` →
黄色 `#f2b81e` as the acid is used up [C38]. Nothing else draws an indicator.

---

## 11. Sources

### 11.1 Rendering and platform
- Critique evidence: `gfx/crit0/` (`nan.cjs`, `med.cjs`, `blur.cjs`; second round `evenodd.cjs`: even-odd clip vs `destination-out`
  at 1/4 res), `gfx/crit2/` (`keepdil.py`, `keepres.py`, `contrast.py`, `compass.py`, `nightsim.py`; second round `spec2chk.py`,
  `spec2fix3.py` (D1 hand-over), `spec2v5.py` (night field), `spec2v6.py`, `spec2v7.py` (token identity under the key),
  `spec2v8.py`/`spec2v9.py` (canvas `P.soft`), `keephalo.py`), `gfx/crit1/` (`chk.py`, `spec2.py`, `chk3.py`); this revision's
  checks in `gfx/spec2/` (`chk2.py`: Sr and luminol ΔE00 and CVD; `skytab.py`: the sky table from `gfx/tech/sky/sun.py`).
- Khronos GLSL specification source, `chapters/variables.adoc` (default precision: the fragment language predeclares
  `precision mediump int`; integer representation at mediump): https://github.com/KhronosGroup/GLSL/blob/main/chapters/variables.adoc
  (copy in `gfx/crit0/dl/variables.adoc`)
- M. Jarzynski, M. Olano, Hash Functions for GPU Rendering, JCGT 9(3) 2020 (`pcg2d`): https://jcgt.org/published/0009/03/02/
- NOAA GML, General Solar Position Calculations: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
- 国立天文台 暦計算室, 京都 2026 年 11 月の日の出入り: https://eco.mtk.nao.ac.jp/koyomi/dni/2026/s2711.html
- F. Kasten, A. T. Young, Revised optical air mass tables (1989): https://doi.org/10.1364/AO.28.004735
- C. Wyman, P.-P. Sloan, P. Shirley, Simple Analytic Approximations to the CIE XYZ CMFs, JCGT 2(2): https://jcgt.org/published/0002/02/01/
- Khronos PBR Neutral tone mapper: https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md
- I. Quilez, Soft shadows in raymarched SDFs: https://iquilezles.org/articles/rmshadows
- Osborne & Sannikov, Radiance Cascades (2024): https://arxiv.org/abs/2408.14425
- MDN, WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- Web3D Survey, EXT_color_buffer_float and KHR_parallel_shader_compile: https://web3dsurvey.com/webgl2/extensions/EXT_color_buffer_float ,
  https://web3dsurvey.com/webgl2/extensions/KHR_parallel_shader_compile
- WebKit bug 215745 (rAF at 30 fps in Low Power Mode): https://bugs.webkit.org/show_bug.cgi?id=215745
- MDN browser-compat-data (`requestIdleCallback`, Canvas2D `filter`): https://github.com/mdn/browser-compat-data
- ANGLE Metal emitter: https://chromium.googlesource.com/angle/angle.git/+/main/src/compiler/translator/msl/EmitMetal.cpp
- Arm Performance Studio 2024.4 notes: https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/arm-performance-studio-2024-4
- Playwright Clock API: https://playwright.dev/docs/clock ; MDN `document.fonts.ready`: https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready
- G. Sharma, W. Wu, E. Dalal, CIEDE2000 notes and test data: https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
- Machado, Oliveira, Fernandes 2009, CVD simulation: https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
- W3C WCAG 2.2 (1.4.3, 1.4.11, 2.3.1): https://www.w3.org/TR/WCAG22/ ; CSS Color 4 (sRGB, OKLab): https://www.w3.org/TR/css-color-4/
- Okabe & Ito, Color Universal Design: https://jfly.uni-koeln.de/color/
- R. M. Pope, E. S. Fry (1997) [PF]: https://omlc.org/spectra/water/data/pope97.txt , https://doi.org/10.1364/AO.36.008710

### 11.2 Chemistry (keys used in §10)
- [C1] 岩手県立総合教育センター「綿棒を使った炎色反応」 https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/sapoto06.pdf
- [C2] 同「炭酸水素ナトリウムの成分元素」 …/sapoto07.pdf · [C3] 同「孔雀石から銅を取り出す」 …/sapoto01.pdf · [C4] 同「状態変化（ヨウ素の昇華）」
  …/sapoto08.pdf · [C5] 同「酸・塩基・クロム酸銅(Ⅱ)の電気泳動」 …/sapoto10.pdf · [C7] 同「酸化剤と還元剤の反応と電子の流れ」 …/sapoto19.pdf ·
  [C8] 同「酸化還元滴定」 …/sapoto20.pdf · [C9] 同「金属樹の生成」 …/sapoto21.pdf (all under
  https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/)
- [C10] 福岡教育大学 金属イオンの系統分離の教材研究 https://staff.fukuoka-edu.ac.jp/haradab/room/332317.pdf
- [CT] 富山県総合教育センター「ガスバーナーの使い方」 https://www.digirika.tym.ed.jp/wp-content/uploads/10gasuba-na-.pdf
- [C59] 愛媛県立松山北高校 金属イオンの分離・確認プリント https://matsuyamakita-h.esnet.ed.jp/file/2842 (search summary only)
- ja.wikipedia (https://ja.wikipedia.org/wiki/<title>): [C15] 二酸化窒素 · [C16] オゾン · [C17] 硫化水素 · [C18] アンモニア ·
  [C20] 塩化銅(II) · [C21] 臭素 · [C22] ヨウ素 · [C23] 酸化バナジウム(V) · [C25] フェーリング反応 · [C28] ヨードホルム反応 ·
  [C29] 塩化鉄(III) · [C30] 硫黄 · [C31] 一酸化炭素 · [C32] 黄リン · [C33] 塩化銀 · [C34] 一酸化窒素 · [C37] 閃亜鉛鉱 ·
  [C38] pH指示薬 · [C39] 硫酸銅(II) · [C40] 過マンガン酸カリウム · [C41] 四酸化三鉄 · [C42] 酸化銀(I) · [C43] クロム酸銀 ·
  [C44] 水酸化銅(II) · [C45] 塩化水素 · [C46] 塩素 · [C47] フッ素 · [C48] 三酸化硫黄 · [C54] 水酸化鉄(III) · [C55] 硫化銅(II) ·
  [C56] 塩化鉛(II) · [C57] 水酸化アルミニウム · [C58] 硫化銀 · [JF] 炎色反応 · [BE] バイルシュタイン試験 · [JP4] 黄リン (ignition
  ≈ 44 °C, stored under water, slow oxidation in air gives 青白い光; checked 2026-11-12) · [JNa] ナトリウム · [JHF] フッ化水素酸 ·
  [JHNO3] 硝酸 · [JAgNO3] 硝酸銀 (「光で化学反応を起こすため褐色瓶に保存する」; checked) · [JNaOH] 水酸化ナトリウム (glass attacked,
  no ground-glass stopper, 潮解性, absorbs CO₂, 密栓; checked) · [JOS] オストワルト法 (800 °C) · [JTH] テルミット反応 · [JNH]
  ニンヒドリン (Ruhemann's purple; the game uses 紫色, the word of its own card [GK]) · [JYG] 湯気 (水蒸気は気体で目に見えず、湯気は
  液体の小さな水滴)
- en.wikipedia (https://en.wikipedia.org/wiki/<title>; all checked 2026-11-12): [WHB] Haber_process ("most plants … 200 bar and
  500 °C") · [WCP] Contact_process (420–620 °C, typically about 450 °C) · [WSC] Steam_cracking (about 850 °C) · [WHH]
  Hall–Héroult_process (940–980 °C) · [WLK] Lime_kiln (about 900 °C) · [WZS] Zinc_smelting (suspension roaster about 980 °C) ·
  [WCE] Copper_extraction (matte about 1100 °C) · [WBF] Blast_furnace (its 1500–1600 °C is the combustion zone of the oxygen blast
  furnace variant; not used for `PROCESS_T`) · [WTH] Thermite (adiabatic burn temperature 3135 K = 2862 °C; "up to 2500 °C" with
  iron(III) oxide; checked 2026-11-13) · [WNaCl] Sodium_chloride
  (mp 800.7 °C) · [SL] Sodium-vapor_lamp · [FT] Flame_test · [D1] Draper_point · [P1] Pyrotechnic_colorant
- [SU] steeluniversity, Blast Furnace Steelmaking module ("a temperature as high as possible (1480–1520 °C at tapping)" for hot
  metal; checked 2026-11-13): https://hub.steeluniversity.org/catalog/module/315
- [N1] NIST Handbook of Basic Atomic Spectroscopic Data: https://physics.nist.gov/PhysRefData/Handbook/Tables/neontable2.htm (and the
  He, Ar, Kr, Hg tables) · [N2] NIST Atomic Spectra Database: https://physics.nist.gov/PhysRefData/ASD/lines_form.html
- [OS] OpenStax Chemistry 2e, Appendix G: https://openstax.org/books/chemistry-2e/pages/g-standard-thermodynamic-properties-for-selected-substances ·
  [ET] Engineering ToolBox (CaCO₃ ΔfH −1207.6 kJ/mol): https://www.engineeringtoolbox.com/standard-state-enthalpy-formation-definition-value-Gibbs-free-energy-entropy-molar-heat-capacity-d_1978.html
- [CG] chemguide, The colours of complex metal ions: https://chemguide.co.uk/inorganic/complexions/colour.html · [DB] Doc Brown,
  UV-visible spectra of chromium complexes: https://docbrown.info/page06/spectra/0uv-visible-spectra-06cr.htm
- [LU1] LibreTexts, Luminol: https://chem.libretexts.org/Bookshelves/Analytical_Chemistry/Supplemental_Modules_(Analytical_Chemistry)/Analytical_Chemiluminescence/2:_Chemiluminescence_Reagents/2.01:_Luminol ·
  [LU2] Sigma-Aldrich luminol information: https://b2b.sigmaaldrich.com/deepweb/assets/sigmaaldrich/product/documents/637/670/a8511pis0623-ms.pdf
- [XT] DoITPoMS crystallography: https://www.doitpoms.ac.uk/tlplib/crystallography3/printall.php · [CS] en.wikipedia
  Periodic_table_(crystal_structure), Cubic_crystal_system, Calcium_fluoride
- [MK] 東京都立小石川中等教育学校「アルコールの酸化1」 https://www.metro.ed.jp/koishikawa-s/l_pdf/04_アルコールの酸化1.pdf
- Game data as a source of wording: [GS] `src/content/samples.ts` (test texts), [GR] `src/content/recipes.ts` (collector texts),
  [GI] `src/content/ions.ts` (separation notes), [GK] `src/content/knowledge.ts` (card `org-ninhydrin`: 「ニンヒドリン水溶液と温める
  と紫色」).

---

## 12. Open items (not resolved by this revision)

1. **Wording to confirm against the player's textbook** (colours are safe either way): CO flame 青い炎 vs 青白い炎; S flame 青い炎 vs
   青紫色の炎; CuCl₂ aq 青 vs 青緑; SO₂ + H₂S 白濁（淡黄白色） vs 淡黄色の沈殿; Cr₂O₇²⁻ 橙赤 vs 赤橙; phenolphthalein range 8.0–9.8 vs
   8.3–10.0; ninhydrin: R1 uses 紫色, the word of the game's own card (ja.wikipedia says 青紫色, some problem books 赤紫色; if the
   textbook says otherwise, change the card and the caption together), hex `#5a3a9a`; Cl₂ water 淡黄緑.
2. **Unsourced temperatures**: `lead-roast` has no sourced roasting temperature, so it shows a burner only;
   `copper-converter` uses the matte temperature (1100 °C) as a lower bound.
3. **`hcl-synthesis` flame** (H₂ burning in Cl₂, commonly 青白い炎): not drawn until a source is added.
4. **Game content outside graphics** (critique 1 §D): AgBr, AgI, CdS, MnS, BaCrO₄, Fe(OH)₂, Ni²⁺, Co²⁺ / 塩化コバルト紙, Turnbull's blue,
   aniline + さらし粉, limewater with excess CO₂ are not in the substance or recipe set, so no picture can show them. CO₂ collection
   accepts only 下方置換 in `recipes.ts` though several textbooks also allow 水上置換. These belong to a content task.
5. **Device numbers**: every millisecond in §4 is an estimate until R2-WD measures an iPad and an Android tablet; R1 gates on ratios
   and the ALU proxy only. The ALU proxy is a heuristic count, not a driver's compiler output.
6. **Info layer memory** (+15.5 MB at DPR 2 in 2D GL tiers) is acceptable on the reference iPad but unmeasured against iOS canvas
   limits on 3 GB devices; R2-WD's floor-class test checks it.
7. **The room-window light** for paper looks is honest physics for a page on a desk, but a player could still read the map as an
   outdoor place; the C-notice and `docs/GRAPHICS.md` explain the frame. If play-testing shows confusion, the fallback is the
   building-look rule (light from straight above) for all looks, which keeps every gate.
8. **fix/skins and fix/sheets** are in progress (fix/skins 1b0047f touches `main.ts`, `style.css`, `build2.ts`, `prefs.ts`); R1-L's
   skinLab work other than L0's `labAmbient` removal waits for fix/skins, and R3 starts from its tokens. If fix/skins changes shell
   drawing substantially, L9 and H2's lab silhouettes must be re-read against it. T0 copies fix/skins' `--soft` values into the
   canvas palette; if fix/skins changes them again, T0 follows.
9. **標準 night punch ramp.** The 1/4-res scratch needs a dilation of `max(3, 4/dpr + 1)` CSS px so matter stays exact; outside
   the ink border (≥ 1.5 CSS px) the plate beside a vessel window receives a partly reduced night over ≈ 3 CSS px. It is cosmetic,
   not information, and is accepted in R1; a half-resolution scratch would remove it at about 4× the copy cost.
10. **Play time while the saver is idle** now counts nothing (D8). Before R1 it counted the rendered sixth of the frames as a side
   effect of the skip; fix/skins already counts nothing on idle-skipped frames. If pacing should count idle time, that is a
   pacing decision outside graphics.
11. **3D information** is relit in R1 (D5 exception): plates, name tags, port arrows, lamps and rate labels stay in the plane
   textures with fog, tilt-shift blur and night. Moving them to `three.screen` is R3-X work.
12. **Night field calibration.** N's lamp and floor colours, reach 0.7 and the key shares are starting values chosen to pass
   gate e with margin (linear-Y ratio 1.61 and 1.45 against 1.4); the device check (§7.6) confirms the pool reads as a lamp, not
   a vignette, on the player's iPad in the evening.
