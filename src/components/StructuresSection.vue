<script setup>
import { computed, nextTick, provide, ref, watch } from "vue"
import { useStructures } from "../composables/useStructures.js"
import { useStructure } from "../composables/useStructure.js"
import { useWorld } from "../composables/useWorld.js"
import { useContextMenu } from "../composables/useContextMenu.js"
import { useLock } from "../composables/useLock.js"
import { apiEnabled, apiView, fetchVersions } from "../api.js"
import TreeFolder from "./TreeFolder.vue"
import ListTabs from "./ListTabs.vue"

const structures = useStructures()
const { state, stateMut, computeWorldgen, filteredNames, structMeta } = structures
const { loadVanilla, loadMany, loadFile, reloadVersion } = useStructure()
const ctx = useContextMenu()
const { locked } = useLock()
const fileInput = ref(null)
const treeEl = ref(null)
const collapsed = ref(false)

provide("treeApi", {
  selected: () => state.selected,
  open: (rel, ev) => loadVanilla(rel, ev),
  loadAll: rels => loadMany(rels),
  fileMenu: null,
  fileClass,
  fileTitle
})

const stopReveal = watch(() => state.selected.length, async n => {
  if (!n) return
  stopReveal()
  await nextTick()
  treeEl.value?.querySelector(".tree-file.sel")?.scrollIntoView({ block: "center" })
})

const names = computed(() => {
  void state.worldgenReady
  return state.filterMode === "all" ? state.names : filteredNames()
})

const soleNs = computed(() => new Set(names.value.map(n => n.slice(0, n.indexOf("/")))).size <= 1)
const disp = rel => soleNs.value ? rel.slice(rel.indexOf("/") + 1) : rel

// gold = has a Structorium patch; purple = provided by more than one pack
function fileClass(rel) {
  const m = structMeta(rel)
  return {
    sel: state.selected.includes(rel),
    patched: !!m?.patched,
    variants: (m?.providers?.length ?? 0) > 1
  }
}
function fileTitle(rel) {
  const m = structMeta(rel)
  const tags = []
  if (m?.patched) tags.push("patched")
  if ((m?.providers?.length ?? 0) > 1) tags.push(`${m.providers.length} packs`)
  return tags.length ? `${rel} — ${tags.join(", ")}` : rel
}

const FLAT_CAP = 500
const flat = computed(() => {
  const q = state.filterText.trim().toLowerCase()
  if (!q) return null
  return names.value.filter(n => n.toLowerCase().includes(q))
})

const tree = computed(() => {
  const root = { dirs: new Map(), files: [] }
  for (const rel of names.value) {
    const parts = disp(rel).split("/")
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: [] })
      node = node.dirs.get(parts[i])
    }
    node.files.push(rel)
  }
  return root
})

const autoOpenName = computed(() => soleNs.value ? "" : "minecraft")

const rootExpand = ref(0), rootCollapse = ref(0)
// zero the tokens while searching: the tree's token watcher runs on mount, so
// a remounted tree would replay a stale "expand all"
watch(() => !!flat.value, isFlat => {
  if (isFlat) {
    rootExpand.value = 0
    rootCollapse.value = 0
  }
})
function onRootMenu(e) {
  const rels = flat.value ?? names.value
  const items = [
    { label: `Load all (${rels.length})`, icon: "stacks", disabled: locked.value || !rels.length, action: () => loadMany(rels) }
  ]
  if (!flat.value) items.push(
    { label: "Expand all", icon: "unfold_more", action: () => rootExpand.value++ },
    { label: "Collapse all", icon: "unfold_less", action: () => rootCollapse.value++ }
  )
  ctx.open(e, items)
}

async function onMode(e) {
  stateMut.filterMode = e.target.value
  if (e.target.value !== "all") await computeWorldgen()
}

// API mode: the version dropdown lists every version the mod offers for the
// selected structure (resolved/original + one per providing pack), fetched when
// the selection changes.
const apiVersions = ref([])
const currentRel = computed(() => state.selected.length === 1 ? state.selected[0] : null)
const currentVersionValue = computed(() =>
  apiView.version === "pack" ? `pack:${apiView.pack}` : apiView.version)

const versionValue = v => v.kind === "pack" ? `pack:${v.packId}` : v.kind

watch(currentRel, async rel => {
  if (!apiEnabled() || !rel) {
    apiVersions.value = []
    return
  }
  const slash = rel.indexOf("/")
  try {
    apiVersions.value = await fetchVersions(rel.slice(0, slash), rel.slice(slash + 1))
  } catch {
    apiVersions.value = []
  }
}, { immediate: true })

function onVersion(e) {
  const val = e.target.value
  if (val.startsWith("pack:")) {
    apiView.version = "pack"
    apiView.pack = val.slice("pack:".length)
  } else {
    apiView.version = val
    apiView.pack = null
  }
  reloadVersion()
}

function onFile(e) {
  const file = e.target.files[0]
  e.target.value = ""
  if (!file) return
  if (/\.(zip|mca)$/i.test(file.name)) useWorld().openWorld(file)
  else loadFile(file)
}
</script>

<template>
  <section class="structures" :class="{ collapsed }">
    <h2 @click="collapsed = !collapsed">
      <span class="material-symbols-outlined chev">{{ collapsed ? "chevron_right" : "expand_more" }}</span>
      Structures
      <span class="count">{{ names.length === state.names.length ? state.names.length : `${names.length}/${state.names.length}` }}</span>
    </h2>
    <div class="controls">
      <input v-model="stateMut.filterText" placeholder="Filter…">
      <select v-if="!apiEnabled()" :value="state.filterMode" @change="onMode" :disabled="locked" title="all: every structure. standalone: neither pulled into another build nor loads any other structure blocks. starters: anything that starts a build (never placed as a piece of another).">
        <option value="all">All</option>
        <option value="standalone">Standalone</option>
        <option value="starters">Starters</option>
      </select>
      <select v-else-if="apiVersions.length" :value="currentVersionValue" @change="onVersion" :disabled="locked" title="Which version of this structure to view: the resolved (patched) form, the pristine original, or a specific providing pack.">
        <option v-for="v in apiVersions" :key="versionValue(v)" :value="versionValue(v)">{{ v.label }}</option>
      </select>
    </div>
    <div v-if="apiEnabled()" class="legend">
      <span class="patched">patched</span>
      <span class="variants">multiple packs</span>
    </div>
    <ListTabs />
    <div class="tree" :class="{ disabled: locked }" ref="treeEl">
      <div v-if="state.indexing" class="empty">Indexing…</div>
      <template v-else>
        <div class="tree-root" title="Right-click for options" @contextmenu.prevent="onRootMenu($event)">All Structures</div>
        <template v-if="flat">
          <div v-if="!flat.length" class="empty">No match</div>
          <div v-for="rel in flat.slice(0, FLAT_CAP)" :key="rel" class="tree-file"
            :class="fileClass(rel)" :title="fileTitle(rel)"
            @click="loadVanilla(rel, $event)">{{ disp(rel) }}</div>
          <div v-if="flat.length > FLAT_CAP" class="empty">…and {{ flat.length - FLAT_CAP }} more</div>
        </template>
        <div v-else class="root-children">
          <TreeFolder :node="tree" :auto-open-name="autoOpenName"
            :expand-token="rootExpand" :collapse-token="rootCollapse" />
        </div>
      </template>
    </div>
    <button :disabled="locked" @click="fileInput.click()">
      <span class="material-symbols-outlined">upload_file</span>
      Open Structure File
    </button>
    <input ref="fileInput" type="file" accept=".nbt,.litematic,.schem,.mcstructure,.zip,.mca" hidden @change="onFile">
  </section>
</template>

<style scoped>
.structures {
  flex: 1;
  min-height: 270px;
}

.structures.collapsed {
  flex: none;
  min-height: 0;
}

.count {
  margin-left: auto;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
}

.controls {
  display: flex;
  gap: 6px;
}

.controls input {
  flex: 2;
  min-width: 0;
}

.controls select {
  flex: 1;
  min-width: 0;
}

.legend {
  display: flex;
  gap: 12px;
  margin: 4px 0 2px;
  font-size: 11px;
}

.legend .patched { color: #e0b341; }
.legend .variants { color: #c39bff; }

.tree {
  flex: 1;
  min-height: 120px;
  overflow: auto;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  user-select: none;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0 0 6px 6px;
  padding: 6px 8px;
}

.tree .empty { color: var(--text-dim); }

.tree.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.tree-root {
  color: var(--text);
  font-weight: 600;
  padding: 1px 0;
  cursor: context-menu;
  user-select: none;
}

.tree-root:hover { color: #fff; }

.root-children { margin-left: 14px; }

.tree-file {
  cursor: pointer;
  color: #8fb3cc;
  padding: 1px 4px;
  border-radius: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-file.variants { color: #c39bff; }
.tree-file.patched { color: #e0b341; }
.tree-file:hover { color: #fff; background: #ffffff12; }
.tree-file.sel { color: #6fd487; background: #6fd4871f; }

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

button .material-symbols-outlined { font-size: 18px; }
</style>
