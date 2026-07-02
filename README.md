# Dusk Arcade

A small web arcade built with Vue 3 + Vite. The first screen is a game
selection menu; pick a cabinet and play. The first game is **Dino Jump** —
a dusk-desert runner with SVG assets.

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
