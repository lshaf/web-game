# Dusk Arcade

A small web arcade built with Vue 3 + Vite. The first screen is a game
selection menu; pick a cabinet and play. The first game is **Dino Jump** —
a dusk-desert runner with SVG assets.

It installs as a **PWA**: add it to a phone home screen and it launches
full-screen and plays offline. The layout is mobile-first — safe-area insets
for notched phones, dynamic viewport height, and tap-to-jump controls.

## PWA

- **Icon** — a single vector, [public/icon.svg](public/icon.svg) (dusk sky,
  setting sun, dino silhouette). It's the primary manifest icon; the PNGs in
  `public/` are raster fallbacks derived from it for iOS home screens and the
  Android install banner.
- **Offline** — [public/sw.js](public/sw.js) caches the app shell on install
  and everything else (scripts, styles, fonts) as it's requested, so the
  arcade opens with no network after the first visit.
- **Updates** — the menu footer prints the build version and an **Update**
  button. A newly deployed build waits until tapped rather than swapping mid-
  game; the button lights up when one is ready. Bump `CACHE` in `sw.js` to
  retire the old cache on the next visit.

## Develop

```bash
npm install
npm run dev
```

Then open the printed local URL.

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build
```

## Deploy (GitHub Pages)

Pushing to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml),
which builds the site and publishes `dist/` to GitHub Pages.

One-time setup in the repo: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. After the first successful run the game is live at
`https://<user>.github.io/<repo>/`.

The Vite `base` is set to `./` (relative), so the build works under any repo
path without extra configuration.

## Add another game

1. Create a component in `src/games/`.
2. Register it in the `games` array in [src/App.vue](src/App.vue).

It then appears as a new cabinet on the menu automatically.

## Structure

```
src/
  App.vue                 menu <-> play routing + game registry
  components/
    GameSelect.vue        the arcade menu (hero + cabinet tiles)
    DinoSprite.vue        shared SVG dinosaur silhouette
  games/
    DinoGame.vue          the Dino Jump game
```
