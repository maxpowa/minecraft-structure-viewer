<script setup>
import { computed, provide, ref, watch } from "vue"
import { useFeatures } from "../composables/useFeatures.js"
import { useStructure } from "../composables/useStructure.js"
import { useContextMenu } from "../composables/useContextMenu.js"
import { useLock } from "../composables/useLock.js"
import { numeric } from "../transforms.js"
import TreeFolder from "./TreeFolder.vue"
import ListTabs from "./ListTabs.vue"

const features = useFeatures()
const { state, stateMut } = features
const { clickFeature, loadFeatures, loadFeatureField } = useStructure()
const ctx = useContextMenu()
const { locked } = useLock()
const collapsed = ref(false)

const soleNs = computed(() => new Set(state.names.map(n => n.slice(0, n.indexOf("/")))).size <= 1)
const disp = rel => soleNs.value ? rel.slice(rel.indexOf("/") + 1) : rel

const shown = computed(() => (state.filterText, state.names.length, features.visibleNames()))

const flat = computed(() => state.filterText.trim() ? shown.value : null)

// curated folders decide the tree shape; the rel stays the id everywhere
const tree = computed(() => {
  const entries = state.names.map(rel => {
    const folder = features.folderOf(rel)
    return { rel, path: folder ? folder + "/" + disp(rel) : disp(rel) }
  }).sort((a, b) => numeric(a.path, b.path))
  const root = { dirs: new Map(), files: [] }
  for (const { rel, path } of entries) {
    const parts = path.split("/")
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: [] })
      node = node.dirs.get(parts[i])
    }
    node.files.push(rel)
  }
  return root
})

function onRowMenu(rel, e) {
  ctx.open(e, [
    { label: "Generate field", icon: "grid_view", disabled: locked.value || features.isStatic(rel), action: () => loadFeatureField(rel) }
  ])
}

provide("treeApi", {
  selected: () => state.selected,
  open: (rel, ev) => clickFeature(rel, ev),
  loadAll: rels => loadFeatures(rels),
  fileMenu: onRowMenu
})

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
  const rels = flat.value ?? shown.value
  const items = [
    { label: `Load all (${rels.length})`, icon: "stacks", disabled: locked.value || !rels.length, action: () => loadFeatures(rels) }
  ]
  if (!flat.value) items.push(
    { label: "Expand all", icon: "unfold_more", action: () => rootExpand.value++ },
    { label: "Collapse all", icon: "unfold_less", action: () => rootCollapse.value++ }
  )
  ctx.open(e, items)
}
</script>

<template>
  <section class="features" :class="{ collapsed }">
    <h2 @click="collapsed = !collapsed">
      <span class="material-symbols-outlined chev">{{ collapsed ? "chevron_right" : "expand_more" }}</span>
      Features
      <span class="count">{{ shown.length === state.names.length ? state.names.length : `${shown.length}/${state.names.length}` }}</span>
    </h2>
    <div class="controls">
      <input v-model="stateMut.filterText" placeholder="Filter…">
    </div>
    <ListTabs />
    <div class="tree" :class="{ disabled: locked }">
      <div v-if="state.indexing" class="empty">Indexing…</div>
      <template v-else>
        <div class="tree-root" title="Right-click for options" @contextmenu.prevent="onRootMenu($event)">All Features</div>
        <div v-if="!shown.length" class="empty">{{ state.names.length ? "No match" : "No features" }}</div>
        <div v-else-if="flat" class="root-children">
          <div v-for="rel in flat" :key="rel" class="tree-file"
            :class="{ sel: state.selected.includes(rel) }"
            @click="clickFeature(rel, $event)"
            @contextmenu.prevent="onRowMenu(rel, $event)">{{ disp(rel) }}</div>
        </div>
        <div v-else class="root-children">
          <TreeFolder :node="tree" :expand-token="rootExpand" :collapse-token="rootCollapse" />
        </div>
      </template>
    </div>
    <p class="hint">Generated from the game's worldgen data; loads show a representative roll, Re-roll picks a fresh seed</p>
  </section>
</template>

<style scoped>
.features {
  flex: 1;
  min-height: 270px;
}

.features.collapsed {
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
  flex: 1;
  min-width: 0;
}

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

.tree-root {
  color: var(--text);
  font-weight: 600;
  padding: 1px 0;
  cursor: context-menu;
  user-select: none;
}

.tree-root:hover { color: #fff; }

.root-children { margin-left: 14px; }

.tree.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.tree-file {
  cursor: pointer;
  color: #8fb3cc;
  padding: 1px 4px;
  border-radius: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-file:hover { color: #fff; background: #ffffff12; }
.tree-file.sel { color: #6fd487; background: #6fd4871f; }

.hint {
  margin: 0;
  color: var(--text-dim);
  font-size: 11px;
}
</style>
