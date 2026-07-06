import * as THREE from "three"

// The library is loaded at runtime from Ewan's dev server (stands in for the
// real CDN URL later). The app owns the three instance and hands it over, so
// there is only ever one copy of three.
const LIB_URL = import.meta.env.VITE_LIB_URL ?? "http://localhost:8080/src/web.js"

let promise = null

export function loadLibrary() {
  promise ??= import(/* @vite-ignore */ LIB_URL).then(lib => {
    lib.configure({ three: THREE })
    return lib
  })
  return promise
}

export { THREE }
