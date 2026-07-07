import * as THREE from "three"

// The library is loaded at runtime from jsDelivr, tracking the latest v2
// branch (override with VITE_LIB_URL, e.g. a localhost dev server). The app
// owns the three instance and hands it over, so there is only ever one copy
// of three.
const LIB_URL = import.meta.env.VITE_LIB_URL ?? "https://cdn.jsdelivr.net/gh/ewanhowell5195/block-model-renderer@v2/src/web.js"

let promise = null

export function loadLibrary() {
  promise ??= import(/* @vite-ignore */ LIB_URL).then(lib => {
    lib.configure({ three: THREE })
    return lib
  })
  return promise
}

export { THREE }
