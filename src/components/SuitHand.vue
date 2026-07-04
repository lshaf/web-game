<script setup>
// The three Suit throws drawn as chunky cartoon icons. `choice` is one of
// 'batu' | 'gunting' | 'kertas'; null renders a question mark (hidden pick).
defineProps({
  choice: { type: String, default: null },
})
</script>

<template>
  <svg class="hand" viewBox="0 0 64 64" role="img" :aria-label="choice || 'tersembunyi'">
    <!-- BATU: a lumpy rock -->
    <path
      v-if="choice === 'batu'"
      d="M15 40 Q9 25 24 20 Q35 13 47 22 Q57 31 48 43 Q40 51 25 48 Q17 46 15 40 Z"
      fill="#b6abcf"
      stroke="var(--ink)"
      stroke-width="3.2"
      stroke-linejoin="round"
    />

    <!-- KERTAS: a sheet with a folded corner -->
    <g v-else-if="choice === 'kertas'">
      <path
        d="M19 13 H40 L48 21 V51 H19 Z"
        fill="var(--cream)"
        stroke="var(--ink)"
        stroke-width="3.2"
        stroke-linejoin="round"
      />
      <path d="M40 13 V21 H48" fill="none" stroke="var(--ink)" stroke-width="2.6" stroke-linejoin="round" />
      <g stroke="var(--muted)" stroke-width="2.2" stroke-linecap="round">
        <line x1="25" y1="31" x2="42" y2="31" />
        <line x1="25" y1="38" x2="42" y2="38" />
        <line x1="25" y1="45" x2="35" y2="45" />
      </g>
    </g>

    <!-- GUNTING: open scissors -->
    <g v-else-if="choice === 'gunting'">
      <line x1="25" y1="42" x2="49" y2="13" stroke="var(--aqua-deep)" stroke-width="5.5" stroke-linecap="round" />
      <line x1="39" y1="42" x2="15" y2="13" stroke="var(--aqua-deep)" stroke-width="5.5" stroke-linecap="round" />
      <circle cx="22" cy="47" r="7" fill="none" stroke="var(--ink)" stroke-width="3.2" />
      <circle cx="42" cy="47" r="7" fill="none" stroke="var(--ink)" stroke-width="3.2" />
      <circle cx="32" cy="29" r="2.6" fill="var(--ink)" />
    </g>

    <!-- unknown / hidden -->
    <text
      v-else
      x="32"
      y="44"
      text-anchor="middle"
      font-family="var(--font-display)"
      font-size="34"
      fill="var(--muted)"
    >?</text>
  </svg>
</template>

<style scoped>
.hand {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
