export interface Point {
  x: number;
  y: number;
}

export interface SnakeState {
  body: Point[];
  score: number;
  dead: boolean;
  color: string;
  name: string;
  connected: boolean;
  zLayer: number;
  shield: boolean;
  isMirrored: boolean;
  fusedWith: string | null;
  wrapCount: number;
}

export interface Teleporter {
  a: Point;
  b: Point;
  color: string;
}

export interface GravityWell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pullRadius: number;
}

export interface IcePatch {
  x: number;
  y: number;
  radius: number;
}

export interface OneWayCorridor {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: Point;
}

export interface Mine {
  x: number;
  y: number;
  owner: string;
  color: string;
  createdAt: number;
}

export interface SeveredChunk {
  x: number;
  y: number;
  color: string;
}

export interface StormState {
  active: boolean;
  radius: number;
  center: Point;
  damageTick: number;
}

export interface WeatherState {
  wind: Point;
  timer: number;
}

export interface ChaosCard {
  id: string;
  title: string;
  desc: string;
}

export interface GameModifiers {
  portalWalls: boolean;
  gravityWells: boolean;
  shrinkingArena: boolean;
  teleportTiles: boolean;
  oneWayCorridors: boolean;
  elasticTether: boolean;
  inverseMode: boolean;
  detachableTail: boolean;
  segmentedOwnership: boolean;
  decayMode: boolean;
  symbioteFusion: boolean;
  packBonding: boolean;
  fogOfWar: boolean;
  colorReshuffle: boolean;
  mirroredCurse: boolean;
  fakeFood: boolean;
  zLayers: boolean;
  bumperPhysics: boolean;
  weatherSystem: boolean;
  chaosCards: boolean;
  leaderboardCurse: boolean;
}

export interface PublicGameState {
  grid: number;
  snakes: Record<string, SnakeState>;
  food: Point;
  fakeFoods: Point[];
  mines: Mine[];
  severedChunks: SeveredChunk[];
  teleporters: Teleporter[];
  gravityWells: GravityWell[];
  icePatches: IcePatch[];
  oneWayCorridors: OneWayCorridor[];
  storm: StormState;
  weather: WeatherState;
  chaosCard: ChaosCard | null;
  inverseModeActive: boolean;
  inverseTimer: number;
  modifiers: GameModifiers;
  running: boolean;
  paused: boolean;
  timeRemaining: number;
  adminId: string | null;
  code: string;
}

export interface ChatMessage {
  from: string;
  name: string;
  color: string;
  text: string;
  isSystem?: boolean;
  isSelf?: boolean;
  time?: string;
}
