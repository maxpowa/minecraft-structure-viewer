import { DIR, EMPTY, OPP, boxHit, inBox, jigsawsOf, pieceBox, poolTemplates, rnd, rotDir, rotPos, shuffle, worldJigsaw } from "./transforms.js"
import { combine } from "./combine.js"

// Grow a structure through its jigsaw graph like worldgen. BFS one connection
// level at a time; level d rolls its own rng seeded levelSeed(d + 1), so
// re-running with a deeper maxDepth reproduces every earlier level exactly
// (this is what makes the stepped level menu stable and shareable-by-seed).

const nsName = s => s.includes(":") ? s : "minecraft:" + s

export async function runJigsaw(start, { loadStruct, loadPool, maxDepth = 6, maxPieces = 48, maxRadius = 96, levelSeed, onProgress }) {
  // misses cached too, so they aren't retried
  const structs = new Map(), pools = new Map()
  const getStruct = async ref => {
    if (!structs.has(ref)) structs.set(ref, await Promise.resolve(loadStruct(ref)).catch(() => null))
    return structs.get(ref)
  }
  const getPool = async ref => {
    if (!pools.has(ref)) pools.set(ref, await Promise.resolve(loadPool(ref)).catch(() => null))
    return pools.get(ref)
  }

  const startPiece = { struct: start, rot: 0, off: [0, 0, 0], depth: 0, box: pieceBox(start, 0, [0, 0, 0]), onPlot: [] }
  const pieces = [startPiece]
  const boxes = [startPiece.box]
  let frontier = [startPiece]

  for (let d = 0; d < maxDepth && frontier.length && pieces.length < maxPieces; d++) {
    const rand = rnd(levelSeed(d + 1))
    const next = []
    for (const src of frontier) {
      if (pieces.length >= maxPieces) break
      for (const j of jigsawsOf(src.struct)) {
        if (pieces.length >= maxPieces) break
        const wj = worldJigsaw(j, src)
        if (!wj.pool) continue
        const pool = await getPool(wj.pool)
        if (!pool) continue
        const dir = DIR[wj.front]
        // where the child's matching jigsaw must land
        const targetPos = [wj.pos[0] + dir[0], wj.pos[1] + dir[1], wj.pos[2] + dir[2]]
        // a child landing inside the source footprint (a house on a street
        // plot, a tower on a base plate) collision-checks against the
        // source's own plot, not the global list: THE fix for villages piling
        // houses on each other and outposts spawning 15 tents
        const attachInside = inBox(targetPos, src.box)
        let candidates = shuffle(poolTemplates(pool), rand)
        if (typeof pool.fallback === "string") {
          const fb = await getPool(pool.fallback)
          if (fb) candidates = candidates.concat(shuffle(poolTemplates(fb), rand))
        }
        const tried = new Set()
        jig: for (const loc of candidates) {
          if (loc === EMPTY) break // weighted "nothing" spot: place nothing here
          if (tried.has(loc)) continue
          tried.add(loc)
          const child = await getStruct(loc)
          if (!child) continue
          const childJigs = jigsawsOf(child)
          for (const k of shuffle([0, 1, 2, 3], rand)) {
            for (const cj of childJigs) {
              if (wj.front !== OPP[rotDir(cj.front, k)]) continue
              if (wj.joint !== "rollable" && wj.top !== rotDir(cj.top, k)) continue
              if (nsName(wj.target) !== nsName(cj.name)) continue
              const cp = rotPos(cj.pos, k)
              const off = [targetPos[0] - cp[0], targetPos[1] - cp[1], targetPos[2] - cp[2]]
              const box = pieceBox(child, k, off)
              if (Math.hypot((box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2) > maxRadius) continue
              if (attachInside) {
                if (box.x0 < src.box.x0 || box.x1 > src.box.x1 || box.z0 < src.box.z0 || box.z1 > src.box.z1) continue
                if (src.onPlot.some(b => boxHit(box, b))) continue
              } else if (boxes.some(b => boxHit(box, b))) continue
              const piece = { struct: child, rot: k, off, depth: d + 1, box, onPlot: [] }
              pieces.push(piece)
              if (attachInside) src.onPlot.push(box)
              else boxes.push(box)
              next.push(piece)
              onProgress?.(pieces.length)
              break jig
            }
          }
        }
      }
    }
    if (!next.length) break
    frontier = next
  }
  return { structure: combine(pieces), pieces: pieces.length }
}
