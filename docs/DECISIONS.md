# Decisions and behaviours the rebuild must preserve

Written from a full scan of the old code (`git show v2-dev:projects/structure-viewer/*`
in the BlockModelRenderer repo), the ~70 SV commits, and the July 5 transcript (user +
assistant messages). This is the spec: the new code is written from this document, not
by porting the old files. Every constant, rule, and bug fix below was hard-won; do not
regress any of them.

## 1. NBT reading

Minimal big-endian NBT reader, no dependency:
- Detect gzip by magic bytes (0x1f 0x8b) and inflate with the platform's native
  `DecompressionStream("gzip")` (structure block output is gzipped; plain NBT also occurs).
- DataView walker over all tag types (BYTE..LONG_ARRAY, LONG/LONG_ARRAY as BigInt).
- Root must be a compound; the root name is read and discarded.
- `readStructure(bufferLike)` returns `{ size, palette, blocks }`:
  - `size = root.size.map(Number)` (default [0,0,0])
  - `palette = root.palette ?? root.palettes?.[0] ?? []`, entries `{ Name, Properties? }`
  - `blocks = root.blocks.map(b => ({ state: Number(b.state), pos: b.pos.map(Number), nbt: b.nbt }))`
  - `palettes[0]` fallback matters: some vanilla files (shipwrecks) use the plural form.

## 2. Transforms (positions, directions, block states)

- `DIR` unit vectors for the 6 directions; `HORIZ = [north, east, south, west]`
  (clockwise looking down); `OPP` pairs.
- Rotation is k clockwise 90° steps about +Y with pivot ZERO, matching
  `StructureTemplate.transform` / `Rotation.CLOCKWISE_90 = +1`:
  - `rotDir(d, k)`: up/down unchanged, else advance k steps through HORIZ.
  - `rotPos([x,y,z], k)`: k=1 -> [-z,y,x], k=2 -> [-x,y,-z], k=3 -> [z,y,-x].
- Seeded rng: mulberry32-style (`s += 0x6D2B79F5` then the imul mix), returns [0,1).
  Fisher-Yates `shuffle(arr, rnd)` on a copy.
- `mix(a, b)`: per-level seed derivation, `imul((a ^ imul(b+1, 0x9E3779B1)), 0x85EBCA6B)`
  then `h ^= h >>> 13`. Used as `jigMix(seed, level)` so one level can re-roll independently.
- `strip(s)` removes a leading `minecraft:`.
- `parseState("ns:block[k=v,...]")` -> `{ Name, Properties? }`; bare names get
  `minecraft:` prefixed; empty/unparseable input becomes `minecraft:air`.
- `rotateState(props, k)` rotates directional properties:
  - `facing` (only if a real direction) via rotDir.
  - `axis` x/z swap when k is odd.
  - `rotation` (banners/signs, 16 steps): `(r + 4k) & 15`.
  - Connection sides (fences, walls, panes, redstone, vines): any of the four
    horizontal keys present are remapped as a set (read all old values first, then
    write to rotated keys, so chains don't clobber).
- Mirror (mansion only). MC applies mirror BEFORE rotation for both positions and
  states, so combine does `rotPos(mirrorPos(pos, mir), rot)` and
  `rotateState(mirrorState(props, mir), rot)`:
  - `"lr"` (LEFT_RIGHT) flips Z (north<->south); `"fb"` (FRONT_BACK) flips X (east<->west).
  - `mirrorState`: facing flipped via mirrorDir; stairs `shape` swaps inner/outer
    left/right ONLY when the facing axis equals the flipped axis; door `hinge`
    left<->right always; `rotation` uses the signed-centre formula
    (`c = r > 8 ? r - 16 : r`; lr -> `(8 - c + 16) % 16`, fb -> `(16 - c) % 16`);
    horizontal connection sides swap the pair on the flipped axis (handling
    one-key-present by delete/move, not undefined writes).
- Air classification (three distinct regexes, all namespace-tolerant `(^|:)`):
  - `AIR`: air, cave_air, void_air, structure_void (what a template treats as "not a block").
  - `STRUCT_VOID`: structure_void alone (never placed, never carves).
  - `REAL_AIR`: air/cave_air/void_air (carves when the piece overwrites).
- `jigsawsOf(struct)`: palette entries named `jigsaw`; orientation property
  `"<front>_<top>"` split on the LAST underscore (defaults `north_up`); nbt gives
  `pool`, `name`, `target`, `joint` (default `"rollable"`), `final_state`. Positions LOCAL.
- `worldJigsaw(jw, piece)`: pos rotated by piece.rot then offset; front/top rotated.
- `pieceBox(struct, k, off)`: rotate the 8 size corners, min/max, exclusive max
  (`x1 = hi+1`). `boxHit(a, b)`: interpenetration by MORE than 0.25 on all three axes
  (abutting pieces touch faces and must NOT count as a hit). `inBox` is min-inclusive,
  max-exclusive.
- `poolTemplates(pool)`: flat weighted list (each element repeated `max(1, weight)`
  times). `single_pool_element` and `legacy_single_pool_element` give their location;
  `list_pool_element` is approximated by its FIRST element's location;
  `empty_pool_element` pushes the `EMPTY` symbol. Locations are stripped of `minecraft:`.

## 3. Jigsaw solver

`runJigsaw(start, { loadStruct, loadPool, maxDepth, maxPieces, maxRadius, seed, levelSeed, onProgress })`
returns `{ structure: combine(pieces), pieces: count }`.

- Viewer calls it with `maxDepth: level, maxPieces: 128, levelSeed` (module defaults
  are 6/48/96; keep maxRadius 96).
- Growth is BFS one connection level at a time. Level d uses its own rng seeded
  `levelSeed(d + 1)` (which the viewer derives via `mix(seed, level)`), so re-running
  with a deeper maxDepth reproduces every earlier level exactly. This is what makes
  the stepped level menu stable and shareable-by-seed. (An earlier design salted and
  re-rolled the last level in place; it was removed because it broke seed
  reproducibility. Do not reintroduce "reload last level".)
- Pool and struct loads are cached in Maps (including nulls, so misses aren't retried).
- Per source-piece jigsaw:
  - `targetPos = worldJigsaw(...).pos + DIR[front]` (where the child jigsaw must land).
  - `attachInside = inBox(targetPos, src.box)`: the child attaches INSIDE the source
    (a house on a street plot, a feature/tower on a base plate). This distinction is
    THE fix for villages piling houses on each other and pillager outposts spawning
    15 tents (commit a526935, from decompiled `attachInsideSource` logic):
    - Inside children must fit entirely within the source footprint (x/z) and must
      not `boxHit` any box already recorded on `src.onPlot`. Placed inside children
      are pushed to `src.onPlot` (a per-source free region), NOT the global list.
    - Outward children (streets extending onward) collision-check against the global
      `boxes` list and are pushed there.
  - Candidates: `shuffle(poolTemplates(pool))` then, if `pool.fallback`, append
    `shuffle(poolTemplates(fallbackPool))`. Iterate; reaching `EMPTY` BREAKS (place
    nothing at this jigsaw, matching MC where empty elements are weighted "nothing"
    spots, e.g. outpost feature slots). Skip already-tried locations.
  - For each candidate template and each shuffled rotation k in [0..3], scan the
    child's jigsaws for `canAttach`:
    - `sourceFront === OPP[rotDir(childFront, k)]`
    - joint: `sj.joint !== "rollable"` requires tops to match (`sj.top === rotDir(cj.top, k)`)
    - name matching: `sj.target === cj.name`
  - Placement: `off = targetPos - rotPos(cj.pos, k)`; box via pieceBox; reject if the
    box centre's horizontal distance from origin exceeds maxRadius; reject on the
    overlap rule above; else place, record `{ struct, rot, off, depth: d+1, box }`,
    add to next frontier, `onProgress(count)`, stop trying candidates for this jigsaw.
- Stop when maxPieces reached or a level places nothing.
- Piece/pool references resolve across namespaces: refs are `"<ns>:<path>"` or bare
  (implied `minecraft:`). The viewer's loaders map a piece ref to its real zip path via
  the structure index (which knows `structure/` vs legacy `structures/` folders), and a
  pool ref to `data/<ns>/worldgen/template_pool/<path>.json`. This fixed
  dungeons-and-taverns (nova_structures namespace) jigsaws silently not growing.

## 4. Combine (flatten placed pieces into one structure)

`combine(pieces)` where each piece is `{ struct, rot, off, mir?, ow? }`:
- Iterate pieces in order into a `Map` keyed by world cell; later pieces win a cell.
- Per block: `gp = rotPos(mirrorPos(pos, mir), rot) + off`.
- `STRUCT_VOID` never touches the world (skip).
- `REAL_AIR`: if the piece has `ow` (overwrite), DELETE the cell (carve); else skip.
  `ow` maps MC's per-piece `BlockIgnoreProcessor`: `STRUCTURE_BLOCK` processor =
  template air IS placed (carves doorways, ladder shafts, window openings through
  earlier pieces); `STRUCTURE_AND_AIR` = air skipped. Jigsaw pieces never carve
  (villages are placed with STRUCTURE_AND_AIR); igloo and mansion always carve; end
  city is per-piece (see 5).
- `structure_block` data markers are invisible and dropped, EXCEPT the mansion's
  `ChestWest/East/South/North` metadata markers, which become
  `minecraft:chest` with `facing: rotDir(dir, rot)` and `type: "single"` (facing uses
  rotation only, as vanilla does; mob-spawn markers like Mage/Warrior are dropped).
- `jigsaw` blocks are replaced by their parsed `final_state`; air results dropped;
  properties get mirrorState + rotateState.
- All other blocks: `{ Name, Properties: rotateState(mirrorState(props, mir), rot), nbt }`.
- Normalise to a non-negative grid (subtract per-axis minimum), dedupe the palette by
  Name+JSON(Properties), and return `{ size, palette, blocks, anchor }` where
  `anchor = [-lo.x, -lo.y, -lo.z]` is where the start piece's local origin sits in the
  normalised grid. The viewer uses anchor to keep the start piece visually fixed while
  the growing assembly re-centres (see 13).
- Empty input returns a 1x1x1 air structure.

## 5. Procedural generators (assembled in code, not pools)

All three return `{ structure: combine(...), maxDepth }` where maxDepth is the natural
full depth for THIS seed. They take `(loadStruct, { maxDepth, seed })`; the full tree
is always generated from the seed, pieces are tagged with a step depth, and `maxDepth`
filters which pieces are revealed. That makes levels monotonic and deterministic (the
same seed at level N is always a prefix of level N+1), which is what lets them share
the jigsaw level menu. Per-level re-roll is impossible (single random stream), so the
menu hides "reload all levels" for procedurals.

- **Igloo** (IglooPieces): top at depth 0; ladder shaft `middle` pieces at
  `[2, -3 - i*3, 4]` depth 1; `bottom` (basement lab) at `[0, -3 - d*3, -2]` depth 2;
  ladder length `d = rand(8) + 4` (4-11) stays random. Vanilla rolls the basement only
  50% of the time; we ALWAYS build it (a bare top is just the plain igloo you can
  already load, the session would have nothing to step to). All pieces `ow: true`.
  Natural maxDepth 2.
- **End city** (EndCityPieces, faithful port):
  - Templates loaded up front by name list (base_floor..fat_tower_top).
  - Piece connection: `childOrigin = parentOrigin + rotPos(offset, parentRot)` (MC's
    `calculateConnectedPosition` with default pivot collapses to this).
  - Subtree collision pruning: each generator (`houseTower`, `tower`, `towerBridge`,
    `fatTower`) builds its children into a fresh list; the subtree is dropped whole
    if any child's box hits a piece from a DIFFERENT group (`gen` tag; a piece with
    `gen: -1`, the bridge stubs, is exempt). Recursion depth caps at 8.
  - `ow` per piece exactly as the Java `overwrite` flags: everything true EXCEPT the
    interior `second_floor_*`, `third_floor_*`, `second_roof` pieces. This is what
    opens doorways/ladders through walls (was a real bug: closed doorways).
  - Ship: at most one per city, `nInt(10 - depth) === 0` chance at each bridge end,
    offset `[-8 + nInt(8), ny, -70 + nInt(10)]`. A LOW ship is vanilla-accurate (no
    height rule in MC; ny is just where the bridge ended). If the ship doesn't spawn
    the bridge must instead grow a houseTower or the whole bridge subtree fails.
  - Bridge tables: `TOWER_BRIDGES = [[0,[1,-1,0]],[1,[6,-1,1]],[3,[0,-1,5]],[2,[5,-1,6]]]`,
    `FAT_BRIDGES = [[0,[4,-1,0]],[1,[12,-1,4]],[3,[0,-1,8]],[2,[8,-1,12]]]` (rotation
    delta + offset).
  - Step depths (user-tuned, important): depth = graph distance from the root, one per
    outward piece, EXCEPT pieces that ALWAYS come together stay on their parent's step
    (`grp` flag): a building's floors + roof are one step with its base; tower_base +
    its first tower_piece are one step; fat_tower_base + first middle are one step.
    The root building (base_floor + second_floor_1 + third_floor_1 + third_roof) is
    all depth 0. Rationale: "load next" should reveal one thing outward at a time,
    but a room that never appears without its roof loads with it.
- **Woodland mansion** (WoodlandMansionPieces, full port; one-shot, no steps):
  - 11x11 grid, entrance at (7,4); flood-filled corridors (`recursiveCorridor`, depth
    6 for the two main + 3 for the two side corridors) and `cleanEdges` looped to
    fixpoint; the exact seed-consuming order of the Java must be preserved.
  - Room identification with bit flags: type 65536 = 1x1, 131072 = 1x2, 262144 = 2x2;
    roomId in low 16 bits; 1048576 = door cell, 2097152 = door-to-corridor flag,
    4194304 = stairs room, 8388608 = entrance/stairwell marker. Door corner selection
    walks the 4 corners looking for a corridor edge.
  - Third floor: pick a random 1x2 corridor-doored room on floor 1 as the stairwell,
    grow a depth-4 corridor from a random free side; if none, the third floor is empty
    and the room flag is reverted.
  - Piece placement (`createMansion`): entrance piece, outer wall traversal per floor
    (wall_flat ground, wall_window upper; turns emit wall_corner), third-floor wall
    walk from its first house cell, roofs at +16/+27 (roof, roof_front, roof_corner,
    roof_inner_corner, and small_wall/small_wall_corner where an upper floor sits on
    a lower roof), then per floor: corridor_floor + carpet edges (carpet_north/east
    fixed, carpet_south_1/2 and carpet_west_1/2 by floor), indoors_wall_1/2 and
    indoors_door_1/2, and rooms via the room collections:
    floor 0 `1x1_a1-5 / 1x1_as1-4 / 1x2_a1-9 / 1x2_b1-5 / 1x2_s1-2 / 2x2_a1-4 / 2x2_s1`,
    floors 1-2 `1x1_b1-5 / 1x2_c(+_stairs) / 1x2_d(+_stairs) / 1x2_se1 / 2x2_b1-5 / 2x2_s1`.
  - Rooms rotate AND mirror to face their door (`addRoom1x2`/`addRoom2x2` dispatch
    tables with "lr"/"fb" mirrors; `zeroPosT` compensates the template origin under
    mirror+rotation). Mirror support exists ONLY for the mansion.
  - All pieces `ow: true`. Floor y-offsets `8*floor + (floor==2 ? 3 : 0)`.
  - No steps (`steps: false` in the PROC table): it just builds whole, with a
    "rebuild" re-roll button instead of the level menu. maxDepth 1.

## 6. Optimiser

Pure transform: `optimise(structure, templates, statusLabel, position)` ->
`{ group, atlasTextures, drawCalls, tris }`, built detached and swapped in by the app.
Merges the per-palette-entry template groups + the block list into a few atlased,
greedily meshed meshes. Key rules:

- **Material grouping**: `matSignature` groups library shader materials by every
  shading uniform EXCEPT the map (side, shadeEnabled, d0, d1, ambient, light0, light1),
  plain materials by type+side. Materials differing only in texture share an atlas.
- **Animated faces** (`GameTime` uniform or `map.userData.frames`): never atlased,
  never merged; accumulated into one mesh per (signature, animated texture identity)
  reusing the ORIGINAL live material. Fix the material IN PLACE (do not clone: cloning
  clones the animated texture and breaks playback): `transparent = isTranslucent(tex)`,
  `depthWrite = !transparent`. This puts opaque animated blocks (lava) in the opaque
  pass and translucent ones (water) in the blend pass.
- **Opaque vs translucent split**: textures are classified by alpha scan.
  Translucent = ANY pixel with 0 < alpha < 255 (stained glass, ice). Cutout textures
  (alpha only 0/255, leaves) count as OPAQUE: they must depth-write or they hide
  geometry behind them. Translucent groups draw transparent WITHOUT depth write;
  with depth write, whichever glass face draws first in a merged mesh hard-occludes
  the ones behind, so glass was see-through from one side only (real bug, b293e88).
- **Culling**: per block, `getCullFaces({ id, blockstates, neighbors })` from the
  library (bound to the current assets), memoised on `state + "|" + 6 neighbour
  states` (structures are repetitive; most blocks share an answer). Neighbours are
  passed as `{ id, ...Properties }`. A face is skipped when its authored `cullface`
  world direction (carried on `mesh.userData.cullface[materialIndex]`, rotated by the
  library) is in the block's cull set. Applied on all three paths: greedy, atlas,
  animated.
- **Flat-face extraction** (`extractFlat`): per geometry group, in the template's
  world frame, a face qualifies for greedy meshing if its normal is axis-aligned
  (>0.99), all verts coplanar (0.01), the outline is an exact rectangle, and UVs are
  non-degenerate. Everything else (crosses, torches, rotated elements) falls to the
  atlas path. The extracted cell records: plane axis + sign, in-plane rect (a0,b0,
  wa,wb), plane coord pc, the SOURCE texture sub-rect it samples (computed from UV
  extremes vs texture size), whether the u axis maps to the first plane axis, the
  6 index-order verts with corner flags + normalised UVs, and a `cellKey` =
  `pixelHash:subrect:size:orientation`. Orientation is a canonical corner->uv map
  (2 decimals), NOT raw vertex order, so a slab top, stair top and full-cube top with
  one texture merge despite different windings.
- **Coplanar-overlap demotion**: within one template, flat faces on the same plane
  whose rects overlap (grass block side + tinted overlay) are BOTH demoted to the
  atlas path in submission order, else the merged quads z-fight / flip draw order.
- **Greedy meshing**: bucket flat faces across all placed blocks by
  `(axis, plane coord, normal sign, cellKey, phaseA, phaseB)` where phase = world
  offset mod cell size (so equal faces at odd offsets still align to a lattice);
  each face occupies lattice cell `round((w - phase)/cellSize)`. Merge each bucket's
  cell set into maximal rectangles (greedyRects: sort row-major, grow along a then b,
  mark done). Emit one quad per rect chunk, chunked so a pre-tiled texture never
  exceeds MAX_TILE=512 per side. The quad's texture is the cell's source sub-rect
  tiled ur x vr into an OffscreenCanvas (cached by cellKey+repeats; cache cleared per
  optimise run), added to the signature's atlas as a pseudo-texture
  `{ image, colorSpace }`.
- **Atlases**: per (signature + T/O) group, pack textures deduped by FNV-1a pixel hash
  (keyed on the image object, so shared tiled canvases share hashes; hashing canvases
  use `willReadFrequently`) into shelf-packed atlases sorted by height desc, 1px
  extruded-edge gutter (nearest filter never bleeds), spill to a new atlas past
  MAX_ATLAS=8192. CanvasTexture, nearest mag/min, no mipmaps, source colorSpace.
  One material clone per atlas (map swapped, transparent/depthWrite per group), one
  merged mesh per (signature, atlas), plus one mesh per animated group.
- **Per-block accumulation**: template mesh faces transform by
  `blockTranslation(pos*16) * meshWorldMatrix`; normals via normal matrix; UVs remap
  into the atlas rect (atlas and source share flipY, so u is straight and v flips).
  Yield to the event loop with a status update every 2000 blocks (and the build's
  template loop every 400) so the UI stays responsive.
- Draw call / triangle counts of the merged group are returned for the info readout.

## 7. Walk mode

`createWalk(deps)` returns `{ update(dt), exit(), get on() }`. World units: 16 = one
block. Constants (all matched to Minecraft):
- Half-width `PW = 4.8` (0.3 blocks). Standing box 28.8 (1.8), eye 25.92 (1.62);
  sneaking box 24 (1.5), eye 20.32 (1.27). Can't-stand check keeps you crouched under
  low ceilings.
- `STEP = 9` auto step-up (slabs + stair fronts); only while grounded and not moving
  up; after a successful step the camera EASES up (`stepSmooth` decays
  `0.5^(dt/0.045)`, snap at <0.05) instead of snapping, like MC.
- Speeds: sneak 26, walk 78, sprint 118 (~1.6 / 4.9 / 7.4 blocks/s); fly 140,
  fly-sprint 260. Gravity 520 per s². Jump velocity 134. Ladder climb ±48, idle
  slide -18, sneak holds (0).
- `DOUBLE_TAP = 350`ms: Minecraft's 7-tick window, for both double-space fly toggle
  and double-W sprint (sprint latches until W released; ctrl or Q also sprint).
- View bobbing is MC's `GameRenderer.bobView` exactly: `walkDist += moved * 0.6` (in
  blocks) drives phase `wp = dist * PI`; `bob` is smoothed horizontal speed clamped
  0..0.1 with MC's 0.4-per-tick lerp (`1 - 0.6^(dt/0.05)`), zero when airborne/flying;
  camera sway `sin(wp)*B*0.5*16` along the yaw-right axis, bounce `|cos(wp)*B|*16`
  down, pitch `|cos(wp - 0.2)*B|*5°`, roll `sin(wp)*B*3°`. An earlier made-up bob was
  rejected as "really bad compared to in game".
- Collision: world AABBs from the app (`currentBoxes` + all collected structures'
  cached boxes) inserted into a spatial hash of 16-unit cells; ground plane at
  `sceneBounds().min.y`. Move per axis then snap out of the deepest overlap. Boxes you
  are ALREADY inside are exempt for that move (a door closed on you must not fling
  you to its far side / through the roof); you walk out of them instead.
- dt clamped to 0.05.
- Sneak edge-guard: a horizontal move that would leave you unsupported is undone.
  `supported()` probes a full STEP below the feet, and the guard is active while
  grounded OR supported (not only strictly grounded): this keeps it working during
  the little falls between stair steps going down, while still allowing sneaking down
  slabs/stairs like MC.
- Ladders (`CLIMB = /(ladder|scaffolding)$|(^|:)vine$/`): climbable if the block at
  the player CENTRE column is climbable at either `feet+1` or mid-body. The low
  sample sits just above the feet so you keep climbing until your feet clear the top
  block, and residual upward speed carries you onto the ledge (with a higher sample
  you bob at the top forever). W climbs, S descends, sneak holds, space+grounded jumps.
- Fly: double-space toggles; space up, sneak down, no gravity, still collides.
- Noclip (N): move along the LOOK vector (pitch included), no collision, no gravity;
  entering disables fly; LEAVING noclip bumps you up out of any block. Entering walk
  mode also bumps: `bumpUp` lifts in 2-unit steps until there is a FULL 2-block gap
  (32 units), not just the 1.8 player box (3a9a0e0).
- Enter: from the current camera (feet = eye - standing eye height), same yaw/pitch
  (forced back to perspective if ortho was on), FOV 45 -> 78, pointer lock,
  build collision, reset bob/step state.
- Exit (esc/button/pointer-lock loss): restore FOV, hand OrbitControls a clean pose:
  camera at the walk head with the walk yaw/pitch (roll cleared), orbit target 48
  units AHEAD along the look. A target at the eye is degenerate (zero radius) and
  froze the camera until "fit view" (real bug, ae1a37d).
- Input: keydown/keyup `preventDefault()` while walking (no ctrl+S / quick-find /
  space-scroll leaks); keys tracked by `e.code` in a Set, cleared on exit.
- Doors: mousedown (either button) while locked raycasts via `interact`; on toggle
  the collision hash is rebuilt. The door in reach gets a Box3Helper outline (black,
  50% alpha, expanded 0.2) that follows `aimDoor` each frame.
- Crosshair: fixed element pinned to the CANVAS centre (the sidebar offsets the
  canvas, the viewport centre is wrong), repositioned on resize. Style: two white
  gradient bars in ONE element with `mix-blend-mode: difference` so it inverts the
  scene behind it (two blended elements self-blend into a black centre dot; single
  element was the fix).

## 8. Packs and assets

- Base = the latest vanilla client jar from Mojang, channel `release` or `snapshot`.
  Manifest + jar fetched through the cors proxy `https://cors.ewanhowell.com/`
  (piston-meta/piston-data send no CORS headers). Download streamed with a byte
  progress callback (shown as "downloading <ver>... X/YMB").
- Jar cached in Cache Storage (`caches.open("mc-client-jars")`) under a synthetic
  key per channel + version; on load, stale versions of the same channel and
  legacy-format keys are evicted; the other channel's cache entry is kept
  (release and snapshot cached independently, switching never re-downloads).
- OLD behaviour: one user pack over the base. NEW (locked decision): an ordered
  multi-pack overlay list: user packs in priority order, vanilla at the bottom,
  add/remove/reorder. Maps directly to `prepareAssets([pack1, ..., vanillaJar],
  { cache: true })`: FIRST entry wins. Resource packs are overlays and don't contain
  every model, hence the vanilla base under them.
- Cache lifecycle: `prepareAssets(..., { cache: true })`; on any pack change keep the
  previous bundle alive until the new scene has swapped in, then `disposeCache(prev)`
  (door clones and animation players share cached textures; disposing early breaks
  the still-visible scene).
- On pack change the old app re-indexed (worldgen sets and struct list reset,
  `populateVanilla`), and rebuilt the current structure with the new assets (a
  vanilla structure re-READS from the new jar since its blocks may differ). Whether
  the rebuild should stay automatic is an open UI question (gallery precedent is
  explicit action only), but re-LISTING must happen on pack change either way.
- Base jar failure is non-fatal: status says so, user packs can still be used alone.
- Query param `?channel=snapshot` persists the channel.

## 9. Structure discovery and sidebar tree

- Structures = every `data/<ns>/structure/*.nbt` AND legacy/mod `data/<ns>/structures/*.nbt`
  (regex `^data\/([^/]+)\/structures?\/(.+)\.nbt$`; the plural form fixed Jaden's
  Nether Expansion, 83 structures under `netherexp`). Names are `<ns>/<path>`.
- Scan the UNION of zip keys across the base jar and every user pack (each parsed
  with the library's `parseZip`), keeping a `name -> real zip path` map (the folder
  may be `structure` or `structures`); reads go through `readFile(zipPath, assets)`
  so the highest-priority pack's copy wins.
- Tree UI: nested `<details>` folders, lazily filled on first expand; chains of
  single-child folders compact into one `a/b/c` row (files keep their leaf name);
  the namespace level is HIDDEN when only one namespace exists (the all-minecraft
  case), shown as folders when packs add more; the `minecraft` folder auto-opens
  (eager-filled) at top level. Count badge shows `N` or `filtered/N`.
- Text filter: flat list of matches (case-insensitive substring on the full name),
  capped at 500 rows with an "...and N more" footer.
- `user-select: none` on the tree; selection highlight tracked by name and re-applied
  wherever the row currently is in the DOM.
- Loading a structure is locked out while a build runs.
- User `.nbt` upload loads through the same pipeline (clears sample/vanilla params;
  file inputs can't persist in the URL).
- Old app also had bundled repo samples + a hand-built `debug` scene for testing the
  greedy mesher. The rebuild keeps a debug scene generator (it was invaluable:
  slab/stair runs, mixed-texture checkers, grass overlay gaps, glass, walls,
  dirt path, cube-vs-slab cull cases, water/lava source+levels 1-7, two-tall mixed
  stained glass wall) behind a dev-only entry; repo sample .nbt files are optional.

## 10. Worldgen index and filters

One lazy pass over `data/*/worldgen/` JSONs (all namespaces, union of zips) builds:
- `startPoolDepth`: worldgen/structure JSONs with a string `start_pool` map that pool
  name (nsified `ns/path`) to the structure def's `size` (generation depth, default 7).
- For every template_pool JSON: collect element locations (single/legacy elements'
  `location`, plus nested `elements[].location` for list elements), nsified.
  - Pools that ARE a start pool: their members get `depth = structure size` recorded
    (used as the session's full depth) and are marked `startMembers`.
  - All other pools' members are `childRef` (they are placed by something else).
- `starterSet` = structures never childRef'd. Procedural structures assemble in code
  (not pools), so their non-entry pieces are manually removed from starters (PROC
  table: igloo/top, end_city/base_floor, woodland_mansion/entrance are the entries).
- `standaloneSet` = starters that are NOT startMembers and NOT procedural entries
  (they neither get loaded by others nor load anything themselves; entity spawns
  don't count).
- Filter dropdown: all / standalone / starters. Computed lazily on first non-"all"
  selection ("..." count while computing), invalidated on pack/channel change.
- Depth for a jigsaw session comes from `structDepth.get(name) ?? 7`; growing from a
  non-starter piece just uses the default (acknowledged as fine).

## 11. Build pipeline and templates

- One template per palette entry: `parseBlockstate(assets, name, { data: props ?? {},
  ignoreAtlases: true })` -> for each model `resolveModelData` + `loadModel(group,
  assets, data, { display: {}, lighting, animate: false })`. `ignoreAtlases` skips
  per-texture atlas-membership reads (pointless for real blocks, big load-time win).
  Air (`air/cave_air/void_air/structure_void`) has a null template. Model failures
  are swallowed (missing modded blocks simply don't render).
- Legacy data-fixes before parsing (structures saved in old versions):
  - Renames: `grass -> short_grass`, `grass_path -> dirt_path`, `chain -> iron_chain`,
    `sign -> oak_sign`, `wall_sign -> oak_wall_sign` (exact-id lookup, so grass_block
    is untouched).
  - Property fixes: `*_wall` boolean sides `true/false -> low/none` (1.16 format).
  - Full fidelity would need MC's data fixers; these cover the common cases.
- Waterlogging needs NO viewer code: blockstate properties are strings and the
  LIBRARY handles `waterlogged: "false"` correctly (that was a library bug found via
  this viewer: `"false"` is truthy in JS).
- `nonSolid` set (no walk collision): states whose model elements are ALL flat planes
  (`from == to` on some axis): cross plants, vines, ladders, rails, saplings.
- Openable blocks are pulled OUT of the optimised structure and pre-built as both
  open and closed templates (see 12).
- Per-template raw draw-call/triangle stats are summed over placements for the
  "raw -> optimised" info readout.
- Centring: the structure group is positioned at `gridCentre(-(size-1)*8)` per axis
  where `gridCentre(v) = round((v - 8)/16)*16 + 8`. Templates are block-CENTRED, so a
  centre ≡ 8 (mod 16) puts every block in a whole grid cell instead of straddling
  lines (odd dimensions used to sit half-off the grid, which also broke the walk-mode
  cell mapping and ladders).
- The new group is built DETACHED while the old stays visible, then swapped
  atomically and the old group + its atlas textures disposed (no blank flash; a
  setting toggle rebuild never resets the camera). Dispose skips meshes flagged
  `userData.shared`.
- Camera refit only on brand-new structure loads (and the first procedural
  assembly), never on level ops or setting toggles.
- Info readout (status bar): transient text while building ("building... i/N",
  "optimising..."), then a compact info icon whose tooltip (easy-tooltips, HTML)
  shows size, block count, palette entries, collected count, and
  `draw calls raw -> opt` / `triangles raw -> opt` rows with an arrow.
- Yield cadence: every 400 blocks during template placement.

## 12. Doors, trapdoors, gates

- `OPENABLE = /(^|:)([a-z_]+_)?(door|trapdoor|fence_gate)$/` AND the palette entry
  must actually have an `open` property.
- Never baked into the optimised mesh. For each openable block, ensure palette
  entries for BOTH `open=true` and `open=false` exist (append if missing), build
  templates for both, clone both onto the root at the block position, and show the
  one matching the current state.
- Toggling flips `b.state` to the other palette index and swaps visibility; walk
  collision follows automatically because `currentBoxes()` reads `b.state`. Door
  halves (doors only, not trapdoors) pair with the door cell directly above/below
  and toggle together.
- `rayDoor`: march the look ray in 2-unit steps to reach 80 (5 blocks), dedupe
  repeated cells, return the first openable cell; a non-air solid cell stops the
  march (you can't reach through walls).
- Cell mapping: block geometry is centred on `i*16`, so the cell is the NEAREST
  multiple of 16: `round((w - root)/16)`, NOT floor (floor made every block straddle
  two cells; broke ladders and door clicks).

## 13. Level sessions (jigsaw menu, seeds, URL)

- A session (`jig`) exists for jigsaw structures (any palette block named `jigsaw`)
  and steppable procedurals loaded ON their entry piece. Mansion (steps: false) gets
  the one-shot assemble/rebuild button instead; the two are mutually exclusive.
- Internal `level` is 0-based; the UI shows `level + 1` ("level 1" = the raw base).
- Seed semantics (exact, user-specified):
  - Level 1 (base) is seedless and always identical: it is just the loaded structure.
  - The seed is picked (`rand32()`) when you FIRST advance off level 1; each fresh
    ascent from the base picks a new one. Once past level 1 the seed is fixed and
    stepping up/down is stable.
  - Jigsaw levels derive per-level rngs via `mix(seed, level)`; a procedural runs its
    single stream from the seed and filters by depth.
  - Menu ops: next (++, capped), all (-> maxDepth), undo (--), reset (-> 0),
    reloadAll (fresh seed, SAME depth; jigsaw only, hidden for procedurals),
    fullReload (fresh seed, -> full maxDepth). Buttons disable at the ends
    (atMax/atBase); for procedurals the per-seed natural depth is probed by running
    the generator once at Infinity, so "next" disables at the TRUE end (an igloo
    always has its basement here; end city depth varies by seed).
  - Jigsaw maxDepth re-reads `structDepth` (worldgen size); default 7.
- Regenerate = re-run `resolve(level)` from the FIXED base, rebuild, keep camera.
  Because the assembly re-centres each build, the camera is shifted by how far the
  base piece's `anchor` moved in world space (prevAnchorWorld tracking), so the start
  piece appears to stay put while the build grows around it.
- URL persistence: `?vanilla=<name>` or `?sample=<name>`; `?seed=<hex>` (hex so it is
  obviously ours, not a decimal MC world seed) and `?level=<1-based>` only when a
  session is past the base. On load: a mansion entry with a seed one-shot generates
  at that seed; a jigsaw/steppable entry loads, adopts the seed, re-probes/looks up
  maxDepth, clamps the level, and regenerates. `history.replaceState` throughout.
- The bottom-right menu shows "structure blocks · level N" with an expandable panel;
  hidden when no session; the whole menu + sidebar are pointer-events-locked during
  a solve/build.
- Menu label wording, statuses ("loading... N pieces" during solve) and the locking
  refcount (`lockDepth`, sync-lock BEFORE the first await) all carry over.

## 14. Camera, grid, view options

- Perspective FOV 45, near 0.1 far 5000, initial pos (60, 45, 60); OrbitControls
  with damping. Fit view: bounding sphere of current + collected, iso angle
  (30° pitch, 225° yaw), distance `radius / tan(FOV/2) * 1.1`, resets up/zoom,
  orthoHalfH = radius * 1.1.
- Ortho toggle: shared position/up/zoom on switch; half-height derived from the
  current distance when enabled manually. If ortho was turned on AUTOMATICALLY
  (e.g. by a future icon-view control), any orbit interaction reverts to
  perspective; a manual toggle sticks (`orthoManual`).
- Renderer: `alpha: true, antialias: false`, pixel ratio `min(devicePixelRatio * 2, 4)`,
  sized to canvas clientWidth/Height via ResizeObserver.
- Grid: GridHelper, one line per block (span/16 divisions), colours 0x444448 /
  0x333336, hidden while wireframe is on (the override material makes it a mess) and
  by its own toggle. Span = max(64, ceil(sceneSpan/64)*64 + 64), position snapped to
  multiples of 16 (lines land on block boundaries), y = scene bottom - 0.01. Remade
  after every build/collect to span the whole scene.
- Wireframe: `scene.overrideMaterial = MeshBasicMaterial({ wireframe: true,
  color: 0x9fd0ff })`; no per-material changes.
- Lighting select: world (default) / off, passed to `loadModel`; changing it rebuilds
  in place (no camera reset). gui/scene modes were deliberately removed for this app.
- Old scene had leftover Ambient+Directional lights; they do nothing for the shader
  materials. Do not carry them over unless something visibly needs them.
- Render loop: single rAF; while walking, `walk.update(dt)` replaces
  `controls.update()`; animators (current + collected) update every frame;
  `renderer.render(scene, camera)`.

## 15. Collect mode

- Checkbox: new loads append BESIDE the current scene instead of replacing.
- The current structure is "committed": its group, animator, world-space collision
  boxes, and atlas textures move into a `placed` list (texture ownership transfers so
  the next build's swap doesn't dispose them). Layout is left-to-right:
  `curOffsetX = sceneRight + 32 + newSize.x * 8`, sceneRight advances by the
  committed structure's extent.
- Walk collision, sceneBounds/fit, export, and animation updates all include placed
  structures. A clear button disposes them all (groups + textures) and rebuilds the
  current structure at offset 0.
- With collect OFF, loading clears all placed structures first.

## 16. Export (.glb / .obj, optimised or raw)

- Dropdown with four options; export the CURRENT scene (root + all collected).
- Live shader materials aren't portable: every visible mesh is cloned with a
  converted `MeshStandardMaterial` (map, `transparent` carried over, `alphaTest 0.5`
  for non-transparent i.e. cutout, roughness 1, metalness 0, side kept), baked to
  world space via matrixWorld.
- Atlas/greedy textures are OffscreenCanvas-backed, which exporters reject: redraw
  each onto a real `<canvas>` CanvasTexture (colorSpace/flipY/wrap/nearest copied).
  Conversion caches keyed by source material/texture.
- Hidden subtrees are skipped (walk any parent chain for `visible === false`): the
  non-showing door half must not export.
- Raw mode rebuilds the un-merged scene: one positioned template clone per block
  (every face, separate textures, no culling). Collected structures always export
  as their optimised groups.
- GLTFExporter binary -> `.glb`; OBJExporter -> `.obj`. Filename from the selected
  structure leaf name (+ `-raw`). Download via object URL, revoked after 2s.

## 17. Locking, status, progress

- One reference-counted lock covers EVERYTHING that can start a load: toolbar/sidebar
  controls disabled, sidebar + level menu pointer-events off. `withLock` ignores
  re-entry (`locked` check) and locks SYNCHRONOUSLY before any await (a click in the
  pre-build async gap must not race). Nested locks (build inside a jigsaw solve)
  balance via the refcount.
- `building` flag prevents overlapping builds.
- Status element: transient text (progress, errors in red) or the info icon +
  tooltip. Solver progress reports placed piece count.

## 18. Known quirks / open questions for the rebuild

- Pack change auto-rebuild of the current structure: old app did it; decide
  explicitly (multi-pack list makes rebuild-per-edit worse; consider an explicit
  apply, matching the gallery's no-auto-render precedent).
- easy-tooltips (Ewan's own lib) rendered the info tooltip; fine to keep via CDN, or
  replace with a small in-app tooltip. Material Symbols are approved.
- `window.THREE` global was old-app pragmatism; in the Vue app import three normally
  (the app owns three@0.162.0 and hands it to the library via `configure({ three })`).
- Old samples fetched from the library repo (`/tests/web/structures/*.nbt`); the new
  standalone app should either bundle a few sample .nbt files or drop samples
  (keep the generated debug scene; it needs no files).
- jigsaw `maxPieces: 128` in the viewer (solver default 48) and `maxRadius: 96`:
  keep viewer values.
- Level-menu buttons were plain text; the rebuild restyles freely (sidebar layout,
  Material icons) but keeps the exact op semantics of section 13.
- The mansion's exact seed-consumption order matters for reproducing a given seed's
  layout in-game only loosely (we use our own rng anyway); what MUST hold is
  determinism: same seed -> same mansion, level filtering stable.
- Structure entity NBT (`b.nbt`) rides along in combine and readStructure but only
  `final_state`/`metadata` are consumed; keep carrying it (future block-entity use).
