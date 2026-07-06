# minecraft-structure-viewer - rebuild plan

Ground-up rebuild of the structure viewer that currently lives at
`projects/structure-viewer/` on the `v2-dev` branch of
`E:\Programming\Javascript\Minecraft\BlockModelRenderer`. The old version grew
iteratively and is being rewritten as a standalone, properly architected app.

## Locked decisions (from Ewan)

- Repo: `E:\Programming\GitHub\minecraft-structure-viewer`, its own git (branch `main`).
- **Full rewrite, algorithms included** (nbt, jigsaw, generators, walk physics, optimiser).
  The old code is spec/reference only; docs/DECISIONS.md captures every bug fix that
  must not regress. Test along the way; Ewan tests at the end too.
- Vue 3 + Vite SFC app. No state library (composables). Sparse comments allowed
  (non-obvious constants only). NO emdashes anywhere (global rule).
- Library: `block-model-renderer` loaded at RUNTIME from `http://localhost:8080/src/web.js`
  (Ewan hosts the repo there; stands in for the real CDN, swap later). The app npm-installs
  `three@0.162.0` and hands it to the library via `configure({ three })` so there is only
  one three instance. Use `/* @vite-ignore */` on the dynamic import.
- UI: sidebar layout (not a top nav). Standalone design, does NOT need to match the
  library's example pages, but must be clean and well organised: settings that belong
  together stay together. Google Material Symbols (Google Fonts link) allowed.
- **New feature: multi-pack overlays.** Instead of one user pack over vanilla, an ordered
  list of packs: add as many as you want, remove, reorder. Vanilla (release/snapshot)
  base at the bottom. Maps directly onto `prepareAssets([pack1, pack2, ..., vanillaJar])`
  (first entry wins). Remember `default_blockstates.json` merges across packs too.
- Commit as you go (Ewan's commit style: lowercase, terse, subject <=50 ideally, hard cap
  ~72, body only when it adds something, no attribution/Co-Authored-By ever).
- Test with Playwright MCP against the Vite dev server as features land.
- Docs live in `docs/` and are updated every commit so a fresh session can resume
  (Ewan may switch accounts mid-build; docs/PROGRESS.md is the handoff).

## Feature parity checklist (all must exist in the rebuild)

Browser/sidebar:
- Structure tree: vanilla structures from the client jar (`data/minecraft/structure/`),
  plus structures from every loaded pack/mod jar (`data/<ns>/structure/`), namespaced.
- Compact folders (single-child folders collapse into `a/b/c` rows), `minecraft`
  namespace auto-opened, user-select none.
- Filter dropdown: all / standalone / starters (starters = not loaded by another
  structure; standalone = neither loads nor is loaded by others). Requires scanning
  worldgen template pools (jigsaw references).
- Load user `.nbt` files from disk.
- Query-string persistence: structure, level, seed (hex). Camera NOT reset on level
  ops or setting toggles, only on new structure load.

Packs:
- Vanilla jar via Mojang (release + snapshot buttons, Cache Storage cached per channel,
  cors proxy https://cors.ewanhowell.com/, progress display). NEW: ordered multi-pack
  overlay list on top of the base. `prepareAssets(..., { cache: true })`; `disposeCache`
  the old bundle AFTER the new scene swaps in (door clones share cached textures).
- Pack switch does not auto-rebuild? (old viewer rebuilt current structure on pack
  change; decide in ARCHITECTURE.md, gallery precedent = explicit action only).

Rendering pipeline (per structure build):
- Read nbt -> palette + blocks. Legacy data-fixes (renamed blocks, moved properties)
  before parseBlockstate. Waterlogged handling via string props.
- Template per unique palette state: parseBlockstate + resolveModelData + loadModel.
- Optimiser: greedy meshing + texture atlases (full spec in DECISIONS.md): flat
  axis-aligned faces greedy-merged per (plane, normal, cell, phase); pre-tiled textures
  with tile cap (512) and atlas spill (8192); dedupe by pixel hash; coplanar overlapping
  faces (grass overlay) demoted to atlas path to preserve draw order; opaque vs
  translucent split into separate passes; translucent no depth-write; animated blocks
  (water/lava/fire) stay live, opaque animated (lava) in opaque pass; per-block culling
  via the library's getCullFaces (memoise on state + 6 neighbour states).
- Doors/trapdoors: never baked; both open+closed clones present, toggled by visibility.
- Centre the TOP-LEVEL structure with grid-aligned snapping (blocks on whole cells);
  on level loads keep the world centred but translate the camera to stay relatively
  positioned to the start piece.
- Info readout: size, block count, palette entries, draws/tris raw -> optimised.

View options:
- Lighting: world (default) / off. Ortho toggle. Wireframe (hide grid while on).
  Grid toggle. Fit view. Collect mode (keep multiple structures side by side).
- Export: .glb / .obj, optimised or raw, hidden door halves skipped, shader materials
  re-materialised to MeshStandardMaterial (nearest filter, alphaTest 0.5 / transparent).

Jigsaw assembly (worldgen):
- Run structure blocks: grow a structure through its jigsaw graph like worldgen.
- Bottom-right expandable menu: load next level, load all levels, undo level, reload
  (current depth), full reload (structure's full depth), reset; shows current level;
  buttons hidden when no jigsaws remain; menu locked during solve/build.
- Seeds: hex, per-level derivation (mix), reproducible; seed + level in query string;
  full reload re-rolls; level 1 has no seed (seed picked when advancing).
- Piece placement rules: pool resolution across namespaces, weighted elements,
  empty_pool_element = place nothing (break on reaching it), list_pool_element
  approximated by first entry, structure_void never places/carves, real air carves,
  per-source free-region overlap rules (fixes village/outpost overlap + fanout bugs),
  jigsaw orientation front/top, joint rollable/aligned, target name matching,
  max depth from structure json, keep start piece anchored while growing.
- Procedural generators reimplemented from decompiled MC: igloo (3 pieces, ladder
  shaft), end city (EndCityPieces tower/bridge/fat tower rules, opened doorways),
  woodland mansion (grid-based room layout, mirror support). Same stepped level
  controls as jigsaw structures.

Walk mode:
- Enter from current camera position; if inside blocks bump up to first gap that fits
  (full 2-block gap). Pointer lock, all shortcuts intercepted.
- Minecraft physics: per-block collision boxes (flat-plane-only models = no collision),
  step-up with eased camera (not snap), fly toggle, sprint (double-tap W within
  minecraft's 7-tick/350ms window, or Q), crouch (correct hitbox height, edge guard
  that also holds between stair steps going down), ladders (top release + correct
  cell mapping: round not floor), noclip (N, no bump on exit... bump only when
  entering walk), view bobbing matched to game, wider fov while walking.
- Crosshair: pinned to canvas centre (sidebar offset!), difference-blend so it inverts
  the background; door/trapdoor highlight outline when in range; left OR right click
  toggles; esc exits cleanly without freezing the camera.

## Build order (each step = commit + Playwright check + PROGRESS.md update)

1. Scaffold: Vite + Vue 3, base layout (sidebar + viewport), library bootstrap
   (configure({ three }), runtime import), Material Symbols.
2. Pack system: vanilla channels + multi-pack overlay list (add/remove/reorder),
   caching + dispose lifecycle.
3. Structure sources: jar/data listing, tree UI, filters, .nbt upload, nbt parser.
4. Basic build: templates + placement, centring, camera (orbit/fit/ortho), lighting,
   grid, info readout. No optimiser yet (raw mode).
5. Optimiser: full greedy/atlas pipeline + culling + animated handling + doors.
6. Wireframe, collect, export.
7. Jigsaw assembler + level menu + seeds.
8. Procedural generators (igloo, end city, mansion).
9. Walk mode.
10. Polish pass, final docs.
