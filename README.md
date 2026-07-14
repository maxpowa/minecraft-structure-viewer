# minecraft structure viewer

Browse, assemble and walk around Minecraft structures in the browser. Ground-up
rewrite of the structure viewer that lived in the block-model-renderer repo, as
a standalone Vue 3 + Vite app.

## Features

- Structure tree from the vanilla client jar (release or snapshot, downloaded
  and cached per channel) plus any number of resource packs / data packs / mod
  jars layered on top in an ordered overlay list.
- Filters: all / standalone / starters (from a scan of the worldgen template
  pools), text filter, and loading `.nbt`, `.litematic`, `.schem` and
  `.mcstructure` files from disk (Bedrock blockstates translated best-effort).
- Renderer: greedy meshing + texture atlases + face culling collapse most
  structures to a handful of draw calls; water/lava/fire stay animated; doors,
  trapdoors and gates stay live and toggleable.
- Jigsaw assembly: grow a structure through its template pools level by level,
  exactly like worldgen (weighted pools, fallbacks, joints, per-source overlap
  rules). Seeded and reproducible; seed + level persist in the URL.
- Procedural generators: igloo, end city and woodland mansion are assembled in
  code from the decompiled game logic, with the same level stepping.
- Shift/ctrl-click structures to pack several into one scene, each on its own
  floor grid; export the scene as `.glb` or `.obj`.
- Walk mode: pointer-locked first person with Minecraft physics: collision,
  step-up, sprint, crouch with edge guard, ladders, fly, noclip, view bobbing,
  and doors that open when you click them.

## Dev

```
npm install
npm run dev
```

The app loads the `block-model-renderer` library at runtime from
`http://localhost:8080/src/web.js` (a static server on the library repo stands
in for the CDN; it must send CORS headers). Override the URL with
`VITE_LIB_URL`. The app owns `three` and hands it to the library via
`configure({ three })`, so there is only ever one three instance.

## Structorium mod API mode

The viewer can read its structure list and structure data from a running
[Structorium](https://github.com/maxpowa/structure-dev-tool) mod instance instead
of scanning uploaded data-pack zips. The mod serves a read-only JSON API
(`/api/structures`, `/api/structure/<ns>/<path>?version=…`) and can host this
bundle itself. In this mode the sidebar's filter dropdown becomes a **version**
selector (Patched vs Original).

Render assets also come from the mod (`/api/assets.zip`): the mod (client-only)
serves the complete client assets (vanilla + mods + resource packs), so no Mojang
download is needed and modded blocks render. (The viewer still falls back to the
Mojang jar if a bundle ever reports itself incomplete.)

Enable it with either:

- `?api=<url>` at runtime — e.g. `npm run dev` then open
  `http://localhost:5173/?api=http://localhost:25599` (the mod's CORS is
  permissive, so a cross-origin dev server works).
- `VITE_API_BASE` at build time — an empty value means the same origin, which is
  how the mod-vendored build ships. Build it with:

  ```
  npm run build -- --mode mod
  ```

  See `.env.mod`. Normally you don't run this by hand: the mod's Gradle build
  runs it and bundles `dist/` automatically (checkout this repo next to the mod,
  or set `-PstructoriumViewerDir`). Building manually is only for pointing the
  mod's `web.viewerDir` at a `dist/` you serve yourself.

`?version=resolved|original|pack` (with `?pack=<id>`) selects which copy of a
structure to fetch and is shareable.

## URL params

- `?vanilla=<name>` load a vanilla structure, e.g.
  `minecraft/village/plains/town_centers/plains_fountain_01`; a
  comma-separated list restores a packed combination
- `?channel=snapshot` use the snapshot jar
- `?seed=<hex>&level=<n>` restore a jigsaw/procedural session
- `?api=<url>` read structures from a Structorium mod (see above)
- `?version=<kind>&pack=<id>` pick the structure version in API mode
