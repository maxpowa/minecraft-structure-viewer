// Procedural structures are assembled in code, not template pools, so their
// pieces can't be detected as pieces by the worldgen scan. Only the entry
// counts as a starter. steps: true grows through the level menu; the mansion
// flood-fills in one pass so it just builds whole.
export const PROC = [
  { prefix: "minecraft/igloo/", entry: "minecraft/igloo/top", label: "Igloo", gen: "igloo", steps: true, maxDepth: 2 },
  { prefix: "minecraft/end_city/", entry: "minecraft/end_city/base_floor", label: "End City", gen: "end_city", steps: true, maxDepth: 8 },
  { prefix: "minecraft/woodland_mansion/", entry: "minecraft/woodland_mansion/entrance", label: "Woodland Mansion", gen: "mansion", steps: false },
  // extracted hardcoded structures with random cells: they load with seed 0
  // and Re-roll picks a fresh seed (which goes into the url)
  { prefix: "minecraft/builtin/jungle_temple", entry: "minecraft/builtin/jungle_temple", label: "Jungle Temple", gen: "jungle_temple", steps: false, reroll: true },
  { prefix: "minecraft/builtin/desert_pyramid", entry: "minecraft/builtin/desert_pyramid", label: "Desert Pyramid", gen: "desert_pyramid", steps: false, reroll: true },
  { prefix: "minecraft/builtin/desert_well", entry: "minecraft/builtin/desert_well", label: "Desert Well", gen: "desert_well", steps: false, reroll: true },
  // the 5x5 entry is the real Dungeon generator (its re-roll includes the
  // size); the other variants re-roll their own contents at fixed size
  { prefix: "minecraft/builtin/dungeon/", entry: "minecraft/builtin/dungeon/5x5", label: "Dungeon", gen: "dungeon", steps: false, reroll: true },
  { prefix: "minecraft/builtin/dungeon/7x5", entry: "minecraft/builtin/dungeon/7x5", label: "Dungeon", gen: "dungeon_7x5", steps: false, reroll: true },
  { prefix: "minecraft/builtin/dungeon/5x7", entry: "minecraft/builtin/dungeon/5x7", label: "Dungeon", gen: "dungeon_5x7", steps: false, reroll: true },
  { prefix: "minecraft/builtin/dungeon/7x7", entry: "minecraft/builtin/dungeon/7x7", label: "Dungeon", gen: "dungeon_7x7", steps: false, reroll: true },
  { prefix: "minecraft/builtin/nether_fortress/", entry: "minecraft/builtin/nether_fortress/bridge_crossing", label: "Nether Fortress", gen: "fortress", steps: true, maxDepth: 30 },
  { prefix: "minecraft/builtin/end_spike", entry: "minecraft/builtin/end_spike", label: "End Spikes", gen: "end_spikes", steps: false },
  { prefix: "minecraft/builtin/stronghold/", entry: "minecraft/builtin/stronghold/stairs_down", label: "Stronghold", gen: "stronghold", steps: true, maxDepth: 50 },
  { prefix: "minecraft/builtin/mineshaft/normal/", entry: "minecraft/builtin/mineshaft/normal/corridor", label: "Mineshaft", gen: "mineshaft", steps: true, maxDepth: 9 },
  { prefix: "minecraft/builtin/mineshaft/mesa/", entry: "minecraft/builtin/mineshaft/mesa/corridor", label: "Badlands Mineshaft", gen: "mineshaft_mesa", steps: true, maxDepth: 9 },
  { prefix: "minecraft/builtin/ocean_monument", entry: "minecraft/builtin/ocean_monument", label: "Ocean Monument", gen: "monument", steps: false }
]
