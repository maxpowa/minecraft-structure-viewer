# Progress

Update this file with every commit. It is the handoff document: a fresh session with no
other context must be able to resume from here (read docs/PLAN.md and docs/SOURCES.md
first, then this).

## State

- Phase: 0 (research) COMPLETE. The full forensic pass is done:
  - Every old module read end to end (app.js, optimise.js, jigsaw.js, combine.js,
    walk.js, generators/{igloo,endcity,mansion,index}.js, nbt.js, transforms.js,
    structure.html, style.css, mojang-pack.js).
  - Full SV commit history walked (~70 commits, oldest-first).
  - July 5 transcript mined: all 841 user messages plus the assistant messages
    (extracted to scratchpad assistant_msgs.txt, grepped per area) for the free-region
    overlap fix, ow/carving semantics, ship-height verdict, per-level seed design and
    why "reload last level" was removed, view-bob formulas, namespace + `structures/`
    folder fixes, and the waterlogged-string library bug.
- **docs/DECISIONS.md is written and is the spec.** 18 sections: nbt, transforms,
  jigsaw solver, combine, generators, optimiser, walk, packs, discovery/tree,
  worldgen index/filters, build pipeline, doors, level sessions/seeds/URL,
  camera/grid/view, collect, export, locking, open questions. Write the new code
  from it; do not port the old files.
- No app code exists yet.

## Next steps

1. Scaffold Vite + Vue 3 app (PLAN.md build order step 1): base layout
   (sidebar + viewport), library bootstrap (configure({ three }), runtime import of
   http://localhost:8080/src/web.js), Material Symbols.
2. Then follow PLAN.md's build order 2-10, implementing each area from DECISIONS.md,
   committing + Playwright-testing each step and updating this file every commit.
3. Open questions to settle with Ewan when relevant (DECISIONS.md section 18):
   pack-change auto-rebuild or explicit, easy-tooltips vs in-app tooltip, samples.

## Environment notes

- Ewan hosts `http://localhost:8080/` serving the BlockModelRenderer repo (library dev
  CDN stand-in). Playwright MCP is the browser-testing tool (NOT the preview MCP).
- Vite dev server: run in background, test pages with Playwright against it.
- Do not run npm render scripts in the library repo; visual verification is Ewan's.
- Commit style: lowercase, terse, subject well under 72 chars, body only when it earns
  its place, never any attribution. No emdashes in ANY prose or code, ever
  (rephrase with colon/comma/parentheses); do not strip them from quoted material.
