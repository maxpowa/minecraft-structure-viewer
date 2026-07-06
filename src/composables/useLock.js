import { computed, reactive, readonly } from "vue"

// One reference-counted lock covers everything that can start a load, so
// nothing changes mid-build. Nested locks (a build inside a jigsaw solve)
// balance through the refcount. withLock locks synchronously before any await
// so a click in a pre-build async gap can't race.
const state = reactive({ depth: 0 })

const locked = computed(() => state.depth > 0)

function lock(on) {
  state.depth = Math.max(0, state.depth + (on ? 1 : -1))
}

async function withLock(fn) {
  if (locked.value) return
  lock(true)
  try {
    return await fn()
  } finally {
    lock(false)
  }
}

export function useLock() {
  return { locked, lock, withLock }
}
