import * as THREE from "three"

// The library is loaded at runtime from jsDelivr, tracking the latest npm
// release. The app owns the three instance and hands it over, so there is
// only ever one copy of three.
const LIB_URL = "https://cdn.jsdelivr.net/npm/block-model-renderer/src/web.js"

let promise = null

export function loadLibrary() {
  promise ??= import(/* @vite-ignore */ LIB_URL).then(lib => {
    lib.configure({ three: THREE })
    return lib
  })
  return promise
}

export { THREE }
