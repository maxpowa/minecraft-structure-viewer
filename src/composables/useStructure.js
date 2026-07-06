import { reactive, readonly, shallowRef } from "vue"
import { loadLibrary } from "../lib.js"
import { usePacks } from "./usePacks.js"
import { useStructures } from "./useStructures.js"
import { readStructure } from "../nbt.js"

// The currently loaded structure. Rendering/build comes later; this owns
// loading + selection + the ?vanilla= url param.
const packs = usePacks()
const structures = useStructures()

const structure = shallowRef(null)
const state = reactive({ name: "", loading: false, error: "" })

const setVanillaParam = rel => {
  const u = new URL(location)
  rel ? u.searchParams.set("vanilla", rel) : u.searchParams.delete("vanilla")
  history.replaceState(null, "", u)
}

async function loadVanilla(rel) {
  const zp = structures.zipPathOf(rel)
  if (!zp || state.loading) return
  state.loading = true
  state.error = ""
  try {
    const lib = await loadLibrary()
    const bytes = await lib.readFile(zp, packs.assets.value)
    structure.value = await readStructure(bytes)
    state.name = rel
    structures.stateMut.selected = rel
    setVanillaParam(rel)
  } catch (err) {
    state.error = `couldn't load structure: ${err}`
  } finally {
    state.loading = false
  }
}

async function loadFile(file) {
  if (!file || state.loading) return
  state.loading = true
  state.error = ""
  try {
    structure.value = await readStructure(await file.arrayBuffer())
    state.name = file.name.replace(/\.nbt$/, "")
    structures.stateMut.selected = null
    setVanillaParam(null)
  } catch (err) {
    state.error = `couldn't read ${file.name}: ${err}`
  } finally {
    state.loading = false
  }
}

export function useStructure() {
  return { state: readonly(state), structure, loadVanilla, loadFile }
}
