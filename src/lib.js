import * as THREE from "three"

// The library is loaded at runtime from jsDelivr, pinned to the released
// npm version: version urls are immutable so the CDN can never serve stale
// files. VITE_LIB_URL overrides (e.g. a localhost dev server). The app owns
// the three instance and hands it over, so there is only ever one copy of
// three.
const LIB_URL = import.meta.env.VITE_LIB_URL ?? "https://cdn.jsdelivr.net/npm/block-model-renderer@2.1.0/src/web.js"

let promise = null

export function loadLibrary() {
  promise ??= import(/* @vite-ignore */ LIB_URL).then(lib => {
    lib.configure({ three: THREE })
    return lib
  })
  return promise
}

export { THREE }
