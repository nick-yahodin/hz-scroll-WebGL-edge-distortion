# Portfolio — Handoff (Nick Yahodin)

A horizontal-scroll portfolio with a WebGL "edge distortion" effect copied (by
mechanics, not code) from **system.studio/work/patch**. This doc is the full
context to continue the work in another assistant (Codex).

---

## 1. Goal

- Full **horizontal-scroll** portfolio (vertical wheel/trackpad → the rail moves sideways).
- Signature effect: as content nears the **left/right screen edges** it **fans/rolls
  vertically** around a shared centerline (centre stays crisp) with **vertical
  chromatic aberration**. Studied from system.studio (they use OGL); reimplemented
  with our own three.js code. **Do NOT copy their source verbatim** — only the
  mechanics/values (facts).
- Layout, colors, copy, images come 1:1 from Figma "Folio / 2026".

## 2. Stack & run

- **Vite + React + TypeScript + three.js** (no Lenis anymore — see §7).
- Dev server: `npm run dev` (port 5173). There is a `.claude/launch.json`
  ("portfolio-dev") for the Claude Code preview.
- Build/typecheck: `npm run build` (runs `tsc -b && vite build`). Currently passes.
  Warning: three.js makes the bundle ~700KB — code-splitting is a later nice-to-have.

## 3. File map (`src/`)

- `design.ts` — all design data from Figma (frame size, cards with image `src` or
  `color`, `TEXT_TILES` with copy). Colors/positions are in **Figma design px**;
  the whole 6489?/5163×860 frame is treated as a fixed-height canvas scaled to 100vh.
- `gl/DistortionGallery.ts` — the engine. Renders every tile (image / solid color /
  text-drawn-to-canvas) into an offscreen `WebGLRenderTarget`, then draws it
  full-screen through the **edge-warp fragment shader** (`FRAG`). This is where the
  effect lives.
- `App.tsx` — mounts the gallery into a container div, sizes a `.spacer` to give the
  body its scroll height, and runs the rAF loop: reads native `window.scrollY`,
  lerps it (0.09) for smoothness, calls `gallery.setScroll` + `gallery.render`.
- `main.tsx` — plain `createRoot(...).render(<App/>)` — **StrictMode intentionally
  removed** (see §7).
- `index.css` — reset, tokens, hides scrollbar, `.gl` (fixed fullscreen canvas), `.spacer`.

## 4. What works (verified in the preview)

- Horizontal scroll (native) + smooth lerp. ✅
- Edge fan + vertical chromatic aberration, centre crisp, gated flat at the very
  start/end. ✅
- Real Figma images load (`public/work/project{1,2,3}.png`, cover-cropped). ✅
- **Text tiles warp too** (name, tagline, "Wholesale Express" caption are rendered
  into the WebGL layer, so they bend at the edges). ✅

## 5. THE immediate task — match their intensity

User feedback comparing to system.studio:
- **Their text aberration is minimal/almost none; ours is a garish rainbow (many
  ghost copies).**
- **Their image distortion is gentler/softer than ours.**

### Root cause (important)

System applies chromatic aberration **per-tile, in the tile's own UV space**:
`ca = uChroma * fx * (0.4 + vEdge)`, offsetting the R/B samples in the **tile's Y**.
Because a text tile is short, `0.02 * tileHeight` is a tiny pixel offset → barely
visible CA. Their image tiles are 615px tall so the same 0.02 is a soft, larger split.

Our engine does a **single full-screen post pass**, so our `ca` is a fraction of the
**whole viewport height** (`sampleY ± ca` in screen UV). With `uChroma = 0.02`,
`ca ≈ 0.028 * viewportH ≈ 22px` — which shreds 16px text into rainbow ghosts.
**That mismatch (screen-space vs tile-space CA) is the whole problem.**

### Exact System values (extracted from their OGL bundle — these are facts, not code)

- `uFan = 0.6`   (vertical flare strength)
- `uEdgeZone = 0.1`   (edge band half-width, fraction of viewport)
- `uEdgePow = 2.6`   (edge falloff)
- `uChroma = 0.02`   (**tile-space** CA amount)
- CA gating in their frag: `fx = smoothstep(0.0003, 0.012, vEdge)`, then
  `ca = uChroma * fx * (0.4 + vEdge)`, and R/B are split on **Y** only
  (`tex(uv + vec2(0,ca)).r`, `tex(uv - vec2(0,ca)).b`).
- `uFullTile` flag: 1 for whole-tile GL (video/**text**), else the effect is limited
  to the seam tails. Their warp is a **forward** geometry expansion
  `y = center + (y - center) * (1 + uFan*edge)`; ours is the equivalent **inverse
  sample** `sampleY = center + (uv.y - center) / (1 + uFan*edge)`.
- Other constants seen (unmapped, for reference): hg=3, zE=4, CE=48, DE=14, UE=.012,
  df=2e-4, qr=3e-4.

### Recommended fix (two options)

**Quick (do first):** in `DistortionGallery.ts` uniforms, drop `uChroma` from `0.02`
to roughly **0.004–0.006** and re-check. Optionally lower `uFan` 0.45 → ~0.4 and set
`uEdgeZone` to 0.1, `uEdgePow` 2.6 to match. This softens everything globally and
makes text CA subtle. Fast, but text CA is still proportionally a bit strong because
it's screen-space.

**Proper (to truly match):** make CA **content-scale-aware**. Cleanest is to move to
**per-tile rendering** (each tile its own mesh drawn with the warp in tile-UV space,
like System's `uFullTile` path), so short tiles (text) get proportionally tiny CA and
tall tiles (images) get soft CA. Alternatively, keep the single post pass but render a
**per-pixel "tile height" or "is-text" mask** into a second render-target channel and
scale `ca` by it (near-zero for text). Either way the target is: **text ≈ no visible
CA, images = soft CA.**

Current values in code: `uEdgeZone 0.11, uEdgePow 2.6, uFan 0.45, uChroma 0.02`
(the 0.02 is the culprit for text). The shader is `FRAG` at the bottom of
`src/gl/DistortionGallery.ts`.

## 6. Figma source (has Dev Mode access)

- Use fileKey **`2NiIhavFELQKjTmtZcIqza`**, node **`1:2`** ("Home"). (The originally
  shared file `3yyb4wnAMGrHjJ4gYr2eBI` had no access — don't use it.)
- Cards (design px, y=233, h=615): rect1 `12` w1416 → project1; rect2 `1440` w576 →
  project2; rect3 `2028` w576 → project3; rect4 `3136` w1093 → **reuses project2**;
  rect5 `4241` w1093 → **still solid `#f3f39d`, no image yet**.
- Caption "Wholesale Express" frame at x2764, w360, y233.
- Font in Figma is **ABC Diatype (licensed trial)** — we substitute a neutral grotesk
  (`"Helvetica Neue", Helvetica, Arial`). If a licensed Diatype/Söhne/Suisse becomes
  available, swap the font stack in `index.css` + the canvas font in
  `makeTextTexture`.

## 7. Gotchas / decisions already made (don't re-litigate)

- **StrictMode removed** in `main.tsx`: its dev double-mount created two WebGL
  renderers on one canvas → blank flicker. The gallery now also owns/creates its own
  `<canvas>` and removes it on dispose.
- **Lenis removed**: its window integration fought the fixed-content + spacer layout
  and reset scroll to 0. We use **native `window.scrollY` + a manual lerp** instead
  (simpler, robust, works with `window.scrollTo`, touch, wheel).
- **y-up ortho camera**: design is y-down; tile Y is converted as
  `(DESIGN.height - (y + h/2)) * scale`. Getting this wrong flips every tile
  upside-down.
- `mesh.frustumCulled = false` on tiles — the group is translated far when scrolled;
  without this, off-first-card tiles get culled and vanish.
- **Testing artifact:** the Claude browser pane kept auto-resizing mid-capture, which
  fired the resize handler and produced false "blank" screenshots. Lock a viewport
  (`resize_window 1280×800`) before screenshotting. (Reset emulation with the desktop
  preset when done.)

## 8. Remaining project tasks

1. **Tune the effect** per §5 (the active request).
2. **git push**: repo is committed locally on `main` (identity set locally to
   `nick-yahodin` / `nick.yahodin@gmail.com`). The GitHub repo **does not exist yet**.
   `gh` is logged into two accounts; **active is `nick-wellspin`** — switch first:
   `gh auth switch --user nick-yahodin`, then
   `gh repo create nick-yahodin/portfolio --private --source=. --remote=origin --push`.
   Target repo: https://github.com/nick-yahodin/portfolio (account nick.yahodin@gmail.com).
   Commit trailer convention: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
3. **Vercel deploy** (project/team **`nickyahodin-5311`**, from GitHub). Vercel CLI is
   installed (v59) but **not logged in** (`vercel login` is interactive). Their
   `get-started.md` flow: `vercel login` → `vercel whoami` → then either import the
   GitHub repo in the Vercel dashboard (gives auto-deploy on push) or `vercel link` +
   `vercel --prod`. Vite is auto-detected by Vercel (build `npm run build`, output
   `dist`).
4. Fill the **yellow card (rect5)** with a real image when available.
5. Later: code-split three.js to shrink the 700KB bundle; consider pinning the header
   (name/tagline) vs letting it scroll.

## 9. Repo location

`/Users/nick/Development/portfolio` (its own git repo; note it is nested inside a
`/Users/nick/Development` git repo, which is unrelated/legacy — operate only in
`portfolio`). Old unrelated files were moved to `/Users/nick/Development/.mclane-analyzer-old/`.
