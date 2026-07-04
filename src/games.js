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
import Snake from './games/Snake.vue'
import Permata from './games/Permata.vue'
import Menara from './games/Menara.vue'
import Sokoban from './games/Sokoban.vue'
import Suit from './games/Suit.vue'

// Registry of playable games. Add a new entry here (id + component) to expand;
// the menu and the router both read from this list, and each id is its route.
// `category` (aksi | kata | strategi | puzzle) drives the menu filter chips;
// `duo` marks games with a two-player mode.
export const games = [
  {
    id: 'dino',
    title: 'Dino Jump',
    tagline: 'Leap the cacti. Survive as long as you can.',
    component: DinoGame,
    category: 'aksi',
  },
  {
    id: 'flappy',
    title: 'Flappy',
    tagline: 'Flap through the pipes. Do not touch.',
    component: FlappyBird,
    category: 'aksi',
  },
  {
    id: 'wordlock',
    title: 'Word Lock',
    tagline: 'Lock in letters to crack the word. Solo or two players.',
    component: WordLock,
    category: 'kata',
    duo: true,
  },
  {
    id: 'acakkata',
    title: 'Acak Kata',
    tagline: 'Unscramble the Indonesian word.',
    component: AcakKata,
    category: 'kata',
  },
  {
    id: 'hangman',
    title: 'Tebak Kata',
    tagline: 'Guess the word before the gallows fills.',
    component: Hangman,
    category: 'kata',
  },
  {
    id: 'tictactoe',
    title: 'Tic Tac Toe',
    tagline: 'Endless three-in-a-row. Solo vs CPU or two players.',
    component: TicTacToe,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'tebakwarna',
    title: 'Tebak Warna',
    tagline: 'Crack the secret color code. Solo or two players.',
    component: TebakWarna,
    category: 'puzzle',
    duo: true,
  },
  {
    id: 'connect4',
    title: 'Connect 4',
    tagline: 'Drop discs, line up four. Solo vs CPU or two players.',
    component: ConnectFour,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'ingatan',
    title: 'Ingatan',
    tagline: 'Match every pair. Solo against a limit, or two players.',
    component: Ingatan,
    category: 'puzzle',
    duo: true,
  },
  {
    id: 'armada',
    title: 'Armada',
    tagline: 'Place your fleet, sink theirs. Solo vs CPU or two players.',
    component: Armada,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'tikus',
    title: 'Pukul Tikus',
    tagline: 'Whack moles, dodge bombs. How far can you go?',
    component: PukulTikus,
    category: 'aksi',
  },
  {
    id: 'sudoku',
    title: 'Sudoku',
    tagline: 'Fill the 9×9 so every row, column and box holds 1–9.',
    component: Sudoku,
    category: 'puzzle',
  },
  {
    id: 'breaker',
    title: 'Ball Breaker',
    tagline: 'Bounce the ball, break every brick.',
    component: BallBreaker,
    category: 'aksi',
  },
  {
    id: 'ranjau',
    title: 'Ranjau',
    tagline: 'Clear the field without hitting a mine.',
    component: Minesweeper,
    category: 'puzzle',
  },
  {
    id: 'tetris',
    title: 'Tetris',
    tagline: 'Stack the blocks, clear the lines.',
    component: Tetris,
    category: 'aksi',
  },
  {
    id: 'ular',
    title: 'Ular Tangga',
    tagline: 'Roll the die, ride ladders, dodge snakes. Solo vs CPU or two players.',
    component: UlarTangga,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'carikata',
    title: 'Cari Kata',
    tagline: 'Find the hidden Indonesian words in the grid.',
    component: CariKata,
    category: 'kata',
  },
  {
    id: 'otello',
    title: 'Otello',
    tagline: 'Flip discs to own the board. Solo vs CPU or two players.',
    component: Otello,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'dakon',
    title: 'Dakon',
    tagline: 'Sow seeds, fill your store. Solo vs CPU or two players.',
    component: Dakon,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'dam',
    title: 'Dam',
    tagline: 'Jump and capture on the diagonals. Solo vs CPU or two players.',
    component: Dam,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'gomoku',
    title: 'Lima Sejajar',
    tagline: 'Line up five in a row. Solo vs CPU or two players.',
    component: LimaSejajar,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'gaple',
    title: 'Gaple',
    tagline: 'Match the dominoes, empty your hand. Solo vs CPU or two players.',
    component: Gaple,
    category: 'strategi',
    duo: true,
  },
  {
    id: '2048',
    title: '2048',
    tagline: 'Slide and merge tiles to reach 2048.',
    component: Game2048,
    category: 'puzzle',
  },
  {
    id: 'geser',
    title: 'Geser Angka',
    tagline: 'Slide the tiles to order 1–15.',
    component: GeserAngka,
    category: 'puzzle',
  },
  {
    id: 'lampu',
    title: 'Lampu',
    tagline: 'Tap to toggle. Turn every light off.',
    component: Lampu,
    category: 'puzzle',
  },
  {
    id: 'tirukan',
    title: 'Tirukan',
    tagline: 'Watch the colors, then tap them back in order.',
    component: Tirukan,
    category: 'puzzle',
  },
  {
    id: 'flood',
    title: 'Flood-It',
    tagline: 'Flood the board into one colour before you run out of moves.',
    component: FloodIt,
    category: 'puzzle',
  },
  {
    id: 'snake',
    title: 'Ular Lapar',
    tagline: 'Eat, grow, and don\'t bite your own tail.',
    component: Snake,
    category: 'aksi',
  },
  {
    id: 'permata',
    title: 'Permata',
    tagline: 'Swap gems, match three, chain the cascades.',
    component: Permata,
    category: 'puzzle',
  },
  {
    id: 'menara',
    title: 'Menara',
    tagline: 'Drop each block, stack the tower sky-high.',
    component: Menara,
    category: 'aksi',
  },
  {
    id: 'sokoban',
    title: 'Dorong Kotak',
    tagline: 'Push every crate onto its target. No pulling.',
    component: Sokoban,
    category: 'puzzle',
  },
  {
    id: 'suit',
    title: 'Suit',
    tagline: 'Batu, gunting, kertas. Solo vs CPU or two players.',
    component: Suit,
    category: 'strategi',
    duo: true,
  },
]

export function findGame(id) {
  return games.find((g) => g.id === id) || null
}
