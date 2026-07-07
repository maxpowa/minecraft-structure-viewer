// Hand-built showroom for the greedy mesher, loaded via ?debug. Nothing hides
// behind anything; toggle wireframe to see whether a run merges into one quad.
// Each row is a case the mesher should handle. ?debug=fluid renders just the
// water levels row for eyeballing surface heights against the game.
export function makeDebug(kind) {
  const palette = [], pi = new Map()
  const st = (Name, Properties = {}) => {
    const k = Name + JSON.stringify(Properties)
    if (!pi.has(k)) {
      palette.push({ Name: "minecraft:" + Name, Properties })
      pi.set(k, palette.length - 1)
    }
    return pi.get(k)
  }
  const blocks = [], put = (x, y, z, name, props) => blocks.push({ pos: [x, y, z], state: st(name, props) })
  const run = (z, name, props, n = 6, y = 0) => { for (let i = 0; i < n; i++) put(i, y, z, name, props) }
  const finish = () => {
    const mx = a => Math.max(...blocks.map(b => b.pos[a])) + 1
    return { size: [mx(0), mx(1), mx(2)], palette, blocks }
  }

  if (kind === "fluid") {
    const water = (x, y, z, level) => put(x, y, z, "water", { level: String(level) })
    const floor = (x0, z0, x1, z1, y = 0, name = "stone") => {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) put(x, y, z, name)
    }
    const rect = (x0, z0, x1, z1) => {
      const out = []
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) out.push([x, z])
      return out
    }
    // authentic flat-ground spread: sources are level 0, every horizontal step
    // adds 1 (the game's dropoff), solids block, dead past level 7
    const spread = (cells, sources, solids, place) => {
      const k = (x, z) => x + "," + z
      const solid = new Set(solids.map(c => k(...c)))
      const region = new Set(cells.map(c => k(...c)))
      const level = new Map(sources.map(c => [k(...c), 0]))
      let frontier = sources.slice()
      while (frontier.length) {
        const next = []
        for (const [x, z] of frontier) {
          const l = level.get(k(x, z))
          if (l >= 7) continue
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nk = k(x + dx, z + dz)
            if (!region.has(nk) || solid.has(nk) || level.has(nk)) continue
            level.set(nk, l + 1)
            next.push([x + dx, z + dz])
          }
        }
        frontier = next
      }
      for (const [ck, l] of level) {
        const [x, z] = ck.split(",").map(Number)
        place(x, z, l)
      }
    }

    // 1: bare air-flanked run (pathological corner sag)
    for (let i = 0; i < 8; i++) water(i, 0, 0, i)

    // 2: the same run in a walled stone channel, with a bridge block over it
    floor(0, 3, 7, 5)
    for (let x = 0; x <= 7; x++) { put(x, 1, 3, "stone"); put(x, 1, 5, "stone") }
    for (let i = 0; i < 8; i++) water(i, 1, 4, i)
    put(4, 2, 4, "stone")

    // 3: flowing past an obstacle
    floor(0, 8, 11, 12)
    const obstacle = [[3, 10], [4, 10]]
    for (const [x, z] of obstacle) put(x, 1, z, "stone")
    spread(rect(0, 8, 11, 12), [[0, 10]], obstacle, (x, z, l) => water(x, 1, z, l))

    // 4: funnelling through a one-block gap in a wall
    floor(0, 15, 11, 19)
    const wall = []
    for (let z = 15; z <= 19; z++) if (z !== 17) { put(3, 1, z, "stone"); wall.push([3, z]) }
    spread(rect(0, 15, 11, 19), [[0, 17]], wall, (x, z, l) => water(x, 1, z, l))

    // 5: full open spread from a central source (diamond)
    floor(0, 22, 14, 36)
    spread(rect(0, 22, 14, 36), [[7, 29]], [], (x, z, l) => water(x, 1, z, l))

    // 6: waterfall: an elevated walled channel pours over the edge (falling
    // level 8 column) and spreads across the floor below
    floor(0, 39, 3, 39, 3)
    for (let x = 0; x <= 3; x++) { put(x, 4, 38, "stone"); put(x, 4, 40, "stone") }
    for (let i = 0; i <= 3; i++) water(i, 4, 39, i)
    water(4, 4, 39, 4)
    water(4, 3, 39, 8)
    water(4, 2, 39, 8)
    floor(2, 37, 11, 41)
    spread(rect(2, 37, 11, 41), [[4, 39]], [], (x, z, l) => water(x, 1, z, l === 0 ? 8 : l))

    // 7: glass-walled channel (overlay/transparent neighbour case)
    floor(0, 44, 7, 46)
    for (let x = 0; x <= 7; x++) { put(x, 1, 44, "glass"); put(x, 1, 46, "glass") }
    for (let i = 0; i < 8; i++) water(i, 1, 45, i)

    // 8: lava for contrast: overworld dropoff is 2, so levels 0, 2, 4, 6
    floor(10, 44, 14, 46)
    for (let x = 10; x <= 14; x++) { put(x, 1, 44, "stone"); put(x, 1, 46, "stone") }
    for (let i = 0; i < 4; i++) put(10 + i, 1, 45, "lava", { level: String(i * 2) })

    // 9: an L-bend corridor: flow turns a corner
    const path = []
    for (let z = 3; z <= 8; z++) path.push([15, z])
    for (let x = 16; x <= 20; x++) path.push([x, 8])
    floor(14, 2, 21, 9)
    const pathSet = new Set(path.map(c => c.join(",")))
    for (let x = 14; x <= 21; x++) for (let z = 2; z <= 9; z++) {
      if (!pathSet.has(x + "," + z)) put(x, 1, z, "stone")
    }
    spread(path, [[15, 3]], [], (x, z, l) => water(x, 1, z, l))

    // 10: a 3x3 source pool overflowing through an open east side
    floor(24, 2, 34, 8)
    for (let z = 2; z <= 8; z++) put(24, 1, z, "stone")
    for (let x = 24; x <= 28; x++) { put(x, 1, 2, "stone"); put(x, 1, 8, "stone") }
    put(28, 1, 3, "stone"); put(28, 1, 7, "stone")
    spread(rect(25, 3, 34, 7), rect(25, 3, 27, 7), [[28, 3], [28, 7]], (x, z, l) => water(x, 1, z, l))

    return finish()
  }
  // different models, same texture, coplanar 16x16 tops: should all merge
  put(0, 0, 0, "cobblestone"); put(1, 0, 0, "cobblestone_slab", { type: "double" })
  put(2, 0, 0, "cobblestone"); put(3, 0, 0, "cobblestone_slab", { type: "double" }); put(4, 0, 0, "cobblestone")
  run(2, "oak_slab", { type: "bottom" })                          // bottom slab floor: one top quad
  run(4, "oak_slab", { type: "top" })                             // top slab floor
  run(6, "oak_stairs", { half: "bottom", facing: "east", shape: "straight" }) // stair run
  // rotated logs (x,y,z) then a matching-axis pair that should merge
  put(0, 0, 8, "oak_log", { axis: "x" }); put(1, 0, 8, "oak_log", { axis: "y" }); put(2, 0, 8, "oak_log", { axis: "z" })
  put(4, 0, 8, "oak_log", { axis: "x" }); put(5, 0, 8, "oak_log", { axis: "x" })
  for (let i = 0; i < 3; i++) put(i * 2, 0, 10, "grass_block")    // grass, gapped so overlay sides show
  for (let i = 0; i < 6; i++) put(i, 0, 12, i % 2 ? "cobblestone" : "oak_planks") // two-texture checker
  for (let i = 0; i < 3; i++) put(i * 2, 0, 14, "glass")          // glass, gapped (self-cull is future)
  run(16, "cobblestone_wall", {}, 4)                              // walls (partial faces)
  put(0, 0, 18, "oak_planks"); put(0, 1, 18, "oak_planks"); put(1, 0, 18, "oak_slab", { type: "bottom" }) // cull: slab against a cube
  run(20, "dirt_path")                                            // 15/16-tall top (never culls): tops merge, sides partial
  put(0, 0, 22, "grass_block"); put(1, 0, 22, "dirt_path"); put(2, 0, 22, "grass_block") // path between full cubes: shared sides cull
  // fluids: source (level 0) then flowing levels 1-7, each lower than the
  // last, so the surface slopes down the run
  for (let i = 0; i < 8; i++) put(i, 0, 24, "water", { level: String(i) })
  for (let i = 0; i < 8; i++) put(i, 0, 26, "lava", { level: String(i) })
  // stacked columns: same fluid above renders the lower block full 16 tall;
  // level 8 is falling (also full-ish). plus a waterlogged slab
  put(9, 0, 24, "water", { level: "0" }); put(9, 1, 24, "water", { level: "0" })
  put(11, 0, 24, "water", { level: "8" })
  put(9, 0, 26, "lava", { level: "0" }); put(9, 1, 26, "lava", { level: "0" })
  put(0, 0, 30, "oak_slab", { type: "bottom", waterlogged: "true" })
  // stained glass wall (2 tall), mixed colours: same colour culls the shared
  // face (vertical pairs), different colours don't (horizontal neighbours)
  const glassCols = ["red", "orange", "yellow", "lime", "light_blue", "blue", "purple", "magenta"]
  for (let i = 0; i < glassCols.length; i++) {
    put(i, 0, 28, glassCols[i] + "_stained_glass")
    put(i, 1, 28, glassCols[i] + "_stained_glass")
  }
  return finish()
}
