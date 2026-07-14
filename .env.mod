# Build profile for vendoring inside the Structorium mod.
#   npm run build -- --mode mod
# An empty VITE_API_BASE puts the viewer in API mode against the SAME origin,
# so the mod can serve this bundle and its /api endpoints together.
VITE_API_BASE=
