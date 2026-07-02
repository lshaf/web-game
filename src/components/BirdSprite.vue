<script setup>
// A round cartoon bird assembled from simple shapes, ink-outlined to match the
// arcade. Tilt/position are applied by the parent; this just draws the bird.
defineProps({
  dead: { type: Boolean, default: false },
})
</script>

<template>
  <svg
    class="bird"
    :class="{ 'is-dead': dead }"
    viewBox="0 0 46 34"
    role="img"
    aria-label="Bird"
  >
    <g stroke="var(--ink)" stroke-width="2.6" stroke-linejoin="round">
      <ellipse class="bird__body" cx="21" cy="18" rx="16" ry="14" fill="#ffd23f" />
      <path class="bird__wing" d="M8 16 q-4 7 4 10 q7 1 9 -7 q-7 -4 -13 -3 z" fill="#ff8a3d" />
      <polygon class="bird__beak" points="35,13 46,18 35,23" fill="#ff8a3d" />
    </g>
    <circle cx="27" cy="12" r="6" fill="#fff3df" stroke="var(--ink)" stroke-width="2.2" />
    <circle class="bird__pupil" :cx="dead ? 27 : 29" cy="12" r="2.8" fill="var(--ink)" />
  </svg>
</template>

<style scoped>
.bird {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.bird__wing {
  transform-origin: 12px 17px;
  animation: flap 0.32s ease-in-out infinite;
}
.is-dead .bird__wing {
  animation: none;
  transform: rotate(18deg);
}

@keyframes flap {
  0%,
  100% {
    transform: rotate(4deg);
  }
  50% {
    transform: rotate(-26deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bird__wing {
    animation: none;
  }
}
</style>
