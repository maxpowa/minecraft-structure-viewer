import { ref } from "vue"

// which sidebar list shows; shared by the tab strips inside both sections
export const tab = ref(new URLSearchParams(location.search).has("feature") ? "features" : "structures")
