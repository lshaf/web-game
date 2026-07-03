import DinoGame from './games/DinoGame.vue'
import WordLock from './games/WordLock.vue'
import FlappyBird from './games/FlappyBird.vue'
import AcakKata from './games/AcakKata.vue'
import Hangman from './games/Hangman.vue'
import TicTacToe from './games/TicTacToe.vue'

// Registry of playable games. Add a new entry here (id + component) to expand;
// the menu and the router both read from this list, and each id is its route.
export const games = [
  {
    id: 'dino',
    title: 'Dino Jump',
    tagline: 'Leap the cacti. Survive as long as you can.',
    component: DinoGame,
  },
  {
    id: 'flappy',
    title: 'Flappy',
    tagline: 'Flap through the pipes. Do not touch.',
    component: FlappyBird,
  },
  {
    id: 'wordlock',
    title: 'Word Lock',
    tagline: 'Set a secret word. Lock in letters to crack it.',
    component: WordLock,
  },
  {
    id: 'sololock',
    title: 'Solo Lock',
    tagline: 'Crack a random Indonesian word, solo.',
    component: WordLock,
    props: { mode: 'solo' },
  },
  {
    id: 'acakkata',
    title: 'Acak Kata',
    tagline: 'Unscramble the Indonesian word.',
    component: AcakKata,
  },
  {
    id: 'hangman',
    title: 'Tebak Kata',
    tagline: 'Guess the word before the gallows fills.',
    component: Hangman,
  },
  {
    id: 'tictactoe',
    title: 'Tic Tac Toe',
    tagline: 'Endless three-in-a-row. Solo vs CPU or two players.',
    component: TicTacToe,
  },
]

export function findGame(id) {
  return games.find((g) => g.id === id) || null
}
