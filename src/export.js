import * as THREE from "three"
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js"
import { OBJExporter } from "three/addons/exporters/OBJExporter.js"

// Export the current scene to .glb or .obj. Live shader materials and
// OffscreenCanvas-backed atlas textures aren't portable, so every exported
// mesh is cloned with a MeshStandardMaterial + real-canvas texture and baked
// to world space. Raw mode re-expands the current structure to one template
// clone per block (collected structures always export optimised).

const matMap = m => m.uniforms?.map?.value ?? m.map

function portableTexture(tex, cache) {
  let out = cache.get(tex)
  if (out) return out
  const img = tex.image
  const c = document.createElement("canvas")
  c.width = img.width
  c.height = img.height
  c.getContext("2d").drawImage(img, 0, 0)
  out = new THREE.CanvasTexture(c)
  out.colorSpace = tex.colorSpace
  out.flipY = tex.flipY
  out.wrapS = tex.wrapS
  out.wrapT = tex.wrapT
  out.magFilter = out.minFilter = THREE.NearestFilter
  out.generateMipmaps = false
  cache.set(tex, out)
  return out
}

function portableMaterial(mat, caches) {
  let out = caches.mat.get(mat)
  if (out) return out
  const tex = matMap(mat)
  out = new THREE.MeshStandardMaterial({
    map: tex ? portableTexture(tex, caches.tex) : null,
    transparent: mat.transparent === true,
    alphaTest: mat.transparent ? 0 : 0.5, // cutout leaves/glass panes
    roughness: 1,
    metalness: 0,
    side: mat.side
  })
  caches.mat.set(mat, out)
  return out
}

// add one source mesh to the export scene at an explicit world matrix.
// invisible material groups have no exporter representation, so a mesh that
// carries any is exploded into one mesh per visible group
function bakeMesh(scene, o, matrix, caches) {
  const mats = [].concat(o.material)
  const groups = o.geometry.groups
  if (groups.length && mats.some(m => m?.visible === false)) {
    const src = o.geometry.index
    for (const g of groups) {
      const m = mats[g.materialIndex]
      if (!m || m.visible === false) continue
      const geo = new THREE.BufferGeometry()
      for (const [name, attr] of Object.entries(o.geometry.attributes)) geo.setAttribute(name, attr)
      geo.setIndex(new THREE.BufferAttribute(src.array.slice(g.start, g.start + g.count), 1))
      const mesh = new THREE.Mesh(geo, portableMaterial(m, caches))
      mesh.applyMatrix4(matrix)
      scene.add(mesh)
    }
    return
  }
  const conv = mats.map(m => portableMaterial(m, caches))
  const mesh = new THREE.Mesh(o.geometry, Array.isArray(o.material) ? conv : conv[0])
  mesh.applyMatrix4(matrix)
  scene.add(mesh)
}

// bake a live group: world transforms applied, hidden subtrees (the
// non-showing door half) skipped
function bakeGroup(scene, group, caches) {
  group.updateMatrixWorld(true)
  group.traverseVisible(o => {
    if (o.isMesh) bakeMesh(scene, o, o.matrixWorld, caches)
  })
}

const _blockT = new THREE.Matrix4(), _full = new THREE.Matrix4()

export async function exportScene({ format, raw, name, root, placed, structure, templates }) {
  const scene = new THREE.Scene()
  const caches = { mat: new Map(), tex: new Map() }

  if (raw && structure && templates) {
    // un-merged: every face, separate textures, no culling. door blocks pick
    // up the template of their current open state via b.state
    const p = root.position
    for (const b of structure.blocks) {
      const tmpl = templates.get(b.state)
      if (!tmpl) continue
      tmpl.updateMatrixWorld(true)
      _blockT.makeTranslation(p.x + b.pos[0] * 16, p.y + b.pos[1] * 16, p.z + b.pos[2] * 16)
      tmpl.traverseVisible(o => {
        if (o.isMesh) bakeMesh(scene, o, _full.multiplyMatrices(_blockT, o.matrixWorld), caches)
      })
    }
  } else if (root) bakeGroup(scene, root, caches)
  for (const pl of placed) bakeGroup(scene, pl.group, caches)
  if (!scene.children.length) return

  const base = (name?.split("/").pop() || "structure") + (raw ? "-raw" : "")
  let blob
  if (format === "glb") {
    const buf = await new GLTFExporter().parseAsync(scene, { binary: true })
    blob = new Blob([buf], { type: "model/gltf-binary" })
  } else {
    blob = new Blob([new OBJExporter().parse(scene)], { type: "text/plain" })
  }

  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `${base}.${format}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
