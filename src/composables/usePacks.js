import { reactive, shallowRef, readonly } from "vue"
import { loadLibrary } from "../lib.js"
import { loadMojangJar } from "../mojang.js"
import { useLock } from "./useLock.js"
import { apiEnabled, fetchAssetsMeta, fetchAssetsZip } from "../api.js"

// index 0 = highest priority (prepareAssets first-wins order); pack bytes
// stay outside the reactive state so large buffers aren't proxied
const bytesById = new Map()
let baseBytes = null
let builtinBytes = null
let featureBytes = null
// Assets served by a Structorium mod (API mode): layered above the vanilla base.
// When the bundle is "complete" (single-player), it IS the base and Mojang is skipped.
let apiAssetsBytes = null
let nextId = 1

// the game's hardcoded structures (tools/builtin) and code-built features
// (tools/features); lowest priority, they only add entries vanilla doesn't ship
async function loadBuiltin() {
  if (!builtinBytes) {
    try {
      const res = await fetch(import.meta.env.BASE_URL + "builtin.zip")
      if (res.ok) builtinBytes = new Uint8Array(await res.arrayBuffer())
    } catch {}
  }
  if (!featureBytes) {
    try {
      const res = await fetch(import.meta.env.BASE_URL + "features.zip")
      if (res.ok) featureBytes = new Uint8Array(await res.arrayBuffer())
    } catch {}
  }
}

const state = reactive({
  channel: new URLSearchParams(location.search).get("channel") === "snapshot" ? "snapshot" : "release",
  version: new URLSearchParams(location.search).get("version") || "",
  baseId: "",
  baseStatus: "loading…",
  baseFailed: false,
  packs: [],
  busy: false,
  assetsVersion: 0
})

const assets = shallowRef(null)
const { lock, locked } = useLock()

let swapHandler = null
const setSwapHandler = fn => { swapHandler = fn }

function setChannelParam(ch) {
  const u = new URL(location)
  ch === "snapshot" ? u.searchParams.set("channel", "snapshot") : u.searchParams.delete("channel")
  u.searchParams.delete("version") // picking a channel unpins
  history.replaceState(null, "", u)
}

// dispose the previous bundle only after `swap` resolves, so the on-screen
// scene keeps its cached textures until the rebuild lands
async function rebuildAssets(swap) {
  const lib = await loadLibrary()
  let sources = [...state.packs.map(p => bytesById.get(p.id)), apiAssetsBytes, baseBytes].filter(Boolean)
  if (sources.length) sources = sources.concat(builtinBytes ?? [], featureBytes ?? [])
  const prev = assets.value
  assets.value = sources.length ? await lib.prepareAssets(sources, { cache: true }) : null
  state.assetsVersion++
  try {
    await (swap ?? swapHandler)?.(assets.value)
  } finally {
    if (prev && prev !== assets.value) lib.disposeCache(prev)
  }
}

async function loadMojangBase() {
  try {
    await loadBuiltin()
    const mb = n => (n / 1048576).toFixed(0)
    const r = await loadMojangJar(state.channel, (got, total, ver) => {
      state.baseStatus = `downloading ${ver}… ${mb(got)}/${mb(total)}MB`
    }, state.version)
    baseBytes = r.bytes
    state.baseId = r.id
    state.baseStatus = ""
  } catch (err) {
    console.warn("couldn't load the vanilla jar:", err)
    baseBytes = null
    state.baseId = ""
    state.baseStatus = /^version not found/.test(err?.message) ? err.message : "vanilla download failed"
    state.baseFailed = true
  }
}

// API mode: pull the render assets from the mod. A "complete" bundle (single-
// player) includes vanilla and becomes the base, so no Mojang download; a
// modded-only bundle layers over the vanilla jar we still fetch from Mojang.
async function loadApiAssets() {
  try {
    state.baseStatus = "loading assets from mod…"
    const meta = await fetchAssetsMeta()
    apiAssetsBytes = await fetchAssetsZip()
    if (meta.complete) {
      baseBytes = null
      state.baseId = "mod"
      state.baseStatus = ""
      return
    }
  } catch (err) {
    console.warn("couldn't load mod assets:", err)
    apiAssetsBytes = null
  }
  // modded-only, or the mod assets failed: fall back to the vanilla jar as base
  await loadMojangBase()
}

// pack ops hold the global lock too: nothing else may start a load while the
// asset bundle is being replaced
async function loadBase(swap) {
  state.busy = true
  lock(true)
  state.baseFailed = false
  if (apiEnabled()) await loadApiAssets()
  else await loadMojangBase()
  try {
    await rebuildAssets(swap)
  } finally {
    state.busy = false
    lock(false)
  }
}

async function setChannel(channel, swap) {
  if (state.busy || locked.value || (channel === state.channel && !state.version)) return
  state.channel = channel
  state.version = ""
  setChannelParam(channel)
  await loadBase(swap)
}

async function addPacks(files, swap) {
  if (state.busy || locked.value || !files.length) return
  state.busy = true
  lock(true)
  try {
    const added = []
    for (const file of files) {
      const id = nextId++
      bytesById.set(id, new Uint8Array(await file.arrayBuffer()))
      added.push({ id, name: file.name })
    }
    state.packs.unshift(...added)
    await rebuildAssets(swap)
  } finally {
    state.busy = false
    lock(false)
  }
}

async function removePack(id, swap) {
  if (state.busy || locked.value) return
  const i = state.packs.findIndex(p => p.id === id)
  if (i < 0) return
  state.busy = true
  lock(true)
  try {
    state.packs.splice(i, 1)
    bytesById.delete(id)
    await rebuildAssets(swap)
  } finally {
    state.busy = false
    lock(false)
  }
}

async function movePack(id, delta, swap) {
  if (state.busy || locked.value) return
  const i = state.packs.findIndex(p => p.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= state.packs.length) return
  state.busy = true
  lock(true)
  try {
    const [p] = state.packs.splice(i, 1)
    state.packs.splice(j, 0, p)
    await rebuildAssets(swap)
  } finally {
    state.busy = false
    lock(false)
  }
}

// Every zip source currently contributing files, highest priority first.
// Structure discovery scans the union of these (a pack's data/ may add
// structures the base doesn't have).
const allSources = () => state.packs.map(p => bytesById.get(p.id)).concat(apiAssetsBytes, baseBytes, builtinBytes, featureBytes).filter(Boolean)

// the vanilla jar is excluded on purpose: minecraft features list only from
// the bundle, so anything the tools removed stays gone on snapshot jars too
const featureSources = () => state.packs.map(p => bytesById.get(p.id)).concat(builtinBytes, featureBytes).filter(Boolean)

export function usePacks() {
  return { state: readonly(state), assets, loadBase, setChannel, addPacks, removePack, movePack, allSources, featureSources, setSwapHandler }
}
