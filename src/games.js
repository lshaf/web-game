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
import Sudoku from './games/Sudoku.vue'
import BallBreaker from './games/BallBreaker.vue'
import Minesweeper from './games/Minesweeper.vue'
import Tetris from './games/Tetris.vue'
import UlarTangga from './games/UlarTangga.vue'
import CariKata from './games/CariKata.vue'
import Otello from './games/Otello.vue'
import Dakon from './games/Dakon.vue'
import Game2048 from './games/Game2048.vue'
import GeserAngka from './games/GeserAngka.vue'
import LimaSejajar from './games/LimaSejajar.vue'
import Dam from './games/Dam.vue'
import Gaple from './games/Gaple.vue'
import Lampu from './games/Lampu.vue'
import Tirukan from './games/Tirukan.vue'
import FloodIt from './games/FloodIt.vue'

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
    duo: true,
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
    duo: true,
  },
  {
    id: 'tebakwarna',
    title: 'Tebak Warna',
    tagline: 'Crack the secret color code. Solo or two players.',
    component: TebakWarna,
    duo: true,
  },
  {
    id: 'connect4',
    title: 'Connect 4',
    tagline: 'Drop discs, line up four. Solo vs CPU or two players.',
    component: ConnectFour,
    duo: true,
  },
  {
    id: 'ingatan',
    title: 'Ingatan',
    tagline: 'Match every pair. Solo against a limit, or two players.',
    component: Ingatan,
    duo: true,
  },
  {
    id: 'armada',
    title: 'Armada',
    tagline: 'Place your fleet, sink theirs. Solo vs CPU or two players.',
    component: Armada,
    duo: true,
  },
  {
    id: 'tikus',
    title: 'Pukul Tikus',
    tagline: 'Whack moles, dodge bombs. How far can you go?',
    component: PukulTikus,
  },
  {
    id: 'sudoku',
    title: 'Sudoku',
    tagline: 'Fill the 9×9 so every row, column and box holds 1–9.',
    component: Sudoku,
  },
  {
    id: 'breaker',
    title: 'Ball Breaker',
    tagline: 'Bounce the ball, break every brick.',
    component: BallBreaker,
  },
  {
    id: 'ranjau',
    title: 'Ranjau',
    tagline: 'Clear the field without hitting a mine.',
    component: Minesweeper,
  },
  {
    id: 'tetris',
    title: 'Tetris',
    tagline: 'Stack the blocks, clear the lines.',
    component: Tetris,
  },
  {
    id: 'ular',
    title: 'Ular Tangga',
    tagline: 'Roll the die, ride ladders, dodge snakes. Solo vs CPU or two players.',
    component: UlarTangga,
    duo: true,
  },
  {
    id: 'carikata',
    title: 'Cari Kata',
    tagline: 'Find the hidden Indonesian words in the grid.',
    component: CariKata,
  },
  {
    id: 'otello',
    title: 'Otello',
    tagline: 'Flip discs to own the board. Solo vs CPU or two players.',
    component: Otello,
    duo: true,
  },
  {
    id: 'dakon',
    title: 'Dakon',
    tagline: 'Sow seeds, fill your store. Solo vs CPU or two players.',
    component: Dakon,
    duo: true,
  },
  {
    id: 'dam',
    title: 'Dam',
    tagline: 'Jump and capture on the diagonals. Solo vs CPU or two players.',
    component: Dam,
    duo: true,
  },
  {
    id: 'gomoku',
    title: 'Lima Sejajar',
    tagline: 'Line up five in a row. Solo vs CPU or two players.',
    component: LimaSejajar,
    duo: true,
  },
  {
    id: 'gaple',
    title: 'Gaple',
    tagline: 'Match the dominoes, empty your hand. Solo vs CPU or two players.',
    component: Gaple,
    duo: true,
  },
  {
    id: '2048',
    title: '2048',
    tagline: 'Slide and merge tiles to reach 2048.',
    component: Game2048,
  },
  {
    id: 'geser',
    title: 'Geser Angka',
    tagline: 'Slide the tiles to order 1–15.',
    component: GeserAngka,
  },
  {
    id: 'lampu',
    title: 'Lampu',
    tagline: 'Tap to toggle. Turn every light off.',
    component: Lampu,
  },
  {
    id: 'tirukan',
    title: 'Tirukan',
    tagline: 'Watch the colors, then tap them back in order.',
    component: Tirukan,
  },
  {
    id: 'flood',
    title: 'Flood-It',
    tagline: 'Flood the board into one colour before you run out of moves.',
    component: FloodIt,
  },
]

export function findGame(id) {
  return games.find((g) => g.id === id) || null
}
