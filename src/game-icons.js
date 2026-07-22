import { h } from 'vue'
import BirdSprite from './components/BirdSprite.vue'

// Every game's cabinet icon lives here, so GameSelect stays a flat list instead
// of a 50-branch v-if. GameSelect renders one via <component :is="game.icon" />
// (wired up in games.js). Most icons are static SVG/HTML drawn from a markup
// string; Flappy embeds the live BirdSprite so its wing keeps flapping. Shared
// sizing + the handful of HTML-icon styles live in styles.css (global), since
// this markup renders outside GameSelect's scoped styles.
const icon = (cls, markup) => ({
  render: () => h('span', {
    class: ('cabinet__icon ' + cls).trim(),
    'aria-hidden': 'true',
    innerHTML: markup,
  }),
})

const flappy = {
  render: () => h('span', { class: 'cabinet__icon cabinet__flappy', 'aria-hidden': 'true' }, [
    h('i', { class: 'cabinet__pipe cabinet__pipe--top' }),
    h('i', { class: 'cabinet__pipe cabinet__pipe--bot' }),
    h('span', { class: 'cabinet__bird' }, [h(BirdSprite)]),
  ]),
}

export default {
  'flappy': flappy,
  'wordlock': icon('cabinet__tiles', `<i class="t-correct">W</i><i class="t-present">O</i><i class="t-plain">R</i><i class="t-correct">D</i>`),
  'acakkata': icon('cabinet__scramble', `<i>A</i><i>C</i><i>A</i><i>K</i>`),
  'hangman': icon('cabinet__gallows', `    <svg viewBox="0 0 48 46">
      <g fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round">
        <line x1="6" y1="42" x2="26" y2="42" />
        <line x1="12" y1="42" x2="12" y2="6" />
        <line x1="10.5" y1="6" x2="34" y2="6" />
        <line x1="34" y1="6" x2="34" y2="12" stroke-width="2.4" />
      </g>
      <circle cx="34" cy="18" r="5.5" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.6" />
      <line x1="34" y1="23.5" x2="34" y2="34" stroke="var(--ink)" stroke-width="2.6" stroke-linecap="round" />
    </svg>`),
  'tebakwarna': icon('cabinet__warna', `<i style="background: #ff3b3b"></i><i style="background: #ffd23f"></i><i style="background: #43c96b"></i><i style="background: #4aa3ff"></i><i style="background: #7b5be6"></i>`),
  'armada': icon('cabinet__armada', `    <svg viewBox="0 0 46 46">
      <rect x="3" y="3" width="40" height="40" rx="7" fill="#3f78e0" stroke="var(--ink)" stroke-width="2.6" />
      <rect x="9" y="26" width="28" height="9" rx="3" fill="var(--grape)" stroke="var(--ink)" stroke-width="2" />
      <circle cx="15" cy="14" r="4.6" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.8" />
      <circle cx="31" cy="14" r="2.4" fill="var(--cream)" />
    </svg>`),
  'ular': icon('cabinet__ular', `    <svg viewBox="0 0 46 46">
      <rect x="3" y="3" width="40" height="40" rx="7" fill="#ffe7b0" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round">
        <line x1="12" y1="40" x2="18" y2="7" />
        <line x1="19" y1="40" x2="25" y2="7" />
      </g>
      <g stroke="#d98a3d" stroke-width="1.9" stroke-linecap="round">
        <line x1="12" y1="40" x2="18" y2="7" />
        <line x1="19" y1="40" x2="25" y2="7" />
      </g>
      <g stroke="#e8a24e" stroke-width="1.5" stroke-linecap="round">
        <line x1="14" y1="32" x2="20.5" y2="32" />
        <line x1="15.3" y1="23" x2="21.8" y2="23" />
        <line x1="16.6" y1="14" x2="23.1" y2="14" />
      </g>
      <path d="M34 8 q-8 6 0 12 q8 6 0 12" fill="none" stroke="var(--ink)" stroke-width="4.6" stroke-linecap="round" />
      <path d="M34 8 q-8 6 0 12 q8 6 0 12" fill="none" stroke="var(--berry)" stroke-width="3" stroke-linecap="round" />
      <circle cx="34" cy="8" r="3.2" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.4" />
      <circle cx="32.8" cy="7.4" r="0.7" fill="var(--ink)" />
      <circle cx="35.2" cy="7.4" r="0.7" fill="var(--ink)" />
    </svg>`),
  'ingatan': icon('cabinet__mem', `    <svg viewBox="0 0 46 46">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="var(--grape)" stroke="var(--ink)" stroke-width="2.4" />
      <rect x="25" y="3" width="18" height="18" rx="4" fill="var(--grape)" stroke="var(--ink)" stroke-width="2.4" />
      <rect x="3" y="25" width="18" height="18" rx="4" fill="var(--grape)" stroke="var(--ink)" stroke-width="2.4" />
      <rect x="25" y="25" width="18" height="18" rx="4" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.4" />
      <circle cx="34" cy="34" r="4.6" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.8" />
    </svg>`),
  'connect4': icon('cabinet__c4', `    <svg viewBox="0 0 48 44">
      <rect x="4" y="6" width="40" height="34" rx="6" fill="#3f78e0" stroke="var(--ink)" stroke-width="2.6" />
      <circle cx="14" cy="16" r="4.2" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx="24" cy="16" r="4.2" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx="34" cy="16" r="4.2" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx="14" cy="30" r="4.2" fill="var(--sun)" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx="24" cy="30" r="4.2" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx="34" cy="30" r="4.2" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.6" />
    </svg>`),
  'tictactoe': icon('cabinet__ttt', `    <svg viewBox="0 0 48 48">
      <g stroke="var(--ink)" stroke-width="2.6" stroke-linecap="round">
        <line x1="17" y1="5" x2="17" y2="43" />
        <line x1="31" y1="5" x2="31" y2="43" />
        <line x1="5" y1="17" x2="43" y2="17" />
        <line x1="5" y1="31" x2="43" y2="31" />
      </g>
      <g stroke="var(--berry)" stroke-width="3.4" stroke-linecap="round">
        <line x1="7" y1="7" x2="15" y2="15" />
        <line x1="15" y1="7" x2="7" y2="15" />
      </g>
      <circle cx="24" cy="24" r="5" fill="none" stroke="var(--aqua-deep)" stroke-width="3.4" />
      <g stroke="var(--berry)" stroke-width="3.4" stroke-linecap="round">
        <line x1="33" y1="33" x2="41" y2="41" />
        <line x1="41" y1="33" x2="33" y2="41" />
      </g>
    </svg>`),
  'tikus': icon('cabinet__tikus', `    <svg viewBox="0 0 46 46">
      <ellipse cx="23" cy="35" rx="18" ry="7.5" fill="var(--ink)" />
      <ellipse cx="23" cy="22" rx="13" ry="12" fill="#9b5b3a" stroke="var(--ink)" stroke-width="2.4" />
      <ellipse cx="23" cy="26" rx="7" ry="5" fill="#d9a679" stroke="var(--ink)" stroke-width="1.8" />
      <circle cx="18" cy="18" r="3.4" fill="#fff" stroke="var(--ink)" stroke-width="1.5" />
      <circle cx="28" cy="18" r="3.4" fill="#fff" stroke="var(--ink)" stroke-width="1.5" />
      <circle cx="18.4" cy="18.8" r="1.5" fill="var(--ink)" />
      <circle cx="27.6" cy="18.8" r="1.5" fill="var(--ink)" />
      <ellipse cx="23" cy="24" rx="2.2" ry="1.7" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.1" />
    </svg>`),
  'sudoku': icon('cabinet__sudoku', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--ink)" stroke-width="2.2">
        <line x1="17" y1="5" x2="17" y2="41" />
        <line x1="29" y1="5" x2="29" y2="41" />
        <line x1="5" y1="17" x2="41" y2="17" />
        <line x1="5" y1="29" x2="41" y2="29" />
      </g>
      <text x="8.5" y="15" font-family="monospace" font-size="11" font-weight="700" fill="var(--aqua-deep)">5</text>
      <text x="20.5" y="27" font-family="monospace" font-size="11" font-weight="700" fill="var(--berry)">3</text>
      <text x="32.5" y="39" font-family="monospace" font-size="11" font-weight="700" fill="var(--aqua-deep)">7</text>
    </svg>`),
  'breaker': icon('cabinet__breaker', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="1.8">
        <rect x="5" y="6" width="10" height="6" rx="1.5" fill="var(--berry)" />
        <rect x="17" y="6" width="10" height="6" rx="1.5" fill="var(--sun)" />
        <rect x="29" y="6" width="10" height="6" rx="1.5" fill="var(--aqua)" />
        <rect x="11" y="14" width="10" height="6" rx="1.5" fill="var(--grape)" />
        <rect x="23" y="14" width="10" height="6" rx="1.5" fill="var(--sun-core)" />
      </g>
      <circle cx="24" cy="30" r="4" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
      <rect x="14" y="37" width="18" height="5" rx="2.5" fill="var(--grape)" stroke="var(--ink)" stroke-width="2" />
    </svg>`),
  'ranjau': icon('cabinet__ranjau', `    <svg viewBox="0 0 46 46">
      <rect x="6" y="6" width="34" height="34" rx="6" fill="var(--paper-lit)" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round">
        <line x1="23" y1="12" x2="23" y2="34" />
        <line x1="12" y1="23" x2="34" y2="23" />
        <line x1="15.5" y1="15.5" x2="30.5" y2="30.5" />
        <line x1="30.5" y1="15.5" x2="15.5" y2="30.5" />
      </g>
      <circle cx="23" cy="23" r="8" fill="var(--ink)" />
      <circle cx="20" cy="20" r="2" fill="var(--cream)" />
    </svg>`),
  'tetris': icon('cabinet__tetris', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.2">
        <rect x="8" y="13" width="10" height="10" rx="1.5" fill="var(--grape)" />
        <rect x="18" y="13" width="10" height="10" rx="1.5" fill="var(--grape)" />
        <rect x="28" y="13" width="10" height="10" rx="1.5" fill="var(--grape)" />
        <rect x="18" y="23" width="10" height="10" rx="1.5" fill="var(--sun)" />
      </g>
    </svg>`),
  'carikata': icon('cabinet__cari', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="6" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <text x="9" y="17" font-family="monospace" font-size="9" font-weight="700" fill="var(--muted)">K A T</text>
      <text x="9" y="29" font-family="monospace" font-size="9" font-weight="700" fill="var(--aqua-deep)">C A R</text>
      <circle cx="30" cy="30" r="7" fill="none" stroke="var(--ink)" stroke-width="2.6" />
      <line x1="35" y1="35" x2="41" y2="41" stroke="var(--ink)" stroke-width="3.2" stroke-linecap="round" />
    </svg>`),
  'otello': icon('cabinet__otello', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="6" fill="#4f9d54" stroke="var(--ink)" stroke-width="2.6" />
      <circle cx="16" cy="16" r="6.5" fill="var(--ink)" />
      <circle cx="30" cy="16" r="6.5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
      <circle cx="16" cy="30" r="6.5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
      <circle cx="30" cy="30" r="6.5" fill="var(--ink)" />
    </svg>`),
  'dakon': icon('cabinet__dakon', `    <svg viewBox="0 0 46 46">
      <rect x="3" y="12" width="40" height="22" rx="11" fill="#c98a4e" stroke="var(--ink)" stroke-width="2.6" />
      <circle cx="15" cy="23" r="5.2" fill="#7c4e26" stroke="var(--ink)" stroke-width="1.8" />
      <circle cx="26" cy="23" r="5.2" fill="#7c4e26" stroke="var(--ink)" stroke-width="1.8" />
      <ellipse cx="37" cy="23" rx="4" ry="8" fill="#7c4e26" stroke="var(--ink)" stroke-width="1.8" />
      <circle cx="13.5" cy="22" r="1.5" fill="var(--sun)" />
      <circle cx="16.5" cy="24.5" r="1.5" fill="var(--berry)" />
      <circle cx="24.5" cy="22" r="1.5" fill="var(--aqua)" />
      <circle cx="27.5" cy="24.5" r="1.5" fill="var(--sun)" />
    </svg>`),
  'dam': icon('cabinet__dam', `    <svg viewBox="0 0 46 46">
      <defs>
        <clipPath id="dam-board"><rect x="3" y="3" width="40" height="40" rx="7" /></clipPath>
      </defs>
      <g clip-path="url(#dam-board)">
        <rect x="3" y="3" width="40" height="40" fill="#ffe9c9" />
        <g fill="#c98a4e">
          <rect x="3" y="3" width="10" height="10" />
          <rect x="23" y="3" width="10" height="10" />
          <rect x="13" y="13" width="10" height="10" />
          <rect x="33" y="13" width="10" height="10" />
          <rect x="3" y="23" width="10" height="10" />
          <rect x="23" y="23" width="10" height="10" />
          <rect x="13" y="33" width="10" height="10" />
          <rect x="33" y="33" width="10" height="10" />
        </g>
      </g>
      <rect x="3" y="3" width="40" height="40" rx="7" fill="none" stroke="var(--ink)" stroke-width="2.6" />
      <circle cx="14" cy="32" r="6.3" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
      <circle cx="30" cy="16" r="6.3" fill="var(--berry)" stroke="var(--ink)" stroke-width="2" />
      <path d="M26 17 L26 13.4 L28.3 15 L30 11.8 L31.7 15 L34 13.4 L34 17 Z"
        fill="var(--sun)" stroke="var(--ink)" stroke-width="1.3" stroke-linejoin="round" />
    </svg>`),
  'gomoku': icon('cabinet__gomoku', `    <svg viewBox="0 0 46 46">
      <rect x="3" y="3" width="40" height="40" rx="6" fill="#e3b579" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--ink)" stroke-width="1.6" opacity="0.65">
        <line x1="15" y1="6" x2="15" y2="40" />
        <line x1="23" y1="6" x2="23" y2="40" />
        <line x1="31" y1="6" x2="31" y2="40" />
        <line x1="6" y1="15" x2="40" y2="15" />
        <line x1="6" y1="23" x2="40" y2="23" />
        <line x1="6" y1="31" x2="40" y2="31" />
      </g>
      <circle cx="15" cy="15" r="4.4" fill="#241030" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx="23" cy="23" r="4.4" fill="#241030" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx="31" cy="31" r="4.4" fill="#241030" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx="31" cy="15" r="4.4" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
      <circle cx="15" cy="31" r="4.4" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
    </svg>`),
  '2048': icon('cabinet__2048', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="5" width="38" height="15" rx="4" fill="var(--berry)" stroke="var(--ink)" stroke-width="2.4" />
      <text x="23" y="16" text-anchor="middle" font-family="monospace" font-size="9.5" font-weight="700" fill="var(--cream)">2048</text>
      <rect x="5" y="25" width="11" height="16" rx="3" fill="var(--paper-lit)" stroke="var(--ink)" stroke-width="2.2" />
      <rect x="18" y="25" width="11" height="16" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.2" />
      <rect x="31" y="25" width="11" height="16" rx="3" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2.2" />
      <text x="10.5" y="37" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="var(--ink)">2</text>
      <text x="23.5" y="37" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="var(--ink)">4</text>
      <text x="36.5" y="37" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="var(--ink)">8</text>
    </svg>`),
  'geser': icon('cabinet__geser', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="6" fill="var(--paper-lit)" stroke="var(--ink)" stroke-width="2.6" />
      <rect x="25" y="25" width="14" height="14" rx="3" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="3 2.5" opacity="0.55" />
      <g font-family="monospace" font-weight="700" font-size="10" text-anchor="middle">
        <rect x="7" y="7" width="14" height="14" rx="3" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
        <text x="14" y="18.5" fill="var(--ink)">1</text>
        <rect x="25" y="7" width="14" height="14" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="2" />
        <text x="32" y="18.5" fill="var(--ink)">2</text>
        <rect x="7" y="25" width="14" height="14" rx="3" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2" />
        <text x="14" y="36.5" fill="var(--ink)">3</text>
      </g>
    </svg>`),
  'gaple': icon('cabinet__gaple', `    <svg viewBox="0 0 46 46">
      <g transform="rotate(-16 21 16)">
        <rect x="5" y="8" width="28" height="14" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.6" />
        <line x1="19" y1="8" x2="19" y2="22" stroke="var(--ink)" stroke-width="2" />
        <circle cx="12" cy="15" r="1.7" fill="var(--ink)" />
        <circle cx="24" cy="12" r="1.7" fill="var(--ink)" />
        <circle cx="28" cy="18" r="1.7" fill="var(--ink)" />
      </g>
      <g transform="rotate(11 25 30)">
        <rect x="11" y="23" width="31" height="15" rx="3" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
        <line x1="26.5" y1="23" x2="26.5" y2="38" stroke="var(--ink)" stroke-width="2" />
        <circle cx="15" cy="27" r="1.8" fill="var(--berry)" />
        <circle cx="18.7" cy="30.5" r="1.8" fill="var(--berry)" />
        <circle cx="22.4" cy="34" r="1.8" fill="var(--berry)" />
        <circle cx="31" cy="27" r="1.8" fill="var(--aqua-deep)" />
        <circle cx="37.5" cy="34" r="1.8" fill="var(--aqua-deep)" />
      </g>
    </svg>`),
  'lampu': icon('cabinet__lampu', `    <svg viewBox="0 0 46 46">
      <rect x="5" y="5" width="36" height="36" rx="6" fill="#241033" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--ink)" stroke-width="1.8">
        <rect x="9" y="9" width="12" height="12" rx="3" fill="var(--sun)" />
        <rect x="25" y="9" width="12" height="12" rx="3" fill="#402457" />
        <rect x="9" y="25" width="12" height="12" rx="3" fill="#402457" />
        <rect x="25" y="25" width="12" height="12" rx="3" fill="var(--sun-core)" />
      </g>
      <circle cx="15" cy="15" r="2.6" fill="#fff5dc" />
      <circle cx="31" cy="31" r="2.6" fill="#fff5dc" />
    </svg>`),
  'tirukan': icon('cabinet__tirukan', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.6">
        <rect x="5" y="5" width="16.5" height="16.5" rx="4" fill="var(--aqua)" opacity="0.5" />
        <rect x="24.5" y="5" width="16.5" height="16.5" rx="4" fill="var(--berry)" />
        <rect x="5" y="24.5" width="16.5" height="16.5" rx="4" fill="var(--sun)" opacity="0.5" />
        <rect x="24.5" y="24.5" width="16.5" height="16.5" rx="4" fill="var(--grape)" opacity="0.5" />
      </g>
      <circle cx="32.75" cy="13.25" r="3.4" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
    </svg>`),
  'flood': icon('cabinet__flood', `    <svg viewBox="0 0 46 46">
      <rect x="3" y="3" width="40" height="40" rx="7" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--ink)" stroke-width="1.1">
        <rect x="9" y="9" width="6.5" height="6.5" rx="1.6" fill="var(--aqua)" />
        <rect x="16.6" y="9" width="6.5" height="6.5" rx="1.6" fill="var(--aqua)" />
        <rect x="24.2" y="9" width="6.5" height="6.5" rx="1.6" fill="var(--berry)" />
        <rect x="31.8" y="9" width="6.5" height="6.5" rx="1.6" fill="var(--sun)" />
        <rect x="9" y="16.6" width="6.5" height="6.5" rx="1.6" fill="var(--aqua)" />
        <rect x="16.6" y="16.6" width="6.5" height="6.5" rx="1.6" fill="var(--aqua)" />
        <rect x="24.2" y="16.6" width="6.5" height="6.5" rx="1.6" fill="var(--grape)" />
        <rect x="31.8" y="16.6" width="6.5" height="6.5" rx="1.6" fill="var(--sun-core)" />
        <rect x="9" y="24.2" width="6.5" height="6.5" rx="1.6" fill="var(--sun-core)" />
        <rect x="16.6" y="24.2" width="6.5" height="6.5" rx="1.6" fill="var(--grape)" />
        <rect x="24.2" y="24.2" width="6.5" height="6.5" rx="1.6" fill="var(--sun)" />
        <rect x="31.8" y="24.2" width="6.5" height="6.5" rx="1.6" fill="var(--aqua-deep)" />
        <rect x="9" y="31.8" width="6.5" height="6.5" rx="1.6" fill="var(--berry)" />
        <rect x="16.6" y="31.8" width="6.5" height="6.5" rx="1.6" fill="var(--sun)" />
        <rect x="24.2" y="31.8" width="6.5" height="6.5" rx="1.6" fill="var(--aqua-deep)" />
        <rect x="31.8" y="31.8" width="6.5" height="6.5" rx="1.6" fill="var(--grape)" />
      </g>
    </svg>`),
  'snake': icon('cabinet__snake', `    <svg viewBox="0 0 46 46">
      <path d="M22 41 C8 41 7 21 23 21 C34 21 34 34 23 34 C16 34 16 26 22 26"
        fill="none" stroke="var(--ink)" stroke-width="7.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M22 41 C8 41 7 21 23 21 C34 21 34 34 23 34 C16 34 16 26 22 26"
        fill="none" stroke="var(--aqua)" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="22" cy="26" r="4.4" fill="var(--aqua-deep)" stroke="var(--ink)" stroke-width="2" />
      <circle cx="22.6" cy="25" r="1" fill="var(--ink)" />
      <circle cx="34" cy="11" r="3.6" fill="var(--sun)" stroke="var(--ink)" stroke-width="2" />
      <path d="M34 7.4 q2 -2 3.4 0" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round" />
    </svg>`),
  'permata': icon('cabinet__permata', `    <svg viewBox="0 0 46 46">
      <rect x="3" y="3" width="40" height="40" rx="7" fill="#efe4ff" stroke="var(--ink)" stroke-width="2.6" />
      <circle cx="14" cy="14" r="6" fill="var(--berry)" stroke="var(--ink)" stroke-width="2.2" />
      <rect x="24.5" y="8.5" width="11" height="11" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.2" />
      <path d="M32 24 L38 30 L32 36 L26 30 Z" fill="var(--grape)" stroke="var(--ink)" stroke-width="2.2" stroke-linejoin="round" />
      <circle cx="11" cy="31" r="6" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2.2" />
      <rect x="5" y="38" width="10" height="4.5" rx="2.2" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2" />
      <rect x="17" y="38" width="10" height="4.5" rx="2.2" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2" />
      <rect x="29" y="38" width="10" height="4.5" rx="2.2" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2" />
    </svg>`),
  'menara': icon('cabinet__menara', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.2">
        <rect x="9" y="30" width="28" height="9" rx="2.5" fill="var(--aqua)" />
        <rect x="12" y="21" width="24" height="9" rx="2.5" fill="var(--berry)" />
        <rect x="16" y="12" width="19" height="9" rx="2.5" fill="var(--sun)" />
        <rect x="20" y="4" width="14" height="8" rx="2.5" fill="var(--grape)" />
      </g>
    </svg>`),
  'sokoban': icon('cabinet__sokoban', `    <svg viewBox="0 0 48 48">
      <circle cx="38" cy="24" r="7.5" fill="none" stroke="var(--aqua-deep)" stroke-width="3.5" />
      <rect x="5" y="14" width="19" height="19" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="3" />
      <rect x="10.5" y="19.5" width="8" height="8" rx="1.5" fill="none" stroke="var(--ink)" stroke-width="2" opacity="0.35" />
      <path d="M26 24 H31.5 M29 21.5 L31.8 24 L29 26.5" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`),
  'suit': icon('cabinet__suit', `<i class="s-batu">B</i><i class="s-kertas">K</i><i class="s-gunting">G</i>`),
  'hanoi': icon('cabinet__hanoi', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round">
        <rect x="4" y="36" width="38" height="6" rx="2.6" fill="var(--aqua-deep)" />
        <rect x="10" y="14" width="3" height="23" rx="1.5" fill="#b79a63" />
        <rect x="21.5" y="14" width="3" height="23" rx="1.5" fill="#b79a63" />
        <rect x="33" y="14" width="3" height="23" rx="1.5" fill="#b79a63" />
        <rect x="2" y="30" width="19" height="6" rx="2.4" fill="var(--berry)" />
        <rect x="4" y="24" width="15" height="6" rx="2.4" fill="var(--sun)" />
        <rect x="6" y="18" width="11" height="6" rx="2.4" fill="var(--aqua)" />
      </g>
    </svg>`),
  'macet': icon('cabinet__macet', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="34" height="38" rx="6" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--ink)" stroke-width="2">
        <rect x="30" y="8" width="7" height="16" rx="2.6" fill="var(--aqua)" />
        <rect x="9" y="27" width="7" height="12" rx="2.6" fill="var(--grape)" />
        <rect x="20" y="27" width="12" height="7" rx="2.6" fill="var(--sun)" />
        <rect x="8" y="19" width="16" height="7.5" rx="2.6" fill="var(--berry)" />
      </g>
      <path d="M39 22.7 L44 22.7 M41.6 20 L44 22.7 L41.6 25.4" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`),
  'wordle': icon('cabinet__wordle', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.6">
        <rect x="2" y="15" width="13.6" height="16" rx="3" fill="#43c96b" />
        <rect x="16.2" y="15" width="13.6" height="16" rx="3" fill="var(--sun)" />
        <rect x="30.4" y="15" width="13.6" height="16" rx="3" fill="var(--absent)" />
      </g>
      <g font-family="monospace" font-weight="700" font-size="12" text-anchor="middle" fill="var(--ink)">
        <text x="8.8" y="27.5">K</text>
        <text x="23" y="27.5">A</text>
        <text x="37.2" y="27.5">T</text>
      </g>
    </svg>`),
  'piktogram': icon('cabinet__piktogram', `    <svg viewBox="0 0 46 46">
      <rect x="13" y="13" width="30" height="30" rx="2.5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.4" />
      <g fill="var(--berry)">
        <rect x="19" y="13" width="6" height="6" />
        <rect x="31" y="13" width="6" height="6" />
        <rect x="13" y="19" width="30" height="6" />
        <rect x="13" y="25" width="30" height="6" />
        <rect x="19" y="31" width="18" height="6" />
        <rect x="25" y="37" width="6" height="6" />
      </g>
      <g font-family="monospace" font-size="5.5" fill="var(--muted)" text-anchor="middle">
        <text x="28" y="10.5">4</text>
        <text x="8" y="23">5</text>
        <text x="8" y="35">3</text>
      </g>
    </svg>`),
  'titikkotak': icon('cabinet__titikkotak', `    <svg viewBox="0 0 46 46">
      <rect x="9" y="9" width="14" height="14" rx="1.5" fill="var(--berry)" opacity="0.45" />
      <g stroke-width="3" stroke-linecap="round" fill="none">
        <path d="M9 9 H23 M9 9 V23 M23 9 V23 M9 23 H23" stroke="var(--berry)" />
        <path d="M23 37 H37 M37 23 V37" stroke="var(--aqua-deep)" />
      </g>
      <g fill="var(--ink)">
        <circle cx="9" cy="9" r="2.6" /><circle cx="23" cy="9" r="2.6" /><circle cx="37" cy="9" r="2.6" />
        <circle cx="9" cy="23" r="2.6" /><circle cx="23" cy="23" r="2.6" /><circle cx="37" cy="23" r="2.6" />
        <circle cx="9" cy="37" r="2.6" /><circle cx="23" cy="37" r="2.6" /><circle cx="37" cy="37" r="2.6" />
      </g>
    </svg>`),
  'katak': icon('cabinet__katak', `    <svg viewBox="0 0 46 46">
      <rect x="2" y="4" width="42" height="8" rx="2" fill="#bfe3ff" stroke="var(--ink)" stroke-width="2.2" />
      <rect x="2" y="34" width="42" height="9" rx="2" fill="#7a6f86" stroke="var(--ink)" stroke-width="2.2" />
      <line x1="6" y1="38.5" x2="40" y2="38.5" stroke="var(--sun)" stroke-width="2" stroke-dasharray="4 3.5" />
      <g stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round">
        <ellipse cx="23" cy="24" rx="11" ry="8.5" fill="var(--aqua)" />
        <circle cx="17.5" cy="17" r="4" fill="var(--aqua)" />
        <circle cx="28.5" cy="17" r="4" fill="var(--aqua)" />
      </g>
      <circle cx="17.5" cy="16.5" r="1.6" fill="var(--ink)" />
      <circle cx="28.5" cy="16.5" r="1.6" fill="var(--ink)" />
      <path d="M13 28 q-3 3 -1 6 M33 28 q3 3 1 6" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" />
    </svg>`),
  'blokkayu': icon('cabinet__blokkayu', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--ink)" stroke-width="1" opacity="0.25">
        <line x1="16.7" y1="4" x2="16.7" y2="42" />
        <line x1="29.3" y1="4" x2="29.3" y2="42" />
        <line x1="4" y1="16.7" x2="42" y2="16.7" />
        <line x1="4" y1="29.3" x2="42" y2="29.3" />
      </g>
      <g fill="#c98b3a" stroke="var(--ink)" stroke-width="1.6">
        <rect x="6" y="6" width="9.2" height="9.2" rx="2" />
        <rect x="6" y="18.5" width="9.2" height="9.2" rx="2" />
        <rect x="18.5" y="18.5" width="9.2" height="9.2" rx="2" />
        <rect x="31" y="31" width="9.2" height="9.2" rx="2" />
      </g>
    </svg>`),
  'pipa': icon('cabinet__pipa', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="6" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 10 V23 H33 V36" stroke="var(--ink)" stroke-width="7" />
        <path d="M13 10 V23 H33 V36" stroke="var(--aqua)" stroke-width="3.4" />
      </g>
      <circle cx="13" cy="10" r="3.4" fill="var(--aqua-deep)" stroke="var(--ink)" stroke-width="2" />
      <circle cx="33" cy="36" r="3.8" fill="var(--sun)" stroke="var(--ink)" stroke-width="2" />
      <circle cx="33" cy="36" r="1.5" fill="var(--ink)" />
    </svg>`),
  'sandi': icon('cabinet__sandi', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.4">
        <rect x="3" y="14" width="12.5" height="16" rx="2.5" fill="var(--cream)" />
        <rect x="16.75" y="14" width="12.5" height="16" rx="2.5" fill="var(--sun)" />
        <rect x="30.5" y="14" width="12.5" height="16" rx="2.5" fill="var(--cream)" />
      </g>
      <g font-family="monospace" font-weight="700" text-anchor="middle" fill="var(--ink)" font-size="11">
        <text x="9.25" y="27">S</text>
        <text x="23" y="27">?</text>
        <text x="36.75" y="27">N</text>
      </g>
      <g font-family="monospace" text-anchor="middle" fill="var(--muted)" font-size="6.5">
        <text x="9.25" y="11">X</text>
        <text x="23" y="11">Q</text>
        <text x="36.75" y="11">M</text>
      </g>
    </svg>`),
  'lompat': icon('cabinet__lompat', `    <svg viewBox="0 0 46 46">
      <g fill="#8fd694" stroke="var(--ink)" stroke-width="2.2">
        <rect x="5" y="35" width="16" height="6" rx="3" />
        <rect x="26" y="27" width="15" height="6" rx="3" />
        <rect x="7" y="17" width="14" height="6" rx="3" />
      </g>
      <g>
        <circle cx="31" cy="16" r="7" fill="var(--berry)" stroke="var(--ink)" stroke-width="2.4" />
        <circle cx="28.6" cy="14.6" r="1.5" fill="var(--ink)" />
        <circle cx="33.4" cy="14.6" r="1.5" fill="var(--ink)" />
      </g>
    </svg>`),
  'teka': icon('cabinet__teka', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="6" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--ink)" stroke-width="1.6">
        <g fill="var(--ink)">
          <rect x="7" y="7" width="8" height="8" />
          <rect x="23" y="7" width="8" height="8" />
          <rect x="31" y="7" width="8" height="8" />
          <rect x="7" y="23" width="8" height="8" />
          <rect x="23" y="23" width="8" height="8" />
          <rect x="31" y="23" width="8" height="8" />
          <rect x="7" y="31" width="8" height="8" />
          <rect x="23" y="31" width="8" height="8" />
          <rect x="31" y="31" width="8" height="8" />
        </g>
        <g fill="var(--sun)">
          <rect x="15" y="7" width="8" height="8" />
          <rect x="15" y="23" width="8" height="8" />
          <rect x="15" y="31" width="8" height="8" />
        </g>
        <g fill="var(--cream)">
          <rect x="7" y="15" width="8" height="8" />
          <rect x="23" y="15" width="8" height="8" />
          <rect x="31" y="15" width="8" height="8" />
        </g>
        <rect x="15" y="15" width="8" height="8" fill="var(--aqua)" />
      </g>
    </svg>`),
  'sortir': icon('cabinet__sortir', `    <svg viewBox="0 0 46 46">
      <g fill="var(--cream)" stroke="var(--ink)" stroke-width="2.4">
        <path d="M9 7 V29 Q9 34 14 34 Q19 34 19 29 V7" />
        <path d="M27 7 V29 Q27 34 32 34 Q37 34 37 29 V7" />
      </g>
      <g stroke="var(--ink)" stroke-width="1.3">
        <circle cx="14" cy="30" r="4" fill="#e64a3b" />
        <circle cx="14" cy="22" r="4" fill="#e64a3b" />
        <circle cx="32" cy="30" r="4" fill="#4a90e2" />
        <circle cx="32" cy="22" r="4" fill="#ffd23f" />
        <circle cx="32" cy="14" r="4" fill="#43c96b" />
      </g>
    </svg>`),
  'yatzy': icon('cabinet__yatzy', `    <svg viewBox="0 0 46 46">
      <rect x="22" y="6" width="17" height="17" rx="4" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.2" />
      <g fill="var(--ink)">
        <circle cx="27" cy="11" r="1.6" />
        <circle cx="34" cy="18" r="1.6" />
      </g>
      <rect x="7" y="20" width="20" height="20" rx="5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.4" />
      <g fill="var(--ink)">
        <circle cx="12.5" cy="25.5" r="1.9" />
        <circle cx="21.5" cy="25.5" r="1.9" />
        <circle cx="17" cy="30" r="1.9" />
        <circle cx="12.5" cy="34.5" r="1.9" />
        <circle cx="21.5" cy="34.5" r="1.9" />
      </g>
    </svg>`),
  'sambung': icon('cabinet__sambung', `    <svg viewBox="0 0 46 46">
      <rect x="6" y="16" width="21" height="14" rx="7" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.6" />
      <rect x="19" y="16" width="21" height="14" rx="7" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2.6" />
    </svg>`),
  'tangga': icon('cabinet__tangga', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.4">
        <rect x="5" y="28" width="13" height="13" rx="3.5" fill="var(--sun)" />
        <rect x="16.5" y="19" width="13" height="13" rx="3.5" fill="var(--cream)" />
        <rect x="28" y="10" width="13" height="13" rx="3.5" fill="var(--aqua)" />
      </g>
    </svg>`),
  'onet': icon('cabinet__onet', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.4">
        <rect x="5" y="7" width="15" height="15" rx="4" fill="var(--sun)" />
        <rect x="26" y="24" width="15" height="15" rx="4" fill="var(--aqua)" />
      </g>
      <path
        d="M12.5 22 V33 H33.5 V24"
        fill="none"
        stroke="var(--ink)"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray="3 3"
      />
      <circle cx="12.5" cy="14.5" r="3.4" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.8" />
      <circle cx="33.5" cy="31.5" r="3.4" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.8" />
    </svg>`),
  'lebah': icon('cabinet__lebah', `    <svg viewBox="0 0 46 46">
      <polygon
        points="30,7 39.53,12.5 39.53,23.5 30,29 20.47,23.5 20.47,12.5"
        fill="var(--aqua)"
        stroke="var(--ink)"
        stroke-width="2.4"
      />
      <polygon
        points="18,15 27.53,20.5 27.53,31.5 18,37 8.47,31.5 8.47,20.5"
        fill="var(--sun)"
        stroke="var(--ink)"
        stroke-width="2.4"
      />
    </svg>`),
  'takuzu': icon('cabinet__takuzu', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2">
        <rect x="6" y="6" width="11" height="11" rx="2.5" fill="var(--sun)" />
        <rect x="18" y="6" width="11" height="11" rx="2.5" fill="var(--aqua)" />
        <rect x="30" y="6" width="11" height="11" rx="2.5" fill="var(--sun)" />
        <rect x="6" y="18" width="11" height="11" rx="2.5" fill="var(--aqua)" />
        <rect x="18" y="18" width="11" height="11" rx="2.5" fill="var(--sun)" />
        <rect x="30" y="18" width="11" height="11" rx="2.5" fill="var(--aqua)" />
        <rect x="6" y="30" width="11" height="11" rx="2.5" fill="var(--sun)" />
        <rect x="18" y="30" width="11" height="11" rx="2.5" fill="var(--aqua)" />
        <rect x="30" y="30" width="11" height="11" rx="2.5" fill="var(--aqua)" />
      </g>
    </svg>`),
  'damtiga': icon('cabinet__damtiga', `    <svg viewBox="0 0 46 46">
      <g fill="none" stroke="var(--ink)" stroke-width="2">
        <rect x="6" y="6" width="34" height="34" rx="1.5" />
        <rect x="13" y="13" width="20" height="20" rx="1.5" />
        <rect x="20" y="20" width="6" height="6" rx="1" />
        <path d="M23 6 V20 M23 26 V40 M6 23 H20 M26 23 H40" />
      </g>
      <g stroke="var(--ink)" stroke-width="1.6">
        <circle cx="6" cy="6" r="3.6" fill="var(--sun)" />
        <circle cx="40" cy="40" r="3.6" fill="var(--aqua)" />
        <circle cx="23" cy="13" r="3.6" fill="var(--sun)" />
        <circle cx="13" cy="23" r="3.6" fill="var(--aqua)" />
      </g>
    </svg>`),
  'shikaku': icon('cabinet__shikaku', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2">
        <rect x="6" y="6" width="15" height="34" rx="2" fill="var(--aqua)" />
        <rect x="21" y="6" width="19" height="15" rx="2" fill="var(--sun)" />
        <rect x="21" y="21" width="19" height="19" rx="2" fill="var(--cream)" />
      </g>
      <g fill="var(--ink)">
        <circle cx="13.5" cy="23" r="1.8" />
        <circle cx="30.5" cy="13.5" r="1.8" />
        <circle cx="30.5" cy="30.5" r="1.8" />
      </g>
    </svg>`),
  'isipenuh': icon('cabinet__isipenuh', `    <svg viewBox="0 0 46 46">
      <rect x="6" y="6" width="34" height="34" rx="4" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
      <rect x="28" y="7.5" width="10.5" height="10.5" rx="2" fill="var(--sun)" />
      <polyline
        points="13,13 33,13 33,23 13,23 13,33 33,33"
        fill="none"
        stroke="var(--aqua-deep)"
        stroke-width="6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="33" cy="33" r="3.6" fill="var(--sun)" stroke="var(--ink)" stroke-width="1.6" />
    </svg>`),
  'aliran': icon('cabinet__aliran', `    <svg viewBox="0 0 46 46">
      <rect x="6" y="6" width="34" height="34" rx="4" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
      <polyline points="13,13 13,27 33,27 33,13" fill="none" stroke="var(--aqua-deep)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points="13,33 33,33" fill="none" stroke="var(--sun)" stroke-width="5" stroke-linecap="round" />
      <circle cx="13" cy="13" r="3.6" fill="var(--aqua-deep)" stroke="var(--ink)" stroke-width="1.4" />
      <circle cx="33" cy="13" r="3.6" fill="var(--aqua-deep)" stroke="var(--ink)" stroke-width="1.4" />
      <circle cx="13" cy="33" r="3.6" fill="var(--sun)" stroke="var(--ink)" stroke-width="1.4" />
      <circle cx="33" cy="33" r="3.6" fill="var(--sun)" stroke="var(--ink)" stroke-width="1.4" />
    </svg>`),
  'kakuro': icon('cabinet__kakuro', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="4" fill="var(--ink)" />
      <g stroke="var(--ink)" stroke-width="1.5">
        <rect x="20.5" y="4.5" width="12.5" height="12.5" fill="var(--paper-lit)" />
        <rect x="33" y="4.5" width="8.5" height="12.5" fill="var(--paper-lit)" />
        <rect x="4.5" y="17" width="12.5" height="12.5" fill="var(--paper-lit)" />
        <rect x="20.5" y="17" width="12.5" height="12.5" fill="var(--paper-lit)" />
        <rect x="33" y="29.5" width="8.5" height="8.5" fill="var(--paper-lit)" />
        <rect x="20.5" y="29.5" width="12.5" height="8.5" fill="var(--paper-lit)" />
      </g>
      <line x1="5" y1="5" x2="17" y2="17" stroke="rgba(255,243,223,0.5)" stroke-width="1.6" />
      <line x1="34" y1="18" x2="42" y2="26" stroke="rgba(255,243,223,0.5)" stroke-width="1.6" />
      <g font-family="monospace" font-size="6.5" fill="var(--cream)" text-anchor="middle">
        <text x="13.5" y="10">16</text>
        <text x="8" y="15.5">9</text>
        <text x="38.5" y="26">7</text>
      </g>
      <g font-family="monospace" font-weight="700" font-size="9" fill="var(--aqua-deep)" text-anchor="middle">
        <text x="26.75" y="14">7</text>
        <text x="10.75" y="26.5">4</text>
        <text x="26.75" y="26.5">5</text>
      </g>
    </svg>`),
  'jembatan': icon('cabinet__jembatan', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="6" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <g stroke="var(--aqua-deep)" stroke-width="2.2" stroke-linecap="round">
        <line x1="13" y1="10" x2="13" y2="33" />
        <line x1="10.5" y1="33" x2="10.5" y2="23" />
        <line x1="15.5" y1="33" x2="15.5" y2="23" />
        <line x1="13" y1="13" x2="33" y2="13" />
      </g>
      <g stroke="var(--ink)" stroke-width="1.8">
        <circle cx="13" cy="10" r="4.2" fill="var(--sun)" />
        <circle cx="33" cy="13" r="4.2" fill="var(--aqua)" />
        <circle cx="13" cy="35" r="4.2" fill="var(--aqua)" />
      </g>
      <g font-family="monospace" font-weight="700" font-size="5.5" fill="var(--ink)" text-anchor="middle" dominant-baseline="central">
        <text x="13" y="10">3</text>
        <text x="33" y="13">1</text>
        <text x="13" y="35">2</text>
      </g>
    </svg>`),
  'solitaire': icon('cabinet__solitaire', `    <svg viewBox="0 0 46 46">
      <g transform="rotate(-14 20 24)">
        <rect x="8" y="12" width="18" height="25" rx="3" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.2" />
      </g>
      <g transform="rotate(6 26 22)">
        <rect x="18" y="9" width="18" height="25" rx="3" fill="var(--paper-lit)" stroke="var(--ink)" stroke-width="2.2" />
        <text x="21.5" y="16.5" font-family="monospace" font-weight="700" font-size="6.5" fill="#d3315d">A</text>
        <text x="30" y="30" font-size="9" fill="#d3315d" text-anchor="middle">♥</text>
      </g>
    </svg>`),
  'skakmat': icon('cabinet__skakmat', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
        <rect x="10.5" y="37" width="25" height="5.6" rx="2.6" fill="var(--grape)" />
        <path d="M14.5 38 C13.8 32 17.5 29 19.5 25.5 C16.5 24 17 19.5 20.5 19 L25.5 19 C29 19.5 29.5 24 26.5 25.5 C28.5 29 32.2 32 31.5 38 Z" fill="var(--grape)" />
        <rect x="13.3" y="31.2" width="19.4" height="4.3" rx="2.1" fill="var(--grape)" />
        <ellipse cx="23" cy="15.6" rx="6.1" ry="5.4" fill="var(--grape)" />
        <path d="M21.4 3.4 H24.6 V6.1 H27.4 V9.1 H24.6 V12.4 H21.4 V9.1 H18.6 V6.1 H21.4 Z" fill="var(--sun)" />
      </g>
      <path d="M20.4 16.2 q2.6 2.2 5.2 0" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
    </svg>`),
  'backgammon': icon('cabinet__backgammon', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="5" width="38" height="36" rx="5" fill="#2f7d5b" stroke="var(--ink)" stroke-width="2.6" />
      <polygon points="8,7 14,7 11,22" fill="#e7cfa0" />
      <polygon points="14,7 20,7 17,22" fill="#c58a54" />
      <polygon points="26,7 32,7 29,21" fill="#e7cfa0" />
      <polygon points="8,39 14,39 11,24" fill="#c58a54" />
      <polygon points="20,39 26,39 23,25" fill="#e7cfa0" />
      <circle cx="11" cy="35" r="3.3" fill="#f4ead2" stroke="var(--ink)" stroke-width="1.4" />
      <circle cx="17" cy="12" r="3.3" fill="#37243f" stroke="var(--ink)" stroke-width="1.4" />
      <rect x="28" y="26" width="12" height="12" rx="2.6" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.8" />
      <g fill="var(--ink)">
        <circle cx="31" cy="29" r="1.1" /><circle cx="34" cy="32" r="1.1" /><circle cx="37" cy="35" r="1.1" />
      </g>
    </svg>`),
  'pagar': icon('cabinet__pagar', `    <svg viewBox="0 0 46 46">
      <rect x="4" y="4" width="38" height="38" rx="6" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <path d="M13 13 H33 V23 H23 V33 H13 Z" fill="rgba(108,214,192,0.35)" stroke="var(--aqua-deep)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <g fill="var(--ink)">
        <circle cx="13" cy="13" r="1.6" /><circle cx="23" cy="13" r="1.6" /><circle cx="33" cy="13" r="1.6" />
        <circle cx="13" cy="23" r="1.6" /><circle cx="23" cy="23" r="1.6" /><circle cx="33" cy="23" r="1.6" />
        <circle cx="13" cy="33" r="1.6" /><circle cx="23" cy="33" r="1.6" /><circle cx="33" cy="33" r="1.6" />
      </g>
      <g font-family="monospace" font-weight="700" font-size="7" text-anchor="middle" dominant-baseline="central">
        <text x="18" y="18" fill="var(--aqua-deep)">3</text>
        <text x="28" y="28" fill="var(--muted)">1</text>
      </g>
    </svg>`),
  'mahjong': icon('cabinet__mahjong', `    <svg viewBox="0 0 46 46">
      <rect x="15" y="6" width="22" height="28" rx="4" fill="#e6d6b2" stroke="var(--ink)" stroke-width="2.4" />
      <rect x="8" y="12" width="26" height="30" rx="5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
      <path d="M11 39.5 h20 a3 3 0 0 0 3 -3 v-2 h-26 v2 a3 3 0 0 0 3 3 z" fill="rgba(44,19,56,0.14)" />
      <g stroke="var(--ink)" stroke-width="1.6">
        <circle cx="21" cy="26" r="6.5" fill="var(--berry)" />
        <circle cx="21" cy="26" r="2.4" fill="var(--cream)" stroke="none" />
      </g>
      <g stroke="#3f9b52" stroke-width="2" stroke-linecap="round">
        <line x1="16.5" y1="17.5" x2="18.5" y2="20.5" />
        <line x1="25.5" y1="17.5" x2="23.5" y2="20.5" />
      </g>
    </svg>`),
  'catur': icon('cabinet__catur', `    <svg viewBox="0 0 46 46">
      <g stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
        <rect x="9" y="37.5" width="28" height="5" rx="2.5" fill="var(--aqua)" />
        <rect x="12.5" y="32.6" width="21" height="5" rx="2.2" fill="var(--aqua)" />
        <path d="M16 33 C14.5 29 14 27 14.5 25 L9 23.5 C7.6 22.8 8 21 10 20.3 L17.5 16.5 C18.3 12.8 21 10.8 24 10.3 L25.5 5.8 L29 11 C31.8 16 32 25 30.5 33 Z" fill="var(--aqua)" />
      </g>
      <circle cx="20.2" cy="16.4" r="1.5" fill="var(--ink)" />
      <circle cx="11" cy="21.2" r="1" fill="var(--ink)" />
      <path d="M25 12 L21.8 15 L25.4 16.6 L22.4 19.6 L26 21.2" fill="none" stroke="var(--aqua-deep)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`),
}
