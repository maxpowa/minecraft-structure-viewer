import { createApp } from "vue"
import App from "./App.vue"
import "./styles.css"

createApp(App).mount("#app")

if (import.meta.env.DEV) {
  Promise.all([
    import("./composables/usePacks.js"),
    import("./composables/useStructures.js"),
    import("./composables/useStructure.js"),
    import("./composables/useBuild.js"),
    import("./composables/useScene.js")
  ]).then(([packs, structures, structure, build, scene]) => {
    window.__sv = {
      packs: packs.usePacks(),
      structures: structures.useStructures(),
      structure: structure.useStructure(),
      build: build.useBuild(),
      scene: scene.useScene()
    }
  })
}
