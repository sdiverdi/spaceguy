import './style.css'
import { Game } from './game.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Subsurface Operations</p>
        <h1>Shardfall Depths</h1>
        <p class="summary">A compact exploration platformer with room locks, a vault boss, controller support, fullscreen play, synth SFX, and a four-room sector map.</p>
      </div>
      <div class="readout">
        <div>
          <span>Room</span>
          <strong id="room-name">Crash Trench</strong>
        </div>
        <div>
          <span>Status</span>
          <strong id="status-text">Purge the trench, recover the suit upgrades, and reach extraction.</strong>
        </div>
        <button id="fullscreen-toggle" class="screen-toggle" type="button">Fullscreen</button>
      </div>
    </header>

    <section class="layout">
      <div class="viewport-frame">
        <div class="hud-bar">
          <div><span>Energy</span><strong id="energy">99</strong></div>
          <div><span>Missiles</span><strong id="missiles">6/10</strong></div>
          <div><span>Shards</span><strong id="shards">0/2</strong></div>
        </div>
        <canvas id="game" width="960" height="540" aria-label="Shardfall Depths game viewport"></canvas>
      </div>

      <aside class="panel">
        <section>
          <p class="panel-label">Objective</p>
          <p id="objective-text">Recover 2 remaining core shard(s).</p>
        </section>
        <section>
          <p class="panel-label">Upgrade</p>
          <p id="upgrade-text">Base jump suite only</p>
        </section>
        <section>
          <p class="panel-label">Systems</p>
          <p id="mode-text">Keyboard active</p>
          <p id="boss-text">Dormant Warden</p>
        </section>
        <section>
          <p class="panel-label">Controls</p>
          <ul>
            <li>Move: A / D or Left / Right</li>
            <li>Jump: Z or Space</li>
            <li>Beam: X</li>
            <li>Missile: V</li>
            <li>Aim: W / S</li>
            <li>Dash: C or Shift</li>
            <li>Sync Station: E</li>
            <li>Fullscreen: F or Start</li>
            <li>Controller: Left stick, A jump, X beam, B missile</li>
          </ul>
        </section>
      </aside>
    </section>
  </main>
`

const canvas = document.querySelector<HTMLCanvasElement>('#game')
const energy = document.querySelector<HTMLElement>('#energy')
const missiles = document.querySelector<HTMLElement>('#missiles')
const room = document.querySelector<HTMLElement>('#room-name')
const shards = document.querySelector<HTMLElement>('#shards')
const status = document.querySelector<HTMLElement>('#status-text')
const upgrade = document.querySelector<HTMLElement>('#upgrade-text')
const objective = document.querySelector<HTMLElement>('#objective-text')
const mode = document.querySelector<HTMLElement>('#mode-text')
const boss = document.querySelector<HTMLElement>('#boss-text')
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen-toggle')

if (!(canvas && energy && missiles && room && shards && status && upgrade && objective && mode && boss && fullscreenButton)) {
  throw new Error('Failed to initialize the game UI')
}

new Game(canvas, { energy, missiles, room, shards, status, upgrade, objective, mode, boss, fullscreenButton })
