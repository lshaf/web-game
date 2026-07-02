<script setup>
import DinoSprite from './DinoSprite.vue'

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
      <span>MORE CABINETS SOON</span>
    </footer>
  </div>
</template>

<style scoped>
.select {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 0 20px 64px;
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
  text-align: center;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.3em;
  color: rgba(185, 169, 214, 0.55);
}

@media (max-width: 560px) {
  .cabinet {
    grid-template-columns: auto 1fr;
    grid-template-areas:
      "no meta"
      "art play";
    row-gap: 14px;
  }
  .cabinet__no {
    grid-area: no;
  }
  .cabinet__meta {
    grid-area: meta;
  }
  .cabinet__art {
    grid-area: art;
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
