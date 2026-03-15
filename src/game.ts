const TILE = 48
const VIEW_WIDTH = 960
const VIEW_HEIGHT = 540
const ROOM_TILE_WIDTH = 18
const GRAVITY = 1500
const MAX_DT = 1 / 30
const DOOR_COLUMNS = [18, 36, 54] as const

type Action =
  | 'left'
  | 'right'
  | 'jump'
  | 'shoot'
  | 'missile'
  | 'aimUp'
  | 'aimDown'
  | 'dash'
  | 'interact'
  | 'fullscreen'

type EnemyKind = 'crawler' | 'drone' | 'boss'
type PickupKind = 'energy' | 'ammo' | 'tank' | 'jump' | 'shard'
type ProjectileKind = 'beam' | 'missile' | 'enemy'

interface UiRefs {
  energy: HTMLElement
  missiles: HTMLElement
  room: HTMLElement
  shards: HTMLElement
  status: HTMLElement
  upgrade: HTMLElement
  objective: HTMLElement
  mode: HTMLElement
  boss: HTMLElement
  fullscreenButton: HTMLButtonElement
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Player extends Rect {
  vx: number
  vy: number
  facing: -1 | 1
  onGround: boolean
  coyote: number
  jumpBuffer: number
  dashTime: number
  dashCooldown: number
  fireCooldown: number
  invuln: number
  health: number
  maxHealth: number
  missiles: number
  maxMissiles: number
  canDoubleJump: boolean
  doubleJumpUsed: boolean
  shards: number
  spawnX: number
  spawnY: number
}

interface Enemy extends Rect {
  kind: EnemyKind
  room: number
  vx: number
  vy: number
  dir: -1 | 1
  onGround: boolean
  health: number
  maxHealth: number
  patrolMin: number
  patrolMax: number
  shootCooldown: number
  burstCooldown: number
  contactDamage: number
  baseY: number
  phase: number
  flash: number
}

interface Pickup extends Rect {
  kind: PickupKind
  label: string
  bob: number
  room: number
}

interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  life: number
  damage: number
  kind: ProjectileKind
}

interface Station extends Rect {
  label: string
}

interface Gate extends Rect {
  requiredShards: number
}

interface World {
  width: number
  height: number
  tiles: string[][]
  spawn: { x: number; y: number }
  roomNames: string[]
  enemies: Enemy[]
  pickups: Pickup[]
  stations: Station[]
  gate: Gate
}

interface Star {
  x: number
  y: number
  size: number
  speed: number
  alpha: number
}

class SynthBank {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null

  private getContext(): AudioContext | null {
    const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) {
      return null
    }

    if (!this.ctx) {
      this.ctx = new AudioCtor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.06
      this.master.connect(this.ctx.destination)
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }

    return this.ctx
  }

  unlock(): void {
    this.getContext()
  }

  play(kind: 'jump' | 'beam' | 'missile' | 'dash' | 'pickup' | 'hurt' | 'door' | 'boss' | 'win'): void {
    const ctx = this.getContext()
    if (!(ctx && this.master)) {
      return
    }

    const now = ctx.currentTime
    switch (kind) {
      case 'jump':
        this.tone('triangle', 420, 620, 0.08, 0.36, now)
        break
      case 'beam':
        this.tone('square', 760, 420, 0.06, 0.22, now)
        break
      case 'missile':
        this.tone('sawtooth', 190, 90, 0.14, 0.32, now)
        this.tone('triangle', 260, 160, 0.12, 0.18, now + 0.02)
        break
      case 'dash':
        this.tone('sawtooth', 150, 360, 0.07, 0.3, now)
        break
      case 'pickup':
        this.tone('triangle', 500, 760, 0.11, 0.28, now)
        this.tone('triangle', 760, 980, 0.08, 0.18, now + 0.06)
        break
      case 'hurt':
        this.tone('sawtooth', 160, 80, 0.12, 0.3, now)
        break
      case 'door':
        this.tone('triangle', 300, 460, 0.18, 0.24, now)
        break
      case 'boss':
        this.tone('sawtooth', 110, 70, 0.32, 0.38, now)
        this.tone('square', 190, 140, 0.24, 0.2, now + 0.04)
        break
      case 'win':
        this.tone('triangle', 440, 660, 0.18, 0.24, now)
        this.tone('triangle', 660, 880, 0.24, 0.2, now + 0.18)
        break
    }
  }

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    gainLevel: number,
    startTime: number,
  ): void {
    if (!(this.ctx && this.master)) {
      return
    }

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, startTime)
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), startTime + duration)
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(gainLevel, startTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(startTime)
    osc.stop(startTime + duration + 0.02)
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const approach = (value: number, target: number, amount: number): number => {
  if (value < target) {
    return Math.min(value + amount, target)
  }

  return Math.max(value - amount, target)
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

const normalize = (x: number, y: number): { x: number; y: number } => {
  const length = Math.hypot(x, y) || 1
  return { x: x / length, y: y / length }
}

const roomIndexFromX = (x: number): number =>
  clamp(Math.floor(x / (ROOM_TILE_WIDTH * TILE)), 0, 3)

const makeEnemy = (
  kind: EnemyKind,
  x: number,
  y: number,
  patrolMin: number,
  patrolMax: number,
  room: number,
  phase = 0,
): Enemy => {
  const presets: Record<EnemyKind, { w: number; h: number; health: number; shootCooldown: number; burstCooldown: number; contactDamage: number }> = {
    crawler: { w: 34, h: 26, health: 2, shootCooldown: 99, burstCooldown: 99, contactDamage: 10 },
    drone: { w: 30, h: 26, health: 3, shootCooldown: 1.8, burstCooldown: 99, contactDamage: 10 },
    boss: { w: 88, h: 62, health: 26, shootCooldown: 1.1, burstCooldown: 3.2, contactDamage: 18 },
  }
  const preset = presets[kind]

  return {
    kind,
    x,
    y,
    w: preset.w,
    h: preset.h,
    room,
    vx: 0,
    vy: 0,
    dir: 1,
    onGround: false,
    health: preset.health,
    maxHealth: preset.health,
    patrolMin,
    patrolMax,
    shootCooldown: preset.shootCooldown,
    burstCooldown: preset.burstCooldown,
    contactDamage: preset.contactDamage,
    baseY: y,
    phase,
    flash: 0,
  }
}

const makePickup = (kind: PickupKind, x: number, y: number, label: string): Pickup => ({
  kind,
  x,
  y,
  w: 24,
  h: 24,
  label,
  bob: Math.random() * Math.PI * 2,
  room: roomIndexFromX(x),
})

const createWorld = (): World => {
  const width = 72
  const height = 18
  const tiles = Array.from({ length: height }, () => Array.from({ length: width }, () => '.'))
  const enemies: Enemy[] = []
  const pickups: Pickup[] = []
  const stations: Station[] = []
  const roomNames = ['Crash Trench', 'Thermal Lift', 'Magma Span', 'Vault Approach']

  const fillRect = (x: number, y: number, w: number, h: number, tile: string): void => {
    for (let row = y; row < y + h; row += 1) {
      for (let column = x; column < x + w; column += 1) {
        if (row >= 0 && row < height && column >= 0 && column < width) {
          tiles[row][column] = tile
        }
      }
    }
  }

  fillRect(0, 16, width, 2, '#')
  fillRect(0, 0, 1, height, '#')
  fillRect(width - 1, 0, 1, height, '#')

  for (const divider of DOOR_COLUMNS) {
    fillRect(divider, 0, 1, 16, '#')
    fillRect(divider, 10, 1, 4, 'D')
  }

  fillRect(1, 14, 7, 1, '#')
  fillRect(8, 12, 4, 1, '#')
  fillRect(12, 10, 5, 1, '#')
  fillRect(5, 8, 2, 1, '#')

  stations.push({ x: 3 * TILE + 12, y: 14 * TILE - 42, w: 22, h: 42, label: 'Save Cradle' })
  enemies.push(makeEnemy('crawler', 6 * TILE, 16 * TILE - 26, 2 * TILE, 7.5 * TILE, 0))
  enemies.push(makeEnemy('drone', 14 * TILE, 8 * TILE, 11.5 * TILE, 16 * TILE, 0, 0.8))
  pickups.push(makePickup('energy', 5 * TILE + 10, 7 * TILE + 6, 'Energy Capsule'))

  fillRect(20, 13, 4, 1, '#')
  fillRect(24, 11, 3, 1, '#')
  fillRect(28, 9, 3, 1, '#')
  fillRect(22, 7, 4, 1, '#')
  fillRect(29, 5, 5, 1, '#')
  fillRect(31, 3, 2, 1, '#')

  enemies.push(makeEnemy('crawler', 21 * TILE, 16 * TILE - 26, 19.5 * TILE, 23.5 * TILE, 1))
  enemies.push(makeEnemy('drone', 27 * TILE, 6.5 * TILE, 23 * TILE, 32.5 * TILE, 1, 1.7))
  pickups.push(makePickup('jump', 30 * TILE, 4 * TILE - 8, 'Aerial Rig'))
  pickups.push(makePickup('shard', 32 * TILE, 2 * TILE + 4, 'Core Shard Alpha'))

  fillRect(38, 13, 4, 1, '#')
  fillRect(43, 11, 4, 1, '#')
  fillRect(48, 9, 3, 1, '#')
  fillRect(51, 12, 2, 1, '#')
  fillRect(46, 7, 4, 1, '#')
  fillRect(36, 15, 18, 1, '~')

  enemies.push(makeEnemy('drone', 41 * TILE, 10 * TILE, 38 * TILE, 46.5 * TILE, 2, 0.3))
  enemies.push(makeEnemy('crawler', 50 * TILE, 16 * TILE - 26, 47 * TILE, 53 * TILE, 2))
  pickups.push(makePickup('tank', 48 * TILE + 12, 8 * TILE + 6, 'Missile Tank'))
  pickups.push(makePickup('ammo', 44 * TILE + 10, 10 * TILE + 10, 'Missile Cell'))

  fillRect(56, 14, 5, 1, '#')
  fillRect(61, 11, 3, 1, '#')
  fillRect(65, 8, 3, 1, '#')
  fillRect(60, 5, 3, 1, '#')
  fillRect(63, 13, 5, 1, '#')

  stations.push({ x: 57 * TILE + 10, y: 14 * TILE - 42, w: 22, h: 42, label: 'Relay Shrine' })
  enemies.push(makeEnemy('boss', 64 * TILE, 5.9 * TILE, 60 * TILE, 67 * TILE, 3, 0.2))

  return {
    width,
    height,
    tiles,
    spawn: { x: 2.5 * TILE, y: 14 * TILE - 42 },
    roomNames,
    enemies,
    pickups,
    stations,
    gate: { x: 69 * TILE + 14, y: 12 * TILE - 60, w: 34, h: 108, requiredShards: 2 },
  }
}

export class Game {
  private readonly ctx: CanvasRenderingContext2D
  private readonly canvas: HTMLCanvasElement
  private readonly world: World
  private readonly ui: UiRefs
  private readonly player: Player
  private readonly enemies: Enemy[]
  private readonly pickups: Pickup[]
  private readonly stations: Station[]
  private readonly playerProjectiles: Projectile[] = []
  private readonly enemyProjectiles: Projectile[] = []
  private readonly stars: Star[]
  private readonly keysDown = new Set<string>()
  private readonly keysPressed = new Set<string>()
  private readonly gamepadDown = new Set<Action>()
  private readonly gamepadPressed = new Set<Action>()
  private readonly actionKeys: Record<Action, string[]> = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    jump: ['Space', 'KeyZ', 'KeyK'],
    shoot: ['KeyX', 'KeyJ'],
    missile: ['KeyV', 'KeyL'],
    aimUp: ['ArrowUp', 'KeyW'],
    aimDown: ['ArrowDown', 'KeyS'],
    dash: ['ShiftLeft', 'ShiftRight', 'KeyC'],
    interact: ['KeyE'],
    fullscreen: ['KeyF'],
  }
  private readonly visitedRooms = new Set<number>()
  private readonly doorOpen = [false, false, false]
  private readonly doorAnnounced = [false, false, false]
  private readonly audio = new SynthBank()

  private camera = { x: 0, y: 0 }
  private gateOpen = false
  private won = false
  private bossAwake = false
  private bossArenaLocked = false
  private time = 0
  private lastFrame = performance.now()
  private statusText = 'Purge the trench, recover the suit upgrades, and reach extraction.'
  private currentInputMode = 'Keyboard active'
  private controllerAxisX = 0
  private controllerAimY = 0
  private controllerConnected = false
  private shakeTime = 0
  private shakePower = 0

  constructor(canvas: HTMLCanvasElement, ui: UiRefs) {
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Canvas 2D context unavailable')
    }

    this.canvas = canvas
    this.ctx = context
    this.ctx.imageSmoothingEnabled = false
    this.world = createWorld()
    this.ui = ui
    this.enemies = this.world.enemies
    this.pickups = this.world.pickups
    this.stations = this.world.stations
    this.player = {
      x: this.world.spawn.x,
      y: this.world.spawn.y,
      w: 28,
      h: 42,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: false,
      coyote: 0,
      jumpBuffer: 0,
      dashTime: 0,
      dashCooldown: 0,
      fireCooldown: 0,
      invuln: 0,
      health: 99,
      maxHealth: 99,
      missiles: 6,
      maxMissiles: 10,
      canDoubleJump: false,
      doubleJumpUsed: false,
      shards: 0,
      spawnX: this.world.spawn.x,
      spawnY: this.world.spawn.y,
    }
    this.stars = Array.from({ length: 64 }, (_, index) => ({
      x: ((index * 137) % (this.world.width * TILE)) + Math.random() * 80,
      y: ((index * 89) % VIEW_HEIGHT) + Math.random() * VIEW_HEIGHT * 0.25,
      size: 1 + (index % 3),
      speed: 0.08 + (index % 5) * 0.03,
      alpha: 0.18 + (index % 7) * 0.08,
    }))

    const trackedKeys = new Set(Object.values(this.actionKeys).flat())
    window.addEventListener('keydown', (event) => {
      if (!trackedKeys.has(event.code)) {
        return
      }

      event.preventDefault()
      this.audio.unlock()
      this.keysDown.add(event.code)
      if (!event.repeat) {
        this.keysPressed.add(event.code)
      }
    })

    window.addEventListener('keyup', (event) => {
      if (!trackedKeys.has(event.code)) {
        return
      }

      event.preventDefault()
      this.keysDown.delete(event.code)
    })

    window.addEventListener('blur', () => {
      this.keysDown.clear()
      this.keysPressed.clear()
      this.gamepadDown.clear()
      this.gamepadPressed.clear()
    })

    window.addEventListener('gamepadconnected', () => {
      this.controllerConnected = true
      this.currentInputMode = 'Controller linked'
      this.say('Controller linked.', 1.2)
    })

    window.addEventListener('gamepaddisconnected', () => {
      this.controllerConnected = false
      this.currentInputMode = 'Keyboard active'
      this.say('Controller disconnected.', 1.2)
    })

    document.addEventListener('fullscreenchange', this.updateFullscreenUi)
    this.ui.fullscreenButton.addEventListener('click', () => {
      this.audio.unlock()
      void this.toggleFullscreen()
    })

    this.updateDoorStates()
    this.updateFullscreenUi()
    this.updateUi()
    requestAnimationFrame(this.frame)
  }

  private readonly updateFullscreenUi = (): void => {
    this.ui.fullscreenButton.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen'
  }

  private frame = (timestamp: number): void => {
    const dt = clamp((timestamp - this.lastFrame) / 1000, 0, MAX_DT)
    this.lastFrame = timestamp

    this.pollGamepad()
    this.update(dt)
    this.render()
    this.keysPressed.clear()
    this.gamepadPressed.clear()

    requestAnimationFrame(this.frame)
  }

  private isDown(action: Action): boolean {
    return this.actionKeys[action].some((code) => this.keysDown.has(code)) || this.gamepadDown.has(action)
  }

  private wasPressed(action: Action): boolean {
    return this.actionKeys[action].some((code) => this.keysPressed.has(code)) || this.gamepadPressed.has(action)
  }

  private movementAxis(): number {
    const keyboard = (this.isDown('left') ? -1 : 0) + (this.isDown('right') ? 1 : 0)
    return keyboard !== 0 ? keyboard : this.controllerAxisX
  }

  private aimAxis(): number {
    if (this.isDown('aimUp')) {
      return -1
    }

    if (this.isDown('aimDown')) {
      return 1
    }

    return this.controllerAimY
  }

  private currentRoomIndex(): number {
    return roomIndexFromX(this.player.x + this.player.w * 0.5)
  }

  private say(text: string, duration = 2.4): void {
    this.statusText = text
    window.clearTimeout(0)
    void duration
  }

  private addShake(power: number, duration: number): void {
    this.shakePower = Math.max(this.shakePower, power)
    this.shakeTime = Math.max(this.shakeTime, duration)
  }

  private pollGamepad(): void {
    this.gamepadDown.clear()
    this.gamepadPressed.clear()
    this.controllerAxisX = 0
    this.controllerAimY = 0

    const pads = navigator.getGamepads?.() ?? []
    const pad = Array.from(pads).find((entry) => entry?.connected)
    if (!pad) {
      if (this.controllerConnected) {
        this.controllerConnected = false
        this.currentInputMode = 'Keyboard active'
      }
      return
    }

    this.controllerConnected = true
    this.currentInputMode = `Controller linked: ${pad.id.split('(')[0].trim() || 'Gamepad'}`
    this.controllerAxisX = Math.abs(pad.axes[0] ?? 0) > 0.24 ? clamp(pad.axes[0] ?? 0, -1, 1) : 0

    const rightStickY = pad.axes.length > 3 ? pad.axes[3] ?? 0 : 0
    this.controllerAimY = Math.abs(rightStickY) > 0.4 ? clamp(rightStickY, -1, 1) : 0

    const actionMap: Array<[Action, boolean]> = [
      ['left', this.controllerAxisX < -0.24 || Boolean(pad.buttons[14]?.pressed)],
      ['right', this.controllerAxisX > 0.24 || Boolean(pad.buttons[15]?.pressed)],
      ['jump', Boolean(pad.buttons[0]?.pressed)],
      ['shoot', Boolean(pad.buttons[2]?.pressed) || Boolean(pad.buttons[7]?.pressed)],
      ['missile', Boolean(pad.buttons[1]?.pressed) || Boolean(pad.buttons[6]?.pressed)],
      ['aimUp', this.controllerAimY < -0.4 || Boolean(pad.buttons[12]?.pressed)],
      ['aimDown', this.controllerAimY > 0.4 || Boolean(pad.buttons[13]?.pressed)],
      ['dash', Boolean(pad.buttons[5]?.pressed) || Boolean(pad.buttons[4]?.pressed)],
      ['interact', Boolean(pad.buttons[3]?.pressed)],
      ['fullscreen', Boolean(pad.buttons[9]?.pressed)],
    ]

    for (const [action, down] of actionMap) {
      if (!down) {
        continue
      }

      this.gamepadDown.add(action)
      const key = `gp:${action}`
      const previouslyPressed = this.keysDown.has(key)
      if (!previouslyPressed) {
        this.keysDown.add(key)
        this.gamepadPressed.add(action)
      }
    }

    for (const action of Object.keys(this.actionKeys) as Action[]) {
      const key = `gp:${action}`
      if (!this.gamepadDown.has(action)) {
        this.keysDown.delete(key)
      }
    }
  }

  private update(dt: number): void {
    this.time += dt
    this.shakeTime = Math.max(0, this.shakeTime - dt)
    this.shakePower = this.shakeTime > 0 ? approach(this.shakePower, 0, dt * 12) : 0

    if (this.wasPressed('fullscreen')) {
      void this.toggleFullscreen()
    }

    if (this.won) {
      this.updateCamera()
      this.updateUi()
      return
    }

    this.updatePlayer(dt)

    const roomIndex = this.currentRoomIndex()
    if (!this.visitedRooms.has(roomIndex)) {
      this.visitedRooms.add(roomIndex)
      this.say(`Entered ${this.world.roomNames[roomIndex]}.`)
    }

    this.updateBossTrigger(roomIndex)
    this.updateStations()
    this.updatePickups(dt)
    this.updateEnemies(dt)
    this.updateProjectiles(this.playerProjectiles, dt, false)
    this.updateProjectiles(this.enemyProjectiles, dt, true)
    this.updateHazards()
    this.updateDoorStates()
    this.gateOpen = this.player.shards >= this.world.gate.requiredShards
    this.updateGate()
    this.updateCamera()
    this.updateUi()
  }

  private updatePlayer(dt: number): void {
    const player = this.player
    player.invuln = Math.max(0, player.invuln - dt)
    player.dashTime = Math.max(0, player.dashTime - dt)
    player.dashCooldown = Math.max(0, player.dashCooldown - dt)
    player.fireCooldown = Math.max(0, player.fireCooldown - dt)

    if (player.onGround) {
      player.coyote = 0.12
      player.doubleJumpUsed = false
    } else {
      player.coyote = Math.max(0, player.coyote - dt)
    }

    if (this.wasPressed('jump')) {
      player.jumpBuffer = 0.14
    } else {
      player.jumpBuffer = Math.max(0, player.jumpBuffer - dt)
    }

    const movement = this.movementAxis()
    if (Math.abs(movement) > 0.08) {
      player.facing = movement < 0 ? -1 : 1
    }

    if (this.wasPressed('dash') && player.dashCooldown <= 0) {
      const dashDirection = Math.abs(movement) > 0.08 ? (movement < 0 ? -1 : 1) : player.facing
      player.facing = dashDirection
      player.dashTime = 0.14
      player.dashCooldown = 0.55
      player.vx = dashDirection * 560
      player.vy *= 0.25
      this.addShake(5, 0.12)
      this.audio.play('dash')
      this.say('Phase dash engaged.', 0.8)
    }

    if (player.dashTime > 0) {
      player.vx = approach(player.vx, player.facing * 560, 2600 * dt)
      player.vy = approach(player.vy, 0, 1600 * dt)
    } else {
      const topSpeed = 230
      const acceleration = player.onGround ? 1800 : 1200
      const friction = player.onGround ? 2200 : 600
      player.vx = Math.abs(movement) > 0.08 ? approach(player.vx, movement * topSpeed, acceleration * dt) : approach(player.vx, 0, friction * dt)
      player.vy += GRAVITY * dt

      if (!this.isDown('jump') && player.vy < 0) {
        player.vy += GRAVITY * 0.42 * dt
      }
    }

    if (player.jumpBuffer > 0) {
      if (player.coyote > 0) {
        player.vy = -540
        player.onGround = false
        player.coyote = 0
        player.jumpBuffer = 0
        this.audio.play('jump')
      } else if (player.canDoubleJump && !player.doubleJumpUsed) {
        player.vy = -500
        player.doubleJumpUsed = true
        player.jumpBuffer = 0
        this.audio.play('jump')
        this.addShake(2, 0.08)
        this.say('Aerial Rig stabilized a second jump.', 0.8)
      }
    }

    if (this.wasPressed('shoot') && player.fireCooldown <= 0) {
      this.firePlayerProjectile('beam')
    }

    if (this.wasPressed('missile') && player.fireCooldown <= 0) {
      if (player.missiles > 0) {
        player.missiles -= 1
        this.firePlayerProjectile('missile')
      } else {
        this.say('Missile bay empty.', 0.8)
      }
    }

    this.moveActor(player, dt)
  }

  private updateBossTrigger(roomIndex: number): void {
    const boss = this.activeBoss()
    if (!(boss && roomIndex === 3 && !this.bossAwake)) {
      return
    }

    this.bossAwake = true
    this.bossArenaLocked = true
    boss.shootCooldown = 0.4
    boss.burstCooldown = 1.8
    this.say('Vault Warden awakened. Arena sealed.')
    this.addShake(9, 0.45)
    this.audio.play('boss')
  }

  private updateStations(): void {
    for (const station of this.stations) {
      const isNear = overlaps(this.player, {
        x: station.x - 12,
        y: station.y,
        w: station.w + 24,
        h: station.h,
      })

      if (isNear && this.wasPressed('interact')) {
        this.player.spawnX = this.player.x
        this.player.spawnY = Math.min(this.player.y, station.y)
        this.player.health = this.player.maxHealth
        this.player.missiles = this.player.maxMissiles
        this.audio.play('pickup')
        this.say(`${station.label} synchronized.`)
      }
    }
  }

  private updatePickups(dt: number): void {
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index]
      pickup.bob += dt * 2.5
      pickup.y += Math.sin(pickup.bob) * 0.25

      if (!overlaps(this.player, pickup)) {
        continue
      }

      switch (pickup.kind) {
        case 'energy':
          this.player.health = Math.min(this.player.maxHealth, this.player.health + 18)
          break
        case 'ammo':
          this.player.missiles = Math.min(this.player.maxMissiles, this.player.missiles + 3)
          break
        case 'tank':
          this.player.maxMissiles += 5
          this.player.missiles = this.player.maxMissiles
          break
        case 'jump':
          this.player.canDoubleJump = true
          break
        case 'shard':
          this.player.shards += 1
          break
      }

      this.audio.play('pickup')
      this.addShake(pickup.kind === 'shard' ? 6 : 2, 0.18)
      this.say(`${pickup.label} secured.`)
      this.pickups.splice(index, 1)
    }
  }

  private updateEnemies(dt: number): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index]
      enemy.flash = Math.max(0, enemy.flash - dt)
      enemy.shootCooldown -= dt
      enemy.burstCooldown -= dt

      if (enemy.kind === 'crawler') {
        enemy.vx = enemy.dir * 72
        enemy.vy += GRAVITY * dt
        this.moveActor(enemy, dt)

        const aheadX = enemy.dir > 0 ? enemy.x + enemy.w + 2 : enemy.x - 2
        const footY = enemy.y + enemy.h + 2
        const wallY = enemy.y + enemy.h * 0.5
        const groundAhead = this.isSolidPixel(aheadX, footY)
        const wallAhead = this.isSolidPixel(aheadX, wallY)
        if (!groundAhead || wallAhead || enemy.x < enemy.patrolMin || enemy.x > enemy.patrolMax) {
          enemy.dir *= -1
          enemy.vx = enemy.dir * 72
        }
      } else if (enemy.kind === 'drone') {
        enemy.x += enemy.dir * 92 * dt
        enemy.y = enemy.baseY + Math.sin(this.time * 2.1 + enemy.phase) * 18
        if (enemy.x < enemy.patrolMin || enemy.x > enemy.patrolMax) {
          enemy.dir *= -1
        }

        if (enemy.shootCooldown <= 0 && Math.abs(this.player.x - enemy.x) < 320) {
          enemy.shootCooldown = 1.7
          this.fireEnemyProjectile(enemy, 220)
        }
      } else if (enemy.kind === 'boss') {
        this.updateBoss(enemy, dt)
      }

      if (overlaps(this.player, enemy)) {
        this.damagePlayer(enemy.contactDamage, Math.sign(this.player.x - enemy.x) * 240, -260)
      }

      if (enemy.health > 0) {
        continue
      }

      if (enemy.kind === 'boss') {
        this.bossArenaLocked = false
        this.pickups.push(makePickup('shard', enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.25, 'Core Shard Beta'))
        this.audio.play('door')
        this.addShake(12, 0.6)
        this.say('Vault Warden neutralized. Beta shard exposed.')
      } else {
        this.spawnDrop(enemy)
      }

      this.enemies.splice(index, 1)
    }
  }

  private updateBoss(enemy: Enemy, dt: number): void {
    enemy.phase += dt
    if (!this.bossAwake) {
      enemy.y = enemy.baseY + Math.sin(this.time + enemy.phase) * 6
      return
    }

    const enraged = enemy.health <= enemy.maxHealth * 0.45
    enemy.x += enemy.dir * (enraged ? 145 : 112) * dt
    enemy.y = enemy.baseY + Math.sin(this.time * (enraged ? 2.9 : 1.8) + enemy.phase) * (enraged ? 28 : 18)
    if (enemy.x < enemy.patrolMin || enemy.x > enemy.patrolMax) {
      enemy.dir *= -1
    }

    if (enemy.shootCooldown <= 0) {
      enemy.shootCooldown = enraged ? 0.75 : 1.05
      this.fireEnemyProjectile(enemy, enraged ? 320 : 280, 0)
      this.fireEnemyProjectile(enemy, enraged ? 320 : 280, -0.18)
      this.fireEnemyProjectile(enemy, enraged ? 320 : 280, 0.18)
      if (enraged) {
        this.fireEnemyProjectile(enemy, 320, -0.33)
        this.fireEnemyProjectile(enemy, 320, 0.33)
      }
      this.addShake(3, 0.08)
    }

    if (enemy.burstCooldown <= 0) {
      enemy.burstCooldown = enraged ? 2.2 : 3.4
      for (const spread of [-0.6, -0.3, 0, 0.3, 0.6]) {
        this.fireEnemyProjectile(enemy, enraged ? 260 : 230, spread)
      }
      this.audio.play('boss')
      this.addShake(6, 0.2)
    }
  }

  private updateProjectiles(projectiles: Projectile[], dt: number, hostile: boolean): void {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index]
      projectile.x += projectile.vx * dt
      projectile.y += projectile.vy * dt
      projectile.life -= dt

      if (projectile.life <= 0 || this.isSolidPixel(projectile.x, projectile.y)) {
        projectiles.splice(index, 1)
        continue
      }

      const hitbox: Rect = {
        x: projectile.x - projectile.radius,
        y: projectile.y - projectile.radius,
        w: projectile.radius * 2,
        h: projectile.radius * 2,
      }

      if (hostile) {
        if (overlaps(this.player, hitbox)) {
          this.damagePlayer(projectile.damage, Math.sign(projectile.vx) * 200, -220)
          projectiles.splice(index, 1)
        }
        continue
      }

      let consumed = false
      for (const enemy of this.enemies) {
        if (!overlaps(enemy, hitbox)) {
          continue
        }

        enemy.health -= projectile.damage
        enemy.flash = 0.12
        if (enemy.kind === 'boss') {
          this.addShake(projectile.kind === 'missile' ? 5 : 2, 0.08)
        }
        projectiles.splice(index, 1)
        consumed = true
        break
      }

      if (consumed) {
        continue
      }
    }
  }

  private updateHazards(): void {
    const left = Math.floor(this.player.x / TILE)
    const right = Math.floor((this.player.x + this.player.w - 1) / TILE)
    const top = Math.floor(this.player.y / TILE)
    const bottom = Math.floor((this.player.y + this.player.h - 1) / TILE)

    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        if (this.tileAt(column, row) === '~') {
          this.damagePlayer(14, this.player.facing * -160, -260)
          this.player.y -= 18
          return
        }
      }
    }
  }

  private updateDoorStates(): void {
    const targetStates = [
      this.remainingHostilesInRoom(0) === 0,
      this.player.canDoubleJump && this.player.shards >= 1,
      this.player.maxMissiles >= 15 && this.remainingHostilesInRoom(2) === 0,
    ]

    if (this.activeBoss() && this.bossArenaLocked) {
      targetStates[2] = false
    }

    targetStates.forEach((state, index) => {
      if (state && !this.doorOpen[index] && !this.doorAnnounced[index]) {
        this.doorAnnounced[index] = true
        this.audio.play('door')
        this.say(index === 0 ? 'Trench bulkhead released.' : index === 1 ? 'Lift lock disengaged.' : 'Vault approach unlocked.')
      }
      this.doorOpen[index] = state
    })
  }

  private remainingHostilesInRoom(room: number): number {
    return this.enemies.filter((enemy) => enemy.room === room && enemy.kind !== 'boss').length
  }

  private updateGate(): void {
    if (!overlaps(this.player, this.world.gate)) {
      return
    }

    if (!this.gateOpen) {
      this.say('Extraction gate sealed. Recover both shards.')
      return
    }

    this.won = true
    this.audio.play('win')
    this.addShake(7, 0.4)
    this.say('Extraction corridor online. Mission complete.')
  }

  private firePlayerProjectile(kind: 'beam' | 'missile'): void {
    const player = this.player
    const originX = player.x + player.w * 0.5 + player.facing * 18
    const originY = player.y + player.h * 0.42
    let shotX: number = player.facing
    let shotY = 0
    const aim = this.aimAxis()

    if (aim < -0.4) {
      shotX = 0
      shotY = -1
    } else if (aim > 0.4 && !player.onGround) {
      shotY = 1
      shotX = player.facing * 0.35
    }

    const direction = normalize(shotX, shotY)
    const speed = kind === 'missile' ? 420 : 560
    this.playerProjectiles.push({
      x: originX,
      y: originY,
      vx: direction.x * speed,
      vy: direction.y * speed,
      radius: kind === 'missile' ? 7 : 5,
      life: kind === 'missile' ? 1.6 : 0.9,
      damage: kind === 'missile' ? 3 : 1,
      kind,
    })
    player.fireCooldown = kind === 'missile' ? 0.34 : 0.18
    this.audio.play(kind === 'missile' ? 'missile' : 'beam')
    this.addShake(kind === 'missile' ? 4 : 1.5, 0.06)
  }

  private fireEnemyProjectile(enemy: Enemy, speed: number, spread = 0): void {
    const targetX = this.player.x + this.player.w * 0.5
    const targetY = this.player.y + this.player.h * 0.4
    const raw = normalize(targetX - (enemy.x + enemy.w * 0.5), targetY - (enemy.y + enemy.h * 0.5))
    const rotated = normalize(raw.x - raw.y * spread, raw.y + raw.x * spread)

    this.enemyProjectiles.push({
      x: enemy.x + enemy.w * 0.5,
      y: enemy.y + enemy.h * 0.5,
      vx: rotated.x * speed,
      vy: rotated.y * speed,
      radius: enemy.kind === 'boss' ? 7 : 5,
      life: enemy.kind === 'boss' ? 2.5 : 2.2,
      damage: enemy.kind === 'boss' ? 12 : 8,
      kind: 'enemy',
    })
  }

  private damagePlayer(amount: number, knockbackX: number, knockbackY: number): void {
    if (this.player.invuln > 0 || this.won) {
      return
    }

    this.player.health -= amount
    this.player.invuln = 0.9
    this.player.vx = knockbackX
    this.player.vy = knockbackY
    this.audio.play('hurt')
    this.addShake(6, 0.2)

    if (this.player.health > 0) {
      return
    }

    this.resetBossEncounter()
    this.player.health = this.player.maxHealth
    this.player.missiles = this.player.maxMissiles
    this.player.x = this.player.spawnX
    this.player.y = this.player.spawnY
    this.player.vx = 0
    this.player.vy = 0
    this.say('Suit rebooted at the last cradle.')
  }

  private spawnDrop(enemy: Enemy): void {
    const roll = Math.random()
    if (roll < 0.45) {
      this.pickups.push(makePickup('energy', enemy.x + enemy.w * 0.25, enemy.y + 6, 'Energy Capsule'))
    } else if (roll < 0.7) {
      this.pickups.push(makePickup('ammo', enemy.x + enemy.w * 0.25, enemy.y + 6, 'Missile Cell'))
    }
  }

  private activeBoss(): Enemy | undefined {
    return this.enemies.find((enemy) => enemy.kind === 'boss')
  }

  private resetBossEncounter(): void {
    const boss = this.activeBoss()
    if (!boss) {
      this.bossArenaLocked = false
      return
    }

    if (!(this.bossAwake || this.bossArenaLocked)) {
      return
    }

    this.bossAwake = false
    this.bossArenaLocked = false
    boss.health = boss.maxHealth
    boss.x = (boss.patrolMin + boss.patrolMax) * 0.5
    boss.y = boss.baseY
    boss.vx = 0
    boss.vy = 0
    boss.dir = 1
    boss.shootCooldown = 1.1
    boss.burstCooldown = 3.2
    boss.flash = 0
    this.enemyProjectiles.length = 0
    this.say('Vault lockdown reset. Re-enter to restart the Warden fight.')
  }

  private updateCamera(): void {
    const worldPixelWidth = this.world.width * TILE
    const worldPixelHeight = this.world.height * TILE
    this.camera.x = clamp(this.player.x + this.player.w * 0.5 - VIEW_WIDTH * 0.5, 0, worldPixelWidth - VIEW_WIDTH)
    this.camera.y = clamp(this.player.y + this.player.h * 0.35 - VIEW_HEIGHT * 0.5, 0, worldPixelHeight - VIEW_HEIGHT)
  }

  private objectiveText(): string {
    if (this.won) {
      return 'Extraction complete.'
    }

    if (!this.doorOpen[0]) {
      return 'Clear Crash Trench to release the first bulkhead.'
    }

    if (!this.doorOpen[1]) {
      return 'Secure the Aerial Rig and Alpha shard in Thermal Lift.'
    }

    if (!this.doorOpen[2]) {
      return 'Recover the missile tank and purge Magma Span.'
    }

    if (this.activeBoss()) {
      return this.bossAwake ? 'Defeat the Vault Warden and claim Beta shard.' : 'Press into Vault Approach.'
    }

    return this.gateOpen ? 'Return to the eastern gate.' : 'Collect the remaining shard and extract.'
  }

  private updateUi(): void {
    const boss = this.activeBoss()
    this.ui.energy.textContent = String(Math.max(0, Math.ceil(this.player.health)))
    this.ui.missiles.textContent = `${this.player.missiles}/${this.player.maxMissiles}`
    this.ui.shards.textContent = `${this.player.shards}/${this.world.gate.requiredShards}`
    this.ui.room.textContent = this.world.roomNames[this.currentRoomIndex()]
    this.ui.status.textContent = this.statusText
    this.ui.upgrade.textContent = this.player.canDoubleJump ? 'Aerial Rig online' : 'Base jump suite only'
    this.ui.objective.textContent = this.objectiveText()
    this.ui.mode.textContent = this.currentInputMode
    this.ui.boss.textContent = boss ? `${this.bossAwake ? 'Vault Warden' : 'Dormant Warden'} ${boss.health}/${boss.maxHealth}` : 'Area secure'
    this.updateFullscreenUi()
  }

  private async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }

    await (this.canvas.closest('.shell') ?? this.canvas).requestFullscreen()
  }

  private moveActor(actor: Player | Enemy, dt: number): void {
    actor.x += actor.vx * dt
    if (actor.vx > 0) {
      const right = Math.floor((actor.x + actor.w - 1) / TILE)
      const top = Math.floor(actor.y / TILE)
      const bottom = Math.floor((actor.y + actor.h - 1) / TILE)
      for (let row = top; row <= bottom; row += 1) {
        if (this.isSolidCell(right, row)) {
          actor.x = right * TILE - actor.w
          actor.vx = 0
          break
        }
      }
    } else if (actor.vx < 0) {
      const left = Math.floor(actor.x / TILE)
      const top = Math.floor(actor.y / TILE)
      const bottom = Math.floor((actor.y + actor.h - 1) / TILE)
      for (let row = top; row <= bottom; row += 1) {
        if (this.isSolidCell(left, row)) {
          actor.x = (left + 1) * TILE
          actor.vx = 0
          break
        }
      }
    }

    actor.onGround = false
    actor.y += actor.vy * dt
    if (actor.vy > 0) {
      const bottom = Math.floor((actor.y + actor.h - 1) / TILE)
      const left = Math.floor(actor.x / TILE)
      const right = Math.floor((actor.x + actor.w - 1) / TILE)
      for (let column = left; column <= right; column += 1) {
        if (this.isSolidCell(column, bottom)) {
          actor.y = bottom * TILE - actor.h
          actor.vy = 0
          actor.onGround = true
          break
        }
      }
    } else if (actor.vy < 0) {
      const top = Math.floor(actor.y / TILE)
      const left = Math.floor(actor.x / TILE)
      const right = Math.floor((actor.x + actor.w - 1) / TILE)
      for (let column = left; column <= right; column += 1) {
        if (this.isSolidCell(column, top)) {
          actor.y = (top + 1) * TILE
          actor.vy = 0
          break
        }
      }
    }
  }

  private tileAt(column: number, row: number): string {
    if (row < 0 || row >= this.world.height || column < 0 || column >= this.world.width) {
      return '#'
    }

    return this.world.tiles[row][column]
  }

  private isSolidCell(column: number, row: number): boolean {
    const tile = this.tileAt(column, row)
    if (tile === '#') {
      return true
    }

    if (tile === 'D') {
      const doorIndex = DOOR_COLUMNS.indexOf(column as (typeof DOOR_COLUMNS)[number])
      return doorIndex >= 0 ? !this.doorOpen[doorIndex] : true
    }

    return false
  }

  private isSolidPixel(x: number, y: number): boolean {
    return this.isSolidCell(Math.floor(x / TILE), Math.floor(y / TILE))
  }

  private render(): void {
    const ctx = this.ctx
    const shakeX = this.shakeTime > 0 ? (Math.random() - 0.5) * this.shakePower * 2 : 0
    const shakeY = this.shakeTime > 0 ? (Math.random() - 0.5) * this.shakePower * 2 : 0

    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

    const backdrop = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT)
    backdrop.addColorStop(0, '#08121c')
    backdrop.addColorStop(0.58, '#15273f')
    backdrop.addColorStop(1, '#31160b')
    ctx.fillStyle = backdrop
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

    for (const star of this.stars) {
      ctx.globalAlpha = star.alpha
      ctx.fillStyle = '#f0f4ff'
      const drawX = (star.x - this.camera.x * star.speed + VIEW_WIDTH * 4) % (VIEW_WIDTH * 1.25)
      const drawY = (star.y + Math.sin(this.time + star.x * 0.01) * 2 + VIEW_HEIGHT) % VIEW_HEIGHT
      ctx.fillRect(drawX, drawY, star.size, star.size)
    }
    ctx.globalAlpha = 1

    ctx.save()
    ctx.translate(shakeX, shakeY)
    ctx.translate(-this.camera.x, -this.camera.y)
    this.renderStructures(ctx)
    this.renderTiles(ctx)
    this.renderStations(ctx)
    this.renderGate(ctx)
    this.renderPickups(ctx)
    this.renderEnemies(ctx)
    this.renderProjectiles(ctx, this.playerProjectiles)
    this.renderProjectiles(ctx, this.enemyProjectiles)
    this.renderPlayer(ctx)
    ctx.restore()

    this.renderMinimap(ctx)
    this.renderRoomRibbon(ctx)
    this.renderBossBar(ctx)

    if (this.won) {
      ctx.fillStyle = 'rgba(8, 13, 18, 0.76)'
      ctx.fillRect(180, 170, 600, 180)
      ctx.strokeStyle = '#8df7ec'
      ctx.lineWidth = 2
      ctx.strokeRect(180, 170, 600, 180)
      ctx.fillStyle = '#ecfff8'
      ctx.font = '36px Georgia, serif'
      ctx.fillText('Mission Complete', 370, 232)
      ctx.font = '19px Trebuchet MS, sans-serif'
      ctx.fillText('You purged the vault and reopened the extraction corridor.', 240, 276)
      ctx.fillText('Refresh the page to run the sector again.', 326, 308)
    }
  }

  private renderStructures(ctx: CanvasRenderingContext2D): void {
    for (let layer = 0; layer < 4; layer += 1) {
      ctx.fillStyle = `rgba(${16 + layer * 10}, ${24 + layer * 8}, ${34 + layer * 10}, ${0.8 - layer * 0.12})`
      const offset = layer * 180
      for (let column = 0; column < this.world.width; column += 5) {
        const height = 110 + ((column + layer * 7) % 6) * 26
        const x = column * TILE + offset * 0.12
        const y = this.world.height * TILE - height - layer * 12
        ctx.fillRect(x, y, 64, height)
      }
    }
  }

  private renderTiles(ctx: CanvasRenderingContext2D): void {
    const startColumn = Math.max(0, Math.floor(this.camera.x / TILE) - 1)
    const endColumn = Math.min(this.world.width - 1, Math.ceil((this.camera.x + VIEW_WIDTH) / TILE) + 1)
    const startRow = Math.max(0, Math.floor(this.camera.y / TILE) - 1)
    const endRow = Math.min(this.world.height - 1, Math.ceil((this.camera.y + VIEW_HEIGHT) / TILE) + 1)

    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        const tile = this.world.tiles[row][column]
        if (tile === '.') {
          continue
        }

        const x = column * TILE
        const y = row * TILE
        if (tile === '#') {
          const rock = ctx.createLinearGradient(x, y, x, y + TILE)
          rock.addColorStop(0, '#647387')
          rock.addColorStop(0.16, '#394554')
          rock.addColorStop(1, '#18222c')
          ctx.fillStyle = rock
          ctx.fillRect(x, y, TILE, TILE)
          ctx.fillStyle = 'rgba(186, 225, 242, 0.22)'
          ctx.fillRect(x, y, TILE, 6)
          ctx.fillStyle = 'rgba(14, 18, 22, 0.2)'
          ctx.fillRect(x + 7, y + 10, 10, 10)
          ctx.fillRect(x + 28, y + 24, 12, 12)
        } else if (tile === '~') {
          const wave = 0.5 + Math.sin(this.time * 5 + column * 0.7) * 0.5
          ctx.fillStyle = `rgba(${180 + Math.floor(wave * 30)}, ${82 + Math.floor(wave * 20)}, 18, 0.95)`
          ctx.fillRect(x, y + 8, TILE, TILE - 8)
          ctx.fillStyle = '#ffcf63'
          ctx.fillRect(x, y + 4, TILE, 6)
        } else if (tile === 'D') {
          const open = this.doorOpen[DOOR_COLUMNS.indexOf(column as (typeof DOOR_COLUMNS)[number])]
          ctx.fillStyle = open ? 'rgba(102, 235, 209, 0.2)' : 'rgba(255, 112, 82, 0.45)'
          ctx.fillRect(x + 6, y + 2, TILE - 12, TILE - 4)
          ctx.strokeStyle = open ? '#91f0dd' : '#ff9e77'
          ctx.lineWidth = 2
          ctx.strokeRect(x + 8, y + 4, TILE - 16, TILE - 8)
        }
      }
    }
  }

  private renderStations(ctx: CanvasRenderingContext2D): void {
    for (const station of this.stations) {
      ctx.fillStyle = '#192836'
      ctx.fillRect(station.x, station.y, station.w, station.h)
      ctx.fillStyle = '#8df7ec'
      ctx.fillRect(station.x + 5, station.y + 5, station.w - 10, 8)
      ctx.fillStyle = '#f5fafb'
      ctx.fillRect(station.x + 8, station.y + 18, station.w - 16, 10)
    }
  }

  private renderGate(ctx: CanvasRenderingContext2D): void {
    const gate = this.world.gate
    ctx.fillStyle = '#141f28'
    ctx.fillRect(gate.x, gate.y, gate.w, gate.h)
    ctx.fillStyle = this.gateOpen ? 'rgba(111, 255, 208, 0.26)' : 'rgba(255, 115, 87, 0.26)'
    ctx.fillRect(gate.x + 4, gate.y + 6, gate.w - 8, gate.h - 12)
    ctx.strokeStyle = this.gateOpen ? '#9ff6db' : '#ff8f69'
    ctx.lineWidth = 2
    ctx.strokeRect(gate.x + 4, gate.y + 6, gate.w - 8, gate.h - 12)
  }

  private renderPickups(ctx: CanvasRenderingContext2D): void {
    for (const pickup of this.pickups) {
      ctx.save()
      ctx.translate(pickup.x + pickup.w * 0.5, pickup.y + pickup.h * 0.5)
      const size = pickup.kind === 'shard' ? 14 : 10
      const color =
        pickup.kind === 'energy'
          ? '#9df7ec'
          : pickup.kind === 'ammo'
            ? '#ffd166'
            : pickup.kind === 'tank'
              ? '#ffa96a'
              : pickup.kind === 'jump'
                ? '#7dc4ff'
                : '#fb8cff'

      ctx.rotate(Math.sin(this.time * 2 + pickup.bob) * 0.15)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(0, -size)
      ctx.lineTo(size, 0)
      ctx.lineTo(0, size)
      ctx.lineTo(-size, 0)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }

  private renderEnemies(ctx: CanvasRenderingContext2D): void {
    for (const enemy of this.enemies) {
      if (enemy.kind === 'crawler') {
        ctx.fillStyle = enemy.flash > 0 ? '#fff0d6' : '#ffcf7a'
        ctx.fillRect(enemy.x, enemy.y + 8, enemy.w, enemy.h - 8)
        ctx.fillStyle = '#53321a'
        ctx.fillRect(enemy.x + 4, enemy.y + 6, enemy.w - 8, 6)
        ctx.fillStyle = '#ffe9bb'
        ctx.fillRect(enemy.x + 8, enemy.y + 10, 5, 4)
        ctx.fillRect(enemy.x + enemy.w - 13, enemy.y + 10, 5, 4)
      } else if (enemy.kind === 'drone') {
        ctx.fillStyle = enemy.flash > 0 ? '#fff0d6' : '#83c7ff'
        ctx.beginPath()
        ctx.ellipse(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, enemy.w * 0.5, enemy.h * 0.45, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#eefaff'
        ctx.fillRect(enemy.x + 10, enemy.y + 11, enemy.w - 20, 4)
        ctx.strokeStyle = '#2d537a'
        ctx.beginPath()
        ctx.moveTo(enemy.x + 5, enemy.y + 14)
        ctx.lineTo(enemy.x - 4, enemy.y + 22)
        ctx.moveTo(enemy.x + enemy.w - 5, enemy.y + 14)
        ctx.lineTo(enemy.x + enemy.w + 4, enemy.y + 22)
        ctx.stroke()
      } else {
        ctx.fillStyle = enemy.flash > 0 ? '#fff4dc' : '#dc6b45'
        ctx.fillRect(enemy.x + 10, enemy.y + 18, enemy.w - 20, enemy.h - 18)
        ctx.fillStyle = '#2b2020'
        ctx.fillRect(enemy.x + 18, enemy.y + 8, enemy.w - 36, 18)
        ctx.fillStyle = '#ffe0b7'
        ctx.fillRect(enemy.x + 24, enemy.y + 12, enemy.w - 48, 6)
        ctx.fillStyle = '#ffad6b'
        ctx.fillRect(enemy.x + 4, enemy.y + 24, 18, 12)
        ctx.fillRect(enemy.x + enemy.w - 22, enemy.y + 24, 18, 12)
        ctx.fillStyle = '#ab3b31'
        ctx.fillRect(enemy.x + 16, enemy.y + enemy.h - 10, enemy.w - 32, 10)
      }
    }
  }

  private renderProjectiles(ctx: CanvasRenderingContext2D, projectiles: Projectile[]): void {
    for (const projectile of projectiles) {
      ctx.fillStyle = projectile.kind === 'beam' ? '#9ff6ff' : projectile.kind === 'missile' ? '#ffbb66' : '#ff7b6b'
      ctx.beginPath()
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D): void {
    if (this.player.invuln > 0 && Math.floor(this.time * 16) % 2 === 0) {
      return
    }

    const player = this.player
    const dashing = player.dashTime > 0
    if (dashing) {
      ctx.save()
      ctx.globalAlpha = 0.22
      ctx.translate(player.x + player.w * 0.5 - player.facing * 18, player.y + 4)
      ctx.scale(player.facing, 1)
      ctx.fillStyle = '#8beee3'
      ctx.fillRect(-12, 10, 22, 22)
      ctx.restore()
    }

    ctx.save()
    ctx.translate(player.x + player.w * 0.5, player.y)
    ctx.scale(player.facing, 1)
    ctx.fillStyle = '#1f384b'
    ctx.fillRect(-12, 6, 24, 26)
    ctx.fillStyle = '#e2eceb'
    ctx.fillRect(-11, 10, 22, 22)
    ctx.fillStyle = '#ff9449'
    ctx.fillRect(-13, 12, 6, 18)
    ctx.fillStyle = '#6fd7d4'
    ctx.fillRect(1, 16, 12, 8)
    ctx.fillStyle = '#a6bacb'
    ctx.fillRect(-10, 0, 20, 14)
    ctx.fillStyle = '#4dd2e7'
    ctx.fillRect(-6, 5, 12, 5)
    ctx.fillStyle = '#0e202d'
    ctx.fillRect(-4, 20, 14, 4)
    ctx.fillStyle = '#ffe07a'
    ctx.fillRect(-10, 32, 8, 10)
    ctx.fillRect(2, 32, 8, 10)
    ctx.restore()
  }

  private renderMinimap(ctx: CanvasRenderingContext2D): void {
    const mapX = VIEW_WIDTH - 190
    const mapY = 26
    const roomWidth = 34
    const roomHeight = 18
    ctx.fillStyle = 'rgba(5, 8, 13, 0.55)'
    ctx.fillRect(mapX - 16, mapY - 16, 170, 68)
    ctx.strokeStyle = 'rgba(133, 207, 227, 0.22)'
    ctx.strokeRect(mapX - 16, mapY - 16, 170, 68)
    for (let index = 0; index < this.world.roomNames.length; index += 1) {
      ctx.fillStyle = this.visitedRooms.has(index) ? '#76d3ce' : 'rgba(118, 211, 206, 0.18)'
      ctx.fillRect(mapX + index * roomWidth, mapY, roomWidth - 4, roomHeight)
      if (!this.doorOpen[index] && index < this.doorOpen.length) {
        ctx.fillStyle = 'rgba(255, 140, 105, 0.42)'
        ctx.fillRect(mapX + index * roomWidth + roomWidth - 6, mapY + 3, 4, roomHeight - 6)
      }
      if (this.currentRoomIndex() === index) {
        ctx.strokeStyle = '#fff2bf'
        ctx.strokeRect(mapX + index * roomWidth - 2, mapY - 2, roomWidth, roomHeight + 4)
      }
    }
    ctx.fillStyle = '#dff8ff'
    ctx.font = '13px Trebuchet MS, sans-serif'
    ctx.fillText('Sector Map', mapX, mapY + 34)
  }

  private renderRoomRibbon(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(6, 10, 16, 0.6)'
    ctx.fillRect(20, VIEW_HEIGHT - 60, 360, 30)
    ctx.strokeStyle = 'rgba(141, 223, 235, 0.3)'
    ctx.strokeRect(20, VIEW_HEIGHT - 60, 360, 30)
    ctx.fillStyle = '#d9f6ff'
    ctx.font = '16px Trebuchet MS, sans-serif'
    ctx.fillText(this.world.roomNames[this.currentRoomIndex()], 34, VIEW_HEIGHT - 39)
    ctx.fillStyle = '#8fb9ca'
    ctx.font = '12px Trebuchet MS, sans-serif'
    ctx.fillText(this.currentInputMode.startsWith('Controller') ? 'Controller' : 'Keyboard', 250, VIEW_HEIGHT - 39)
  }

  private renderBossBar(ctx: CanvasRenderingContext2D): void {
    const boss = this.activeBoss()
    if (!(boss && this.bossAwake)) {
      return
    }

    ctx.fillStyle = 'rgba(16, 10, 10, 0.7)'
    ctx.fillRect(250, 24, 460, 22)
    ctx.strokeStyle = '#d06d59'
    ctx.strokeRect(250, 24, 460, 22)
    ctx.fillStyle = '#f18b68'
    ctx.fillRect(252, 26, 456 * (boss.health / boss.maxHealth), 18)
    ctx.fillStyle = '#fff3e8'
    ctx.font = '14px Trebuchet MS, sans-serif'
    ctx.fillText('Vault Warden', 260, 40)
  }
}