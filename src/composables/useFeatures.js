import { reactive, readonly, watch } from "vue"
import { loadLibrary } from "../lib.js"
import { usePacks } from "./usePacks.js"
import { numeric } from "../transforms.js"

// Discovery: every data/<ns>/worldgen/feature/*.json across the union of all
// pack sources: the bundled features.zip carries vanilla's registry (dumped
// by tools/features, vanilla builds them in code), and datapacks override or
// extend by name through normal source priority.
const FEATURE_RE = /^data\/([^/]+)\/worldgen\/feature\/(.+)\.json$/

const packs = usePacks()
const textDecoder = new TextDecoder()

const state = reactive({
  names: [],
  filterText: "",
  selected: [],
  indexing: false
})

let featurePath = new Map()
let defaultSeeds = {}
let staticSet = new Set()

async function populate() {
  const lib = await loadLibrary()
  featurePath = new Map()
  for (const src of Array.from(packs.allSources()).reverse()) {
    for (const k of lib.parseZip(src).keys()) {
      const m = k.match(FEATURE_RE)
      if (m) featurePath.set(m[1] + "/" + m[2], k)
    }
  }
  // precomputed by tools/features: the just-a-block hide list (for a future
  // filter; everything lists for now), the median-size default seed per
  // feature (seed 0 often rolls a tiny output), and the ref-only selectors
  // (delisted: they only pick between features the list already shows, but
  // stay loadable so references resolve)
  const dbuf = await lib.readFile("viewer/default_seeds.json", packs.assets.value)
  defaultSeeds = dbuf ? JSON.parse(textDecoder.decode(dbuf)) : {}
  // features whose 256-seed sample never changed shape: no Re-roll, no Field
  const stbuf = await lib.readFile("viewer/static_features.json", packs.assets.value)
  staticSet = new Set(stbuf ? JSON.parse(textDecoder.decode(stbuf)) : [])
  // delisting is by name, not by zip membership: snapshot jars ship the
  // worldgen/feature JSONs as data, so the vanilla jar re-adds anything
  // that was only deleted from features.zip
  const delisted = new Set()
  for (const f of ["viewer/redundant_selectors.json", "viewer/structure_dupes.json"]) {
    const buf = await lib.readFile(f, packs.assets.value)
    if (buf) for (const rel of JSON.parse(textDecoder.decode(buf))) delisted.add(rel)
  }
  state.names = Array.from(featurePath.keys()).filter(rel => !delisted.has(rel)).sort(numeric)
  if (state.selected.length) state.selected = state.selected.filter(rel => featurePath.has(rel))
}

async function refresh() {
  state.indexing = true
  try {
    await populate()
  } finally {
    state.indexing = false
  }
}

watch(() => packs.state.assetsVersion, refresh)

async function readJson(zipPath) {
  const lib = await loadLibrary()
  const buf = await lib.readFile(zipPath, packs.assets.value)
  return buf ? JSON.parse(textDecoder.decode(buf)) : null
}

// a feature name: "ns/path" into the feature registry
async function readFeature(rel) {
  const zp = featurePath.get(rel)
  if (zp) return readJson(zp)
  const slash = rel.indexOf("/")
  return readJson(`data/${rel.slice(0, slash)}/worldgen/feature/${rel.slice(slash + 1)}.json`)
}

const nsPath = ref => ref.includes(":") ? ref.replace(":", "/") : "minecraft/" + ref

// Selector entries hold either an inline placed feature ({feature, placement}),
// a placed-feature id, or a bare feature id. Placement modifiers don't apply
// to a single showcase placement, so only the feature inside matters. A
// placed feature's inner reference points at the FEATURE registry: ids often
// collide across the two registries (birch_bees_0002 is both), so following
// it back through the placed lookup would loop forever.
async function resolvePlaced(ref) {
  if (ref == null) return null
  if (typeof ref === "object") {
    if (ref.feature !== undefined) return resolveFeatureRef(ref.feature)
    return ref
  }
  const rel = nsPath(ref)
  const placed = await readJson(`data/${rel.replace("/", "/worldgen/placed_feature/")}.json`)
  if (placed?.feature !== undefined) return resolveFeatureRef(placed.feature)
  return readFeature(rel)
}

async function resolveFeatureRef(ref) {
  if (ref == null) return null
  if (typeof ref === "object") return ref.feature !== undefined ? resolveFeatureRef(ref.feature) : ref
  return readFeature(nsPath(ref))
}

function visibleNames() {
  const q = state.filterText.trim().toLowerCase()
  return q ? state.names.filter(n => n.toLowerCase().includes(q)) : state.names
}

const defaultSeed = rel => defaultSeeds[rel] ?? 0
const isStatic = rel => staticSet.has(rel)
const has = rel => featurePath.has(rel)

export function useFeatures() {
  return { state: readonly(state), stateMut: state, refresh, readFeature, resolvePlaced, visibleNames, defaultSeed, isStatic, has }
}
