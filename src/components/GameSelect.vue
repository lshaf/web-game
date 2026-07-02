<script setup>
import DinoSprite from './DinoSprite.vue'
import { appVersion, updateReady, applyUpdate } from '../pwa.js'

defineProps({
  games: { type: Array, required: true },
})
defineEmits(['select'])
</script>

<template>
  <div class="select">
    <!-- Hero: the shared dusk horizon. A dino runs the line the game is played on. -->
    <section class="sky hero" aria-hidden="true">
      <span class="sky__sun" />
      <div class="hero__horizon" />
      <div class="hero__runner">
        <DinoSprite run />
      </div>
      <div class="hero__scrub" />
    </section>

    <header class="masthead">
      <p class="eyebrow">INSERT COIN</p>
      <h1 class="wordmark">DUSK<span>ARCADE</span></h1>
      <p class="lede">Pick a cabinet. The horizon does the rest.</p>
    </header>

    <ul class="cabinets">
      <li v-for="(game, i) in games" :key="game.id">
        <button class="cabinet" @click="$emit('select', game.id)">
          <span class="cabinet__no">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="cabinet__art sky">
            <span class="sky__sun cabinet__sun" />
            <span class="cabinet__dino"><DinoSprite run /></span>
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
      <span class="foot__soon">MORE CABINETS SOON</span>
      <span class="foot__build">
        <span class="foot__ver">BUILD v{{ appVersion }}</span>
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
  max-width: 960px;
  margin: 0 auto;
  /* Side cutouts + home indicator get their space; the dark hero happily
     bleeds under the translucent status bar up top. */
  padding: 0 max(20px, env(safe-area-inset-right)) calc(64px + env(safe-area-inset-bottom))
    max(20px, env(safe-area-inset-left));
}

/* ---- Hero ---- */
.hero {
  height: 240px;
  border-radius: 0 0 20px 20px;
  border-bottom: 1px solid rgba(255, 210, 122, 0.25);
}

.hero__horizon {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 34px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--glow) 20%, var(--glow) 80%, transparent);
  opacity: 0.7;
}

.hero__runner {
  position: absolute;
  bottom: 30px;
  height: 56px;
  color: var(--ink);
  left: -60px;
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
    transform: translateY(-26px);
  }
}

.hero__scrub {
  position: absolute;
  inset: auto 0 0 0;
  height: 30px;
  background: var(--ink);
  opacity: 0.85;
}

/* ---- Masthead ---- */
.masthead {
  text-align: center;
  padding: 34px 0 8px;
}

.eyebrow {
  font-family: var(--font-mono);
  letter-spacing: 0.42em;
  font-size: 12px;
  color: var(--horizon);
  margin: 0 0 14px;
}

.wordmark {
  font-family: var(--font-display);
  font-size: clamp(38px, 9vw, 76px);
  line-height: 0.9;
  margin: 0;
  color: var(--sand);
  text-shadow: 0 3px 0 rgba(255, 138, 76, 0.35);
}

.wordmark span {
  display: block;
  color: var(--horizon);
}

.lede {
  font-size: 16px;
  color: var(--muted);
  margin: 18px 0 0;
}

/* ---- Cabinet tiles ---- */
.cabinets {
  list-style: none;
  padding: 0;
  margin: 40px 0 0;
  display: grid;
  gap: 16px;
}

.cabinet {
  width: 100%;
  display: grid;
  grid-template-columns: auto 132px 1fr auto;
  align-items: center;
  gap: 20px;
  text-align: left;
  background: #1e1733;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  padding: 14px 22px 14px 16px;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.cabinet:hover,
.cabinet:focus-visible {
  transform: translateY(-3px);
  border-color: rgba(255, 210, 122, 0.55);
  background: #241b3d;
}

.cabinet__no {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--muted);
}

.cabinet__art {
  height: 78px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.cabinet__sun {
  width: 90px;
  height: 90px;
  bottom: -14%;
}

.cabinet__dino {
  position: absolute;
  left: 14px;
  bottom: 10px;
  height: 34px;
  color: var(--ink);
}

.cabinet__title {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--sand);
}

.cabinet__tag {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: var(--muted);
}

.cabinet__play {
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.12em;
  color: var(--horizon);
  white-space: nowrap;
}

/* ---- Footer ---- */
.foot {
  margin-top: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.3em;
  color: rgba(185, 169, 214, 0.55);
}

.foot__build {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  letter-spacing: 0.16em;
}

.foot__ver {
  color: rgba(185, 169, 214, 0.5);
}

.foot__update {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--muted);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 6px 14px;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.foot__update:hover,
.foot__update:focus-visible {
  color: var(--sand);
  border-color: rgba(255, 210, 122, 0.5);
  background: rgba(255, 210, 122, 0.06);
}

/* Lit up only when a freshly deployed build is actually waiting. */
.foot__update.is-ready {
  color: var(--night);
  background: var(--glow);
  border-color: var(--glow);
}

.foot__update.is-ready:hover,
.foot__update.is-ready:focus-visible {
  background: #ffdf9a;
}

.foot__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--horizon);
  box-shadow: 0 0 0 0 rgba(255, 138, 76, 0.6);
  animation: update-pulse 1.6s ease-out infinite;
}

@keyframes update-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 138, 76, 0.55);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(255, 138, 76, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 138, 76, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .foot__dot {
    animation: none;
  }
}

@media (max-width: 560px) {
  .cabinet {
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      "art  art  art"
      "no   meta play";
    gap: 12px 16px;
    align-items: center;
  }
  .cabinet__no {
    grid-area: no;
    align-self: center;
  }
  .cabinet__meta {
    grid-area: meta;
  }
  /* Full-bleed dusk banner instead of a collapsed sliver — the art's children
     are absolutely positioned, so it needs an explicit size to show up. */
  .cabinet__art {
    grid-area: art;
    width: 100%;
    height: 96px;
  }
  .cabinet__play {
    grid-area: play;
    align-self: center;
    justify-self: end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero__runner,
  .hero__runner .dino {
    animation: none;
  }
  .hero__runner {
    left: 40px;
  }
}
</style>
