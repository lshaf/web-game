import DinoGame from './games/DinoGame.vue'
import WordLock from './games/WordLock.vue'
import FlappyBird from './games/FlappyBird.vue'
import AcakKata from './games/AcakKata.vue'
import Hangman from './games/Hangman.vue'
import TicTacToe from './games/TicTacToe.vue'
import TebakWarna from './games/TebakWarna.vue'
import ConnectFour from './games/ConnectFour.vue'
import Ingatan from './games/Ingatan.vue'
import Armada from './games/Armada.vue'
import PukulTikus from './games/PukulTikus.vue'

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
    tagline: 'Lock in letters to crack the word. Solo or two players.',
    component: WordLock,
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
  {
    id: 'tebakwarna',
    title: 'Tebak Warna',
    tagline: 'Crack the secret color code. Solo or two players.',
    component: TebakWarna,
  },
  {
    id: 'connect4',
    title: 'Connect 4',
    tagline: 'Drop discs, line up four. Solo vs CPU or two players.',
    component: ConnectFour,
  },
  {
    id: 'ingatan',
    title: 'Ingatan',
    tagline: 'Match every pair. Solo against a limit, or two players.',
    component: Ingatan,
  },
  {
    id: 'armada',
    title: 'Armada',
    tagline: 'Place your fleet, sink theirs. Solo vs CPU or two players.',
    component: Armada,
  },
  {
    id: 'tikus',
    title: 'Pukul Tikus',
    tagline: 'Whack moles, dodge bombs. How far can you go?',
    component: PukulTikus,
  },
]

export function findGame(id) {
  return games.find((g) => g.id === id) || null
}
