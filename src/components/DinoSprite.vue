<script setup>
// A blocky T-rex silhouette assembled from simple shapes so it renders
// predictably at any size. `run` animates the legs; `dead` freezes them.
defineProps({
  run: { type: Boolean, default: false },
  dead: { type: Boolean, default: false },
  eyeColor: { type: String, default: 'var(--cream)' },
})
</script>

<template>
  <svg
    class="dino"
    :class="{ 'is-run': run && !dead, 'is-dead': dead }"
    viewBox="0 0 48 54"
    role="img"
    aria-label="Dinosaur"
  >
    <!-- Silhouette body, all pieces share currentColor -->
    <g fill="currentColor">
      <polygon points="8,21 8,31 0,26" />          <!-- tail -->
      <rect x="6" y="20" width="30" height="17" rx="1" /> <!-- body -->
      <rect x="16" y="10" width="22" height="14" rx="1" /><!-- neck / back -->
      <rect x="28" y="0" width="20" height="15" rx="1.5" /><!-- head -->
      <rect x="30" y="24" width="8" height="4" rx="1" />  <!-- arm -->
      <!-- legs (animated) -->
      <rect class="leg leg--back" x="14" y="36" width="6" height="16" rx="1" />
      <rect class="leg leg--front" x="26" y="36" width="6" height="16" rx="1" />
    </g>
    <!-- eye -->
    <circle v-if="!dead" cx="41" cy="7" r="2" :fill="eyeColor" />
    <g v-else :stroke="eyeColor" stroke-width="1.6" stroke-linecap="round">
      <line x1="39" y1="5" x2="43" y2="9" />
      <line x1="43" y1="5" x2="39" y2="9" />
    </g>
  </svg>
</template>

<style scoped>
.dino {
  display: block;
  height: 100%;
  width: auto;
  color: #43c96b;
  /* Chunky cartoon outline around the whole silhouette. */
  filter: drop-shadow(1.5px 0 0 var(--ink)) drop-shadow(-1.5px 0 0 var(--ink))
    drop-shadow(0 1.5px 0 var(--ink)) drop-shadow(0 -1.5px 0 var(--ink));
}

.leg {
  transform-origin: 50% 40%;
}

.is-run .leg--front {
  animation: step 0.26s steps(2) infinite;
}
.is-run .leg--back {
  animation: step 0.26s steps(2) infinite reverse;
}

@keyframes step {
  0% {
    transform: translateY(0) scaleY(1);
  }
  50% {
    transform: translateY(4px) scaleY(0.72);
  }
  100% {
    transform: translateY(0) scaleY(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .leg {
    animation: none !important;
  }
}
</style>
