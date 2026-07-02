<script setup>
import DinoSprite from './DinoSprite.vue'
import BirdSprite from './BirdSprite.vue'
import { appVersion, updateReady, applyUpdate } from '../pwa.js'

defineProps({
  games: { type: Array, required: true },
})
defineEmits(['select'])
</script>

<template>
  <div class="select">
    <!-- Hero: the arcade sign over a sunny cartoon sky. -->
    <header class="hero sky">
      <span class="cloud cloud--a" aria-hidden="true" />
      <span class="cloud cloud--b" aria-hidden="true" />

      <h1 class="hero__title">
        <span class="hero__title-a">DUSK</span><span class="hero__title-b">ARCADE</span>
      </h1>

      <svg class="sun-face" viewBox="0 0 120 120" aria-hidden="true">
        <g class="sun-face__rays">
          <polygon points="54,25 66,25 60,11" transform="rotate(0 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(45 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(90 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(135 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(180 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(225 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(270 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(315 60 60)" />
        </g>
        <circle class="sun-face__disc" cx="60" cy="60" r="33" />
        <circle class="sun-face__cheek" cx="45" cy="67" r="4.5" />
        <circle class="sun-face__cheek" cx="75" cy="67" r="4.5" />
        <circle class="sun-face__eye" cx="51" cy="57" r="4" />
        <circle class="sun-face__eye" cx="69" cy="57" r="4" />
        <path class="sun-face__smile" d="M49 66 Q60 79 71 66" />
      </svg>

      <div class="hero__ground" aria-hidden="true" />
      <div class="hero__runner" aria-hidden="true"><DinoSprite run /></div>
    </header>

    <ul class="cabinets">
      <li v-for="(game, i) in games" :key="game.id">
        <button class="cabinet" @click="$emit('select', game.id)">
          <span class="cabinet__no">{{ i + 1 }}</span>
          <span class="cabinet__art sky">
            <span class="sky__sun cabinet__sun" />
            <span v-if="game.id === 'wordlock'" class="cabinet__tiles" aria-hidden="true">
              <i class="t-correct">W</i><i class="t-present">O</i><i class="t-plain">R</i><i class="t-correct">D</i>
            </span>
            <span v-else-if="game.id === 'flappy'" class="cabinet__flappy" aria-hidden="true">
              <i class="cabinet__pipe cabinet__pipe--top" />
              <i class="cabinet__pipe cabinet__pipe--bot" />
              <span class="cabinet__bird"><BirdSprite /></span>
            </span>
            <span v-else-if="game.id === 'sololock'" class="cabinet__solo" aria-hidden="true">
              <svg class="cabinet__lock" viewBox="0 0 24 24">
                <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="var(--ink)" stroke-width="2.4" />
                <rect x="4.3" y="11" width="15.4" height="11" rx="2.5" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.4" />
                <circle cx="12" cy="15.5" r="1.7" fill="var(--ink)" />
                <rect x="11.2" y="16" width="1.6" height="3.4" rx="0.8" fill="var(--ink)" />
              </svg>
            </span>
            <span v-else class="cabinet__dino"><DinoSprite run /></span>
          </span>
          <span class="cabinet__meta">
            <span class="cabinet__title">{{ game.title }}</span>
            <span class="cabinet__tag">{{ game.tagline }}</span>
          </span>
          <span class="cabinet__play">PLAY ▸</span>
        </button>
      </li>
    </ul>

    <footer class="foot">
      <span class="foot__soon">More games coming soon</span>
      <span class="foot__build">
        <span class="foot__ver">v{{ appVersion }}</span>
        <button
          class="foot__update"
          :class="{ 'is-ready': updateReady }"
          :title="updateReady ? 'A new build is ready — tap to reload' : 'Reload for the latest build'"
          @click="applyUpdate"
        >
          <span v-if="updateReady" class="foot__dot" aria-hidden="true" />
          {{ updateReady ? 'Update ready' : 'Update' }}
        </button>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.select {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 20px max(20px, env(safe-area-inset-right)) calc(56px + env(safe-area-inset-bottom))
    max(20px, env(safe-area-inset-left));
}

/* ---- Hero ---- */
.hero {
  height: 300px;
  border: var(--line) solid var(--ink);
  border-radius: 26px;
  box-shadow: var(--pop);
}

/* The arcade sign, sitting in the sky above the sun. */
.hero__title {
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  z-index: 3;
  margin: 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: clamp(38px, 10vw, 62px);
  line-height: 0.85;
  letter-spacing: 0.01em;
}
.hero__title span {
  display: block;
  -webkit-text-stroke: 3px var(--ink);
  paint-order: stroke fill;
  text-shadow: var(--pop);
}
.hero__title-a {
  color: var(--sun);
}
.hero__title-b {
  color: var(--aqua);
}

.cloud {
  position: absolute;
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  box-shadow: inset 0 -6px 0 rgba(44, 19, 56, 0.06);
}
.cloud--a {
  top: 150px;
  left: 26px;
  width: 70px;
  height: 28px;
  animation: drift 14s ease-in-out infinite;
}
.cloud--b {
  top: 122px;
  right: 30px;
  width: 52px;
  height: 22px;
  animation: drift 18s ease-in-out infinite reverse;
}

.sun-face {
  position: absolute;
  left: 50%;
  bottom: 12px;
  width: 150px;
  height: 150px;
  transform: translateX(-50%);
  transform-origin: 50% 80%;
  animation: sun-bob 4s ease-in-out infinite;
}
.sun-face__rays {
  transform-origin: 60px 60px;
  animation: spin 26s linear infinite;
}
.sun-face__rays polygon {
  fill: var(--sun);
  stroke: var(--ink);
  stroke-width: 2.4;
  stroke-linejoin: round;
}
.sun-face__disc {
  fill: var(--sun);
  stroke: var(--ink);
  stroke-width: 4;
}
.sun-face__eye {
  fill: var(--ink);
  transform-origin: center;
  animation: blink 5.5s ease-in-out infinite;
}
.sun-face__cheek {
  fill: var(--berry);
  opacity: 0.5;
}
.sun-face__smile {
  fill: none;
  stroke: var(--ink);
  stroke-width: 4;
  stroke-linecap: round;
}

.hero__ground {
  position: absolute;
  inset: auto 0 0 0;
  height: 46px;
  background: var(--aqua);
  border-top: var(--line) solid var(--ink);
}
.hero__runner {
  position: absolute;
  bottom: 40px;
  height: 52px;
  left: -60px;
  color: #43c96b;
  animation: run-across 7.5s linear infinite;
}
.hero__runner .dino {
  animation: hop 0.75s ease-in-out infinite;
}

@keyframes run-across {
  0% {
    left: -60px;
  }
  100% {
    left: 100%;
  }
}
@keyframes hop {
  0%,
  70%,
  100% {
    transform: translateY(0);
  }
  35% {
    transform: translateY(-24px);
  }
}
@keyframes sun-bob {
  0%,
  100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-6px);
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  96% {
    transform: scaleY(0.15);
  }
}
@keyframes drift {
  0%,
  100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(14px);
  }
}

/* ---- Cabinets ---- */
.cabinets {
  list-style: none;
  padding: 0;
  margin: 28px 0 0;
  display: grid;
  gap: 20px;
}
.cabinet {
  width: 100%;
  display: grid;
  grid-template-columns: auto 132px 1fr auto;
  align-items: center;
  gap: 18px;
  text-align: left;
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 20px;
  padding: 14px 18px 14px 14px;
  box-shadow: var(--pop);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.cabinet:hover,
.cabinet:focus-visible {
  transform: translate(-2px, -2px);
  box-shadow: 8px 8px 0 var(--ink);
}
.cabinet:active {
  transform: translate(3px, 3px);
  box-shadow: 2px 2px 0 var(--ink);
}
.cabinet__no {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ink);
  background: var(--sun);
  border: var(--line) solid var(--ink);
  border-radius: 50%;
}
.cabinet__art {
  height: 84px;
  border-radius: 14px;
  border: var(--line) solid var(--ink);
}
.cabinet__sun {
  width: 96px;
  height: 96px;
  bottom: -18%;
}
.cabinet__dino {
  position: absolute;
  left: 14px;
  bottom: 10px;
  height: 34px;
  color: #43c96b;
  z-index: 1;
}

/* Word Lock cabinet: chunky tiles mid-solve. */
.cabinet__tiles {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  gap: 4px;
  z-index: 1;
}
.cabinet__tiles i {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-style: normal;
  font-size: 13px;
  border-radius: 6px;
  border: 2px solid var(--ink);
  color: var(--ink);
}
.cabinet__tiles .t-correct {
  background: var(--aqua);
}
.cabinet__tiles .t-present {
  background: var(--sun);
}
.cabinet__tiles .t-plain {
  background: var(--cream);
}

/* Flappy cabinet: a bird threading a pipe gap. */
.cabinet__flappy {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.cabinet__bird {
  position: absolute;
  left: 22px;
  top: 46%;
  transform: translateY(-50%);
  width: 42px;
  height: 31px;
}
.cabinet__pipe {
  position: absolute;
  right: 28px;
  width: 26px;
  background: #57cc5f;
  border: 2px solid var(--ink);
  border-radius: 5px;
}
.cabinet__pipe--top {
  top: -3px;
  height: 26px;
}
.cabinet__pipe--bot {
  bottom: -3px;
  height: 32px;
}

/* Solo Lock cabinet: a padlock. */
.cabinet__solo {
  position: absolute;
  left: 16px;
  bottom: 12px;
  z-index: 1;
}
.cabinet__lock {
  display: block;
  width: 46px;
  height: 46px;
  filter: drop-shadow(2px 2px 0 var(--ink));
}
.cabinet__title {
  font-family: var(--font-display);
  font-size: 24px;
  color: var(--ink);
}
.cabinet__tag {
  display: block;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
}
.cabinet__play {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.04em;
  color: var(--ink);
  background: var(--aqua);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  padding: 8px 15px;
  white-space: nowrap;
}

/* ---- Footer ---- */
.foot {
  margin-top: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  font-family: var(--font-body);
  font-weight: 600;
  color: var(--muted);
}
.foot__soon {
  font-size: 14px;
  letter-spacing: 0.02em;
}
.foot__build {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
.foot__ver {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--muted);
}
.foot__update {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  padding: 6px 15px;
  box-shadow: var(--pop-sm);
  transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;
}
.foot__update:hover,
.foot__update:focus-visible {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
}
.foot__update:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
.foot__update.is-ready {
  background: var(--sun);
}
.foot__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--berry);
  border: 1.5px solid var(--ink);
  animation: dot-pulse 1.2s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.35);
  }
}

/* ---- Mobile: art becomes a full banner ---- */
@media (max-width: 560px) {
  .cabinet {
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      "art  art  art"
      "no   meta play";
    gap: 12px 14px;
  }
  .cabinet__no {
    grid-area: no;
    align-self: center;
  }
  .cabinet__meta {
    grid-area: meta;
  }
  .cabinet__art {
    grid-area: art;
    width: 100%;
    height: 104px;
  }
  .cabinet__play {
    grid-area: play;
    align-self: center;
    justify-self: end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero__runner,
  .hero__runner .dino,
  .sun-face,
  .sun-face__rays,
  .sun-face__eye,
  .cloud,
  .foot__dot {
    animation: none;
  }
  .hero__runner {
    left: 40px;
  }
}
</style>
