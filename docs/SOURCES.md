# Source material for the rebuild

All reference material lives outside this repo. Read it BEFORE implementing each area,
mine it into docs/DECISIONS.md, then write the new code from the docs.

## Old implementation (spec/reference only, do not copy blindly)

Branch `v2-dev` of `E:\Programming\Javascript\Minecraft\BlockModelRenderer`
(the working tree there has the `v2` branch checked out; read via
`git show v2-dev:projects/structure-viewer/<file>`):

- app.js (1036) - all app wiring/state/UI. The part most in need of the rewrite.
- optimise.js (417) - greedy mesh + atlas optimiser.
- jigsaw.js (113) + transforms.js (152) + combine.js (57) - worldgen assembler.
- generators/{igloo(21), endcity(112), mansion(370), index(3)}.js - procedural pieces.
- walk.js (303) - fps controller.
- nbt.js (88) - NBT reader (already fully read: gzip via DecompressionStream, big-endian
  DataView walker, readStructure -> { size, palette, blocks{state,pos,nbt} }).
- transforms.js - already fully read: DIR/HORIZ/OPP tables, rotDir/rotPos (clockwise
  steps about +Y, pivot zero, matches StructureTemplate.transform), mulberry-style rng,
  shuffle, mix (per-level seed derivation), parseState ("id[k=v,...]"), rotateState
  (facing/axis/rotation16/connection sides), mirrorPos/mirrorDir/mirrorState (lr flips Z,
  fb flips X, mirror BEFORE rotation, stairs shape swap when facing axis == flip axis,
  door hinge flip, banner rotation formula), AIR/STRUCT_VOID/REAL_AIR regexes,
  jigsawsOf (orientation "<front>_<top>", nbt pool/name/target/joint/final_state),
  worldJigsaw, pieceBox ([min,max) exclusive), boxHit (>0.25 interpenetration),
  poolTemplates (weighted, EMPTY symbol for empty_pool_element, list approximated by
  first element).
- structure.html (77) + style.css (69) - old markup/styles.
- mojang-pack.js - jar downloader; a cleaner comment-free version exists at
  `examples/web/mojang-pack.js` on the `v2` branch working tree.

## History (the WHY and every bug fixed)

- Full SV commit log: `git log v2-dev --oneline -- projects/structure-viewer
  examples/web/structure.html examples/web/jigsaw.js examples/web/nbt.js`
  (~75 commits; each message describes a fix/decision).
- Chat transcripts (user+assistant, includes reasoning for every decision):
  `C:\Users\ewanh\.claude\projects\E--Programming-Javascript-Minecraft-BlockModelRenderer\`
  - `801ebde9-5948-40fb-80a3-98c0f3fc7679.jsonl` (42MB, July 5) - the session that
    built the entire structure viewer. Extracted user messages already at
    `C:\Users\ewanh\AppData\Local\Temp\claude\E--Programming-Javascript-Minecraft-BlockModelRenderer\8ea66c28-c7f5-45fe-bd94-b7b2c49d17d3\scratchpad\user_msgs.txt`
    (mine assistant messages per-topic with grep/python over the jsonl).
  - `8ea66c28-c7f5-45fe-bd94-b7b2c49d17d3.jsonl` (July 6, current) - culling mask
    rework, getCullFaces switch, cache lifecycle.

## Library (block-model-renderer) facts that matter here

- Loaded from `http://localhost:8080/src/web.js` at runtime (Ewan's server hosts the
  repo; later becomes the real CDN URL). Its `assets.zip` resolves relative to web.js.
- Public API used: configure({ three }), prepareAssets(sources, { cache: true }),
  disposeCache, readFile, listDirectory, parseBlockstate, resolveModelData, loadModel,
  createAnimator, getCullFaces({ id, blockstates, neighbors, assets }), parseZip,
  isCrossModel, pauseAnimations/resumeAnimations, isWaterloggable.
- getCullFaces is the ONLY culling entry point (primitives are internal by design).
- prepareAssets array order: FIRST entry wins. Multi-pack overlay = user packs in
  order, then vanilla jar. Bundled overrides/fallbacks are added automatically.
- Cache lifecycle: { cache: true } per bundle; disposeCache(old) only AFTER the new
  scene swapped in; never dispose while players/scenes still render from it.
- default_blockstates.json (assets/block-model-renderer/) merges across packs:
  properties per-key higher-pack-wins, blocks = ordered rule array
  [{ match: "glob|glob", defaults: {...} }] first-match-wins.
- lighting values: "item" (default), "world", "scene", "off". SV uses world/off.
- three must be 0.162.0 to match the node renderer.

## Minecraft reference

- Decompiled 26.2 source: `C:\Users\ewanh\AppData\Roaming\.minecraft\versions\26.2\decompiled\`
  (used for jigsaw rules, EndCityPieces, WoodlandMansionPieces, physics constants).
- Client jar (assets + data/minecraft/structure + worldgen pools):
  `C:\Users\ewanh\AppData\Roaming\.minecraft\versions\26.2\26.2.jar`
- Test structures: `C:\Users\ewanh\AppData\Roaming\.minecraft\saves\Ewan's World\generated\minecraft\structure`
- Mod jars for testing packs/datapacks: Downloads has
  `dungeons-and-taverns-5.3.0 [NeoForge].jar`, `Jadens-Nether-Expansion-2.3.5.jar`,
  `26.2-Dokucraft-Light.zip`.
