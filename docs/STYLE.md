# Style pattern — building a new game

The golden rule: **common UI lives in [`src/styles.css`](../src/styles.css); a
component's scoped `<style>` holds only what is unique to that page** (its
board geometry, per-game colors, and one-off animations). If you find yourself
writing a button/panel/heading that looks like every other game, you're
duplicating — use the shared class instead.

Do this from the start and you never need a "simplify" pass later.

---

## 1. Design tokens (CSS variables, defined in `:root`)

Never hard-code these values — reference the variable.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#2c1338` | outlines & text |
| `--cream` | `#fff3df` | panel / paper |
| `--aqua` / `--aqua-deep` | teal | primary accent |
| `--berry` | hot pink | alert / accent |
| `--sun` / `--sun-core` | yellow / orange | secondary accent |
| `--muted` | plum-grey | secondary text |
| `--line` | `3px` | cartoon outline weight |
| `--pop` / `--pop-sm` | `5px 5px 0 --ink` / `3px 3px 0` | hard offset shadow |
| `--paper-lit` | `#fffaf0` | input / cell fill |
| `--tile-live` | `#fff3c4` | a tile being typed / hovered |
| `--tile-wrong` | `#ffd0dc` | a wrong / missed tile |
| `--absent` | `#ccbfda` | an absent / used letter |
| `--font-display` | Lilita One | wordmarks & big titles |
| `--font-body` | Fredoka | body & buttons |
| `--font-mono` | DM Mono | labels, scores, clues |

## 2. Shared classes (in `styles.css`) — use these as-is

Layout / containers:

- **`.panel`** — the cream card. Set only `padding` (and `display:flex;
  flex-direction:column; align-items:center` if the game centers via the panel
  instead of `.screen`) in your scoped style.
- **`.screen`** — a vertical centered column for one screen/phase.
- **`.backbar` + `.mini`** — top-left back/mode pill row. `.mini--ghost` is an
  invisible pill spacer to balance a three-slot bar.
- **`.topbar`** + **`.status`** (+`.status.is-over`) — left/center/right control
  bar with a centered status label that turns berry when the round is over.

Buttons:

- **`.cta`** — primary chunky button (aqua). Modifiers: **`.cta--alt`** (sun),
  **`.cta--ghost`** (white). Disabled + hover/active states are built in.
- **`.mini`** — small rounded pill (mode/back/secondary).

Headings & text:

- **`.brand`** — the wordmark (ink). Set only `font-size` scoped. Wrap the
  trailing segment in `<span class="brand__accent">` for the two-tone look
  (ink + aqua-deep) — every game's wordmark reads the same way.
- **`.eyebrow`** — mono uppercase label above the title (muted). On a mode
  picker the text is always `PILIH MODE`.
- **`.clue`** + **`.clue__label`** — a clue line with its "CLUE" kicker.
- **`.field`** + **`.field__label`** — a labelled form input group.

Game furniture:

- **`.solobar`** (+ `.solobar b`, `.solobar__best`) — the STREAK / BEST bar.
- **`.handoff`** (+ `.handoff__title`, `.handoff__sub`, `.lock-badge`) — the
  pass-and-play "hand the device over" screen.
- **`.result`** (+ `.result__title`, `.result__title.is-lost`, `.result__sub`,
  `.result__streak`, `.result__board`) — the win/lose screen.
- **`.shake`** — toggle this class to shake an element on invalid input.

Motion: reduced-motion is handled globally — you do **not** need a
`@media (prefers-reduced-motion)` block in your component.

## 3. What stays in the component's scoped `<style>`

Only things unique to this game:

- the outer shell wrapper (its `max-width` + safe-area padding),
- the board / grid / tile geometry and the per-game tile state colors,
- game-specific pieces (swatches, pegs, gallows, marks…),
- unique `@keyframes` (name them so they don't collide).

Don't re-declare `.panel`, `.cta`, `.brand`, `.solobar`, etc. — a scoped rule
with the same name will just shadow the global one and re-introduce duplication.

## 4. New-game skeleton

Copy this, rename `mygame`, and register it in
[`src/games.js`](../src/games.js) (`id` becomes its `/play/:id` route). A
matching cabinet icon goes in
[`src/components/GameSelect.vue`](../src/components/GameSelect.vue).

```vue
<script setup>
import { ref } from 'vue'
import { sfx } from '../sound.js' // sfx.win / lose / wrong / tick / jump / flap

const phase = ref('mode') // mode | play | won | lost …
</script>

<template>
  <div class="mygame">
    <div class="panel">
      <!-- Mode picker / setup / play / result all use .screen -->
      <section class="screen">
        <div class="backbar">
          <button class="mini" type="button" @click="phase = 'mode'">← Mode</button>
        </div>
        <p class="brand">MY<span>GAME</span></p>
        <p class="eyebrow">ONE-LINE TAGLINE</p>

        <!-- game body: your board goes here (scoped styles) -->

        <button class="cta" type="button">Start ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only. Everything above (panel, brand, eyebrow, cta, mini,
   backbar) is styled by src/styles.css. */
.mygame {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

/* .board, .tile, per-game colors, unique @keyframes … */
</style>
```

## 5. Adding a shared piece

If a new game needs a control that *another* game will plausibly reuse, add it
to `styles.css` under the component layer (not to the game's scoped block) so it
is shared from day one.
