import { ref } from "vue"

// set false to disable the Features tab: the tab bar hides, FeaturesSection is
// never mounted, and ?feature deep-links are ignored, leaving Structures only
export const featuresEnabled = false

export const tab = ref(featuresEnabled && new URLSearchParams(location.search).has("feature") ? "features" : "structures")
