import { defineAsyncComponent } from 'vue'
import Onet from './games/Onet.vue'
import Takuzu from './games/Takuzu.vue'
import DamTiga from './games/DamTiga.vue'
import DinoGame from './games/DinoGame.vue'
import FlappyBird from './games/FlappyBird.vue'
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
import Otello from './games/Otello.vue'
import Dakon from './games/Dakon.vue'
import Dam from './games/Dam.vue'
import LimaSejajar from './games/LimaSejajar.vue'
import Gaple from './games/Gaple.vue'
import Game2048 from './games/Game2048.vue'
import GeserAngka from './games/GeserAngka.vue'
import Lampu from './games/Lampu.vue'
import Tirukan from './games/Tirukan.vue'
import FloodIt from './games/FloodIt.vue'
import Snake from './games/Snake.vue'
import Permata from './games/Permata.vue'
import Menara from './games/Menara.vue'
import Sokoban from './games/Sokoban.vue'
import Suit from './games/Suit.vue'
import MenaraHanoi from './games/MenaraHanoi.vue'
import Macet from './games/Macet.vue'
import Piktogram from './games/Piktogram.vue'
import TitikKotak from './games/TitikKotak.vue'
import Katak from './games/Katak.vue'
import BlokKayu from './games/BlokKayu.vue'
import Pipa from './games/Pipa.vue'
import Lompat from './games/Lompat.vue'
import SortirWarna from './games/SortirWarna.vue'
import Yatzy from './games/Yatzy.vue'
import Shikaku from './games/Shikaku.vue'
import IsiPenuh from './games/IsiPenuh.vue'
import Aliran from './games/Aliran.vue'
import Kakuro from './games/Kakuro.vue'
import Jembatan from './games/Jembatan.vue'
import Solitaire from './games/Solitaire.vue'
import gameIcons from './game-icons.js'

// Small games are bundled with the app; the data-heavy word games are loaded on
// demand so their big dictionaries (kbbi.js, words.js, …) only download when you
// actually open them, not on the first visit.
const lazy = (loader) => defineAsyncComponent(loader)
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
    component: lazy(() => import('./games/WordLock.vue')),
    category: 'kata',
    duo: true,
  },
  {
    id: 'acakkata',
    title: 'Acak Kata',
    tagline: 'Unscramble the Indonesian word.',
    component: lazy(() => import('./games/AcakKata.vue')),
    category: 'kata',
  },
  {
    id: 'hangman',
    title: 'Tebak Kata',
    tagline: 'Guess the word before the gallows fills.',
    component: lazy(() => import('./games/Hangman.vue')),
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
    component: lazy(() => import('./games/CariKata.vue')),
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
  {
    id: 'hanoi',
    title: 'Menara Hanoi',
    tagline: 'Move the whole stack across, one disc at a time.',
    component: MenaraHanoi,
    category: 'puzzle',
  },
  {
    id: 'macet',
    title: 'Macet',
    tagline: 'Slide the cars aside and drive the red one out.',
    component: Macet,
    category: 'puzzle',
  },
  {
    id: 'wordle',
    title: 'Wordle',
    tagline: 'Guess the five-letter Indonesian word in six tries.',
    component: lazy(() => import('./games/Wordle.vue')),
    category: 'kata',
  },
  {
    id: 'piktogram',
    title: 'Piktogram',
    tagline: 'Fill the grid from the number clues to reveal a picture.',
    component: Piktogram,
    category: 'puzzle',
  },
  {
    id: 'titikkotak',
    title: 'Titik & Kotak',
    tagline: 'Claim the most boxes. Solo vs CPU or two players.',
    component: TitikKotak,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'katak',
    title: 'Katak Menyeberang',
    tagline: 'Hop across the traffic and river. Do not get squished.',
    component: Katak,
    category: 'aksi',
  },
  {
    id: 'blokkayu',
    title: 'Blok Kayu',
    tagline: 'Drop blocks onto the grid and clear rows, columns, and boxes.',
    component: BlokKayu,
    category: 'puzzle',
  },
  {
    id: 'pipa',
    title: 'Pipa',
    tagline: 'Rotate the pipes so the water flows to the drain.',
    component: Pipa,
    category: 'puzzle',
  },
  {
    id: 'sandi',
    title: 'Sandi',
    tagline: 'Crack the cipher to reveal an Indonesian proverb.',
    component: lazy(() => import('./games/Sandi.vue')),
    category: 'kata',
  },
  {
    id: 'lompat',
    title: 'Lompat',
    tagline: 'Bounce up the endless platforms. Do not fall.',
    component: Lompat,
    category: 'aksi',
  },
  {
    id: 'teka',
    title: 'Teka-Teki Silang',
    tagline: 'Fill the grid from across and down clues.',
    component: lazy(() => import('./games/TekaSilang.vue')),
    category: 'kata',
  },
  {
    id: 'sortir',
    title: 'Sortir Warna',
    tagline: 'Pour the balls until every tube is a single colour.',
    component: SortirWarna,
    category: 'puzzle',
  },
  {
    id: 'yatzy',
    title: 'Yatzy',
    tagline: 'Roll five dice, chase the scorecard. Solo or two players.',
    component: Yatzy,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'sambung',
    title: 'Sambung Kata',
    tagline: 'Chain words by their last letter. Solo vs CPU or two players.',
    component: lazy(() => import('./games/SambungKata.vue')),
    category: 'kata',
    duo: true,
  },
  {
    id: 'tangga',
    title: 'Tangga Kata',
    tagline: 'Change one letter at a time to climb to the goal word.',
    component: lazy(() => import('./games/TanggaKata.vue')),
    category: 'kata',
  },
  {
    id: 'onet',
    title: 'Onet',
    tagline: 'Clear the board by connecting matching tiles.',
    component: Onet,
    category: 'puzzle',
  },
  {
    id: 'lebah',
    title: 'Kata Lebah',
    tagline: 'Spell as many words as you can from seven letters.',
    component: lazy(() => import('./games/KataLebah.vue')),
    category: 'kata',
  },
  {
    id: 'takuzu',
    title: 'Takuzu',
    tagline: 'Fill the grid with two colours by pure logic.',
    component: Takuzu,
    category: 'puzzle',
  },
  {
    id: 'damtiga',
    title: 'Dam Tiga',
    tagline: 'Form mills to capture pieces. Solo vs CPU or two players.',
    component: DamTiga,
    category: 'strategi',
    duo: true,
  },
  {
    id: 'shikaku',
    title: 'Shikaku',
    tagline: 'Divide the grid into rectangles that match every number.',
    component: Shikaku,
    category: 'puzzle',
  },
  {
    id: 'isipenuh',
    title: 'Isi Penuh',
    tagline: 'Trace one line to fill every cell — cross the marked cells twice.',
    component: IsiPenuh,
    category: 'puzzle',
  },
  {
    id: 'aliran',
    title: 'Aliran',
    tagline: 'Connect the matching dots and fill the whole grid. Endless.',
    component: Aliran,
    category: 'puzzle',
  },
  {
    id: 'kakuro',
    title: 'Kakuro',
    tagline: 'Fill each run with 1–9 so it adds up to the clue, no repeats.',
    component: Kakuro,
    category: 'puzzle',
  },
  {
    id: 'jembatan',
    title: 'Jembatan',
    tagline: 'Link the islands with bridges — match every number, no crossings.',
    component: Jembatan,
    category: 'puzzle',
  },
  {
    id: 'solitaire',
    title: 'Solitaire',
    tagline: 'Klondike patience — build the four suits up from Ace to King.',
    component: Solitaire,
    category: 'strategi',
  },
  {
    id: 'catur',
    title: 'Catur',
    tagline: 'Full chess — play a friend or take White against the CPU.',
    component: lazy(() => import('./games/Catur.vue')),
    category: 'strategi',
    duo: true,
  },
  {
    id: 'skakmat',
    title: 'Skak Mat',
    tagline: 'Chess mate puzzles — White to play and checkmate.',
    component: lazy(() => import('./games/SkakMat.vue')),
    category: 'strategi',
  },
  {
    id: 'mahjong',
    title: 'Mahjong',
    tagline: 'Clear the stack — match free pairs of tiles until none remain.',
    component: lazy(() => import('./games/Mahjong.vue')),
    category: 'puzzle',
  },
  {
    id: 'pagar',
    title: 'Pagar',
    tagline: 'Slitherlink — draw one loop so every number counts its edges.',
    component: lazy(() => import('./games/Pagar.vue')),
    category: 'puzzle',
  },
  {
    id: 'backgammon',
    title: 'Backgammon',
    tagline: 'Race your checkers home and bear off. Solo vs CPU or two players.',
    component: lazy(() => import('./games/Backgammon.vue')),
    category: 'strategi',
    duo: true,
  },
]

// Attach each game's cabinet icon from the central icon file, keyed by id, so
// GameSelect can render <component :is="game.icon" />. Games without one (dino)
// fall back to the running dino sprite.
for (const g of games) g.icon = gameIcons[g.id]

export function findGame(id) {
  return games.find((g) => g.id === id) || null
}
