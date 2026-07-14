import { reactive } from "vue"

// Optional data source: a running Structorium mod web server. When enabled, the
// structure index and structure bytes come from the mod's read-only JSON API
// (the live server's structures, including patched + per-pack variants) instead
// of scanning uploaded/vanilla data-pack zips. Block models/textures still come
// from the loaded jar/packs — the API supplies which blocks, not their look.
//
// Enabled when either is present:
//   - ?api=<url>           runtime override (e.g. ?api=http://localhost:25599 for `npm run dev`)
//   - VITE_API_BASE        build-time (empty string = same origin; how the mod-vendored build ships)
// An empty base means same origin, so the mod can serve this bundle and its API together.
const PARAM = new URLSearchParams(location.search).get("api")
const ENV = import.meta.env.VITE_API_BASE
const RAW = PARAM != null ? PARAM : (ENV != null ? ENV : null)

const ENABLED = RAW != null
const API_BASE = (RAW ?? "").trim().replace(/\/+$/, "")

export const apiEnabled = () => ENABLED

// Which version of the current structure to request. version: "resolved"
// (patched) | "original" | "pack"; pack names the source pack when
// version === "pack". This is per-structure, so it resets on switching.
export const apiView = reactive({ version: "resolved", pack: null })

// Default view for a freshly-selected structure: the patched form if it has a
// patch, else the winning pack (the one actually chosen — last provider), else
// (a generated/no-pack template) the resolved default.
export function setDefaultView(meta) {
  const providers = meta?.providers ?? []
  if (meta?.patched) {
    apiView.version = "resolved"
    apiView.pack = null
  } else if (providers.length) {
    apiView.version = "pack"
    apiView.pack = providers[providers.length - 1]
  } else {
    apiView.version = "resolved"
    apiView.pack = null
  }
}

// namespace + path -> URL path, encoding each segment but preserving the slashes
function encodePath(namespace, path) {
  const encSegments = s => s.split("/").map(encodeURIComponent).join("/")
  return `${encodeURIComponent(namespace)}/${encSegments(path)}`
}

// The structure index: [{ id, namespace, path, providers, patched, patchedProvenances }]
export async function fetchIndex() {
  const res = await fetch(`${API_BASE}/api/structures`)
  if (!res.ok) throw new Error(`structure index: HTTP ${res.status}`)
  const json = await res.json()
  return json.structures ?? []
}

// The selectable versions of one structure: [{ kind, packId?, label }]
export async function fetchVersions(namespace, path) {
  const res = await fetch(`${API_BASE}/api/structure/${encodePath(namespace, path)}/versions`)
  if (!res.ok) throw new Error(`versions: HTTP ${res.status}`)
  return (await res.json()).versions ?? []
}

// Raw .nbt bytes (gzip-compressed, exactly like a structure file) for readStructure().
export async function fetchStructureBytes(namespace, path, version = "resolved", pack = null) {
  const query = new URLSearchParams({ version })
  if (version === "pack" && pack) query.set("pack", pack)
  const res = await fetch(`${API_BASE}/api/structure/${encodePath(namespace, path)}?${query}`)
  if (!res.ok) throw new Error(`structure: HTTP ${res.status}`)
  return await res.arrayBuffer()
}

// Asset bundle the mod serves for rendering. `complete` is true when it includes
// vanilla (client / single-player), so the viewer can skip the Mojang jar.
export async function fetchAssetsMeta() {
  const res = await fetch(`${API_BASE}/api/assets`)
  if (!res.ok) throw new Error(`assets meta: HTTP ${res.status}`)
  return await res.json()
}

// A resource-pack-shaped ZIP of assets/ (models, blockstates, textures).
export async function fetchAssetsZip() {
  const res = await fetch(`${API_BASE}/api/assets.zip`)
  if (!res.ok) throw new Error(`assets: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}
