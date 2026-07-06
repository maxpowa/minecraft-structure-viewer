<script setup>
import { onMounted, ref } from "vue"
import { loadLibrary } from "./lib.js"

const libState = ref("loading")
const libError = ref("")

onMounted(async () => {
  try {
    await loadLibrary()
    libState.value = "ready"
  } catch (err) {
    libState.value = "error"
    libError.value = String(err)
  }
})
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <header class="app-head">
        <span class="material-symbols-outlined">deployed_code</span>
        <h1>Structure Viewer</h1>
      </header>
      <div class="lib-status" :class="libState">
        <template v-if="libState === 'loading'">Loading renderer…</template>
        <template v-else-if="libState === 'ready'">Renderer ready</template>
        <template v-else>Renderer failed: {{ libError }}</template>
      </div>
    </aside>
    <main class="viewport">
      <canvas id="view"></canvas>
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
}

.sidebar {
  width: 300px;
  flex-shrink: 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.app-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.app-head h1 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.lib-status {
  padding: 10px 14px;
  color: var(--text-dim);
  font-size: 13px;
}

.lib-status.ready { color: var(--green); }
.lib-status.error { color: var(--red); }

.viewport {
  flex: 1;
  min-width: 0;
  position: relative;
}

#view {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
