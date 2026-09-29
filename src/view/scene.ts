import {
  ADDRESS_CLAMP_TO_EDGE,
  Application,
  BLEND_NORMAL,
  Color,
  CULLFACE_NONE,
  Entity,
  FILTER_NEAREST,
  GAMMA_SRGB,
  PROJECTION_ORTHOGRAPHIC,
  SHADERLANGUAGE_GLSL,
  SHADERLANGUAGE_WGSL,
  StandardMaterial,
  Texture,
  TONEMAP_ACES,
  Vec3,
} from 'playcanvas';
import type { WorldEvent, WorldState } from '../game/types';
import { visibleEnemies, visibleObjects } from '../game/combat';
import type { TilePosition } from '../game/map';
import { drawCardArt, drawCardBack, drawEchoCardBack, drawEnergyBadge } from './art';
import { drawWorldObject, drawWorldSprite, drawWorldTile, type PixelDirection } from './pixel-art';
import { CARD_MOTION, CARD_TARGET_GAP, CARD_TARGET_Y, MAP_VIEW, type CardTermRegion, type CardVisual, type ScenePort } from './types';

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const WORLD_SCALE = 100;

type MotionValue = { value: number; velocity: number };
type CardPose = {
  x: number;
  y: number;
  roll: number;
  flip: number;
  width: number;
  height: number;
};
type CardTransition = {
  startedAt: number;
  durationMs: number;
  offset: CardPose;
};
type CardDotRig = {
  actor: string;
  root: Entity;
  ring: Entity;
  well: Entity;
};
type CardRig = {
  root: Entity;
  surface: Entity;
  backSurface: Entity;
  edgeSurface: Entity | null;
  shadow: Entity | null;
  energyBadge: Entity;
  material: StandardMaterial;
  dots: CardDotRig[];
  textureKey: string;
  visual: CardVisual;
  clipRect: Float32Array;
  fogBounds: Float32Array;
  ownsMaterial: boolean;
  layer: number;
  x: MotionValue;
  y: MotionValue;
  roll: MotionValue;
  flip: MotionValue;
  depth: MotionValue;
  displayedWidth: number;
  displayedHeight: number;
  widthVelocity: number;
  heightVelocity: number;
  targetPose: CardPose;
  transition: CardTransition | null;
};
type EffectPart = {
  entity: Entity;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  growth: number;
  rotation: number;
  spin: number;
  round: boolean;
};
type SceneEffect = {
  root: Entity;
  parts: EffectPart[];
  age: number;
  duration: number;
};
type WorldRig = {
  id: string;
  kind: string;
  root: Entity;
  surface: Entity;
  selection: Entity;
  visible: boolean;
  tile: TilePosition;
  facing: PixelDirection;
  screenX: number;
  screenY: number;
  targetX: number;
  targetY: number;
  moveStartedAt: number;
  moveDuration: number;
  fromX: number;
  fromY: number;
  attackStartedAt: number;
  attackDuration: number;
  attackX: number;
  attackY: number;
  attackDirection: PixelDirection;
  textureKey: string;
};

const WORLD_TILE_SIZE = 48;
const WORLD_MOVE_MS = 150;
const WORLD_ATTACK_MS = 340;
function worldX(designX: number): number {
  return (designX - DESIGN_WIDTH / 2) / WORLD_SCALE;
}

function worldY(designY: number): number {
  return (DESIGN_HEIGHT / 2 - designY) / WORLD_SCALE;
}

function followCritical(current: MotionValue, target: number, dt: number, frequency = 24): void {
  const offset = current.value - target;
  const decay = Math.exp(-frequency * dt);
  const impulse = (current.velocity + frequency * offset) * dt;
  current.value = target + (offset + impulse) * decay;
  current.velocity = (current.velocity - frequency * impulse) * decay;
}

function snap(current: MotionValue, target: number): void {
  current.value = target;
  current.velocity = 0;
}


function angleOffset(from: number, to: number): number {
  return ((from - to + 540) % 360) - 180;
}

function samePose(a: CardPose, b: CardPose): boolean {
  return Math.abs(a.x - b.x) < 1e-6
    && Math.abs(a.y - b.y) < 1e-6
    && Math.abs(angleOffset(a.roll, b.roll)) < 1e-6
    && Math.abs(angleOffset(a.flip, b.flip)) < 1e-6
    && Math.abs(a.width - b.width) < 1e-4
    && Math.abs(a.height - b.height) < 1e-4;
}

function textureFromCanvas(app: Application, source: HTMLCanvasElement, name: string): Texture {
  const texture = new Texture(app.graphicsDevice, {
    name,
    width: source.width,
    height: source.height,
    mipmaps: true,
    anisotropy: Math.min(8, app.graphicsDevice.maxAnisotropy),
    srgb: true,
  });
  texture.setSource(source);
  return texture;
}
function pixelTextureFromCanvas(app: Application, source: HTMLCanvasElement, name: string): Texture {
  const texture = new Texture(app.graphicsDevice, {
    name,
    width: source.width,
    height: source.height,
    mipmaps: false,
    minFilter: FILTER_NEAREST,
    magFilter: FILTER_NEAREST,
    addressU: ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
    anisotropy: 1,
    srgb: true,
  });
  texture.setSource(source);
  return texture;
}

function enableMapClipping(material: StandardMaterial): void {
  material.shaderChunksVersion = '2.18';
  material.getShaderChunks(SHADERLANGUAGE_GLSL).add({
    litUserDeclarationPS: 'uniform vec4 uMapClipRect;',
    litUserMainStartPS: `
      if (vPositionW.x < uMapClipRect.x || vPositionW.y < uMapClipRect.y ||
          vPositionW.x > uMapClipRect.z || vPositionW.y > uMapClipRect.w) discard;
    `,
  });
  material.getShaderChunks(SHADERLANGUAGE_WGSL).add({
    litUserDeclarationPS: 'uniform uMapClipRect: vec4f;',
    litUserMainStartPS: `
      if (vPositionW.x < uniform.uMapClipRect.x || vPositionW.y < uniform.uMapClipRect.y ||
          vPositionW.x > uniform.uMapClipRect.z || vPositionW.y > uniform.uMapClipRect.w) {
        discard;
      }
    `,
  });
  material.cull = CULLFACE_NONE;
  material.update();
}

function texturedMaterial(texture: Texture, transparent = false, emissive = 0): StandardMaterial {
  const material = new StandardMaterial();
  material.diffuseMap = texture;
  material.diffuse = new Color(1, 1, 1);
  material.specular = new Color(.35, .32, .25);
  material.gloss = .56;
  material.clearCoat = .2;
  material.clearCoatGloss = .72;
  if (emissive) {
    material.emissiveMap = texture;
    material.emissive = new Color(emissive, emissive, emissive);
  }
  if (transparent) {
    material.opacityMap = texture;
    material.opacityMapChannel = 'a';
    material.alphaTest = .08;
    material.blendType = BLEND_NORMAL;
    material.depthWrite = true;
  }
  material.update();
  return material;
}

function solidMaterial(color: Color, gloss = .25, emissive?: Color): StandardMaterial {
  const material = new StandardMaterial();
  material.diffuse = color;
  material.specular = new Color(.25, .22, .16);
  material.gloss = gloss;
  if (emissive) material.emissive = emissive;
  material.update();
  return material;
}
const UNCLIPPED_RECT = new Float32Array([-10_000, -10_000, 10_000, 10_000]);
const UNFOGGED_BOUNDS = new Float32Array([-10_000, 10_000, 1, 0]);

function enableCardClipping(material: StandardMaterial): void {
  material.shaderChunksVersion = '2.18';
  material.getShaderChunks(SHADERLANGUAGE_GLSL).add({
    litUserDeclarationPS: 'uniform vec4 uCardClipRect;\nuniform vec4 uCardFog;',
    litUserMainStartPS: `
      if (vPositionW.x < uCardClipRect.x || vPositionW.y < uCardClipRect.y ||
          vPositionW.x > uCardClipRect.z || vPositionW.y > uCardClipRect.w) discard;
      float cardFogAlpha = smoothstep(uCardFog.x, uCardFog.x + uCardFog.z, vPositionW.x) *
        (1.0 - smoothstep(uCardFog.y - uCardFog.z, uCardFog.y, vPositionW.x));
      if (cardFogAlpha <= 0.001) discard;
    `,
    litUserMainEndPS: 'gl_FragColor.a *= cardFogAlpha;',
  });
  material.getShaderChunks(SHADERLANGUAGE_WGSL).add({
    litUserDeclarationPS: 'uniform uCardClipRect: vec4f;\nuniform uCardFog: vec4f;',
    litUserMainStartPS: `
      if (vPositionW.x < uniform.uCardClipRect.x || vPositionW.y < uniform.uCardClipRect.y ||
          vPositionW.x > uniform.uCardClipRect.z || vPositionW.y > uniform.uCardClipRect.w) {
        discard;
      }
      let cardFogAlpha = smoothstep(uniform.uCardFog.x, uniform.uCardFog.x + uniform.uCardFog.z, vPositionW.x) *
        (1.0 - smoothstep(uniform.uCardFog.y - uniform.uCardFog.z, uniform.uCardFog.y, vPositionW.x));
      if (cardFogAlpha <= 0.001) {
        discard;
      }
    `,
    litUserMainEndPS: 'output.color = vec4f(output.color.rgb, output.color.a * cardFogAlpha);',
  });
  material.blendType = BLEND_NORMAL;
  material.depthWrite = false;
  material.update();
}

function applyCardParameters(entity: Entity, clipRect: Float32Array, fogBounds: Float32Array): void {
  for (const meshInstance of entity.render?.meshInstances ?? []) {
    meshInstance.setParameter('uCardClipRect', clipRect);
    meshInstance.setParameter('uCardFog', fogBounds);
  }
}

function primitive(
  app: Application,
  parent: Entity,
  name: string,
  type: 'box' | 'sphere' | 'cylinder' | 'plane',
  position: [number, number, number],
  scale: [number, number, number],
  material: StandardMaterial,
  shadows = false,
): Entity {
  const entity = new Entity(name, app);
  entity.addComponent('render', { type, material, castShadows: shadows, receiveShadows: shadows });
  entity.setLocalPosition(...position);
  entity.setLocalScale(...scale);
  parent.addChild(entity);
  return entity;
}

export function createScene(canvas: HTMLCanvasElement): ScenePort {
  const app = new Application(canvas, {
    graphicsDeviceOptions: { alpha: false, antialias: true, depth: true, stencil: false },
  });
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  app.scene.ambientLight = new Color(.32, .34, .3);
  app.scene.exposure = 1;

  const camera = new Entity('World_Card_Camera', app);
  camera.addComponent('camera', {
    clearColor: new Color(.018, .047, .05),
    projection: PROJECTION_ORTHOGRAPHIC,
    orthoHeight: DESIGN_HEIGHT / WORLD_SCALE / 2,
    nearClip: .1,
    farClip: 40,
    frustumCulling: true,
  });
  camera.setPosition(0, 0, 12);
  app.root.addChild(camera);
  if (camera.camera) {
    camera.camera.gammaCorrection = GAMMA_SRGB;
    camera.camera.toneMapping = TONEMAP_ACES;
  }

  const worldRoot = new Entity('MOREMART_World', app);
  app.root.addChild(worldRoot);
  const tileRoot = new Entity('Static_Tile_Map', app);
  worldRoot.addChild(tileRoot);
  const objectRoot = new Entity('World_Objects', app);
  worldRoot.addChild(objectRoot);
  const actorRoot = new Entity('World_Actors', app);
  worldRoot.addChild(actorRoot);
  const mapClipRect = new Float32Array([
    worldX(MAP_VIEW.x),
    worldY(MAP_VIEW.y + MAP_VIEW.height),
    worldX(MAP_VIEW.x + MAP_VIEW.width),
    worldY(MAP_VIEW.y),
  ]);
  const mapBackdropMaterial = solidMaterial(new Color(.035, .105, .1), 0);
  mapBackdropMaterial.useLighting = false;
  mapBackdropMaterial.emissive = mapBackdropMaterial.diffuse;
  mapBackdropMaterial.update();
  primitive(
    app,
    app.root,
    'Map_Backdrop',
    'box',
    [worldX(MAP_VIEW.width / 2), worldY(MAP_VIEW.height / 2), -.2],
    [MAP_VIEW.width / WORLD_SCALE, MAP_VIEW.height / WORLD_SCALE, .02],
    mapBackdropMaterial,
  );
  const selectedWorldMaterial = solidMaterial(new Color(1, .68, .12), 0, new Color(.4, .18, .01));
  selectedWorldMaterial.useLighting = false;
  selectedWorldMaterial.blendType = BLEND_NORMAL;
  selectedWorldMaterial.opacity = .82;
  enableMapClipping(selectedWorldMaterial);
  const worldTextures = new Map<string, Texture>();
  const worldMaterials = new Map<string, StandardMaterial>();
  const worldRigs = new Map<string, WorldRig>();
  let mapTexture: Texture | null = null;
  let mapMaterial: StandardMaterial | null = null;
  let mapSurface: Entity | null = null;
  let mapWidth = 0;
  let mapHeight = 0;
  let cameraTileX = 0;
  let cameraTileY = 0;
  let targetCameraTileX = 0;
  let targetCameraTileY = 0;
  let selectedWorldId: string | null = null;

  const handLight = new Entity('Tabletop_Reading_Light', app);
  handLight.addComponent('light', {
    type: 'omni',
    color: new Color(1, .9, .73),
    intensity: .72,
    range: 14,
    castShadows: false,
  });
  handLight.setPosition(0, -3.7, 7);
  app.root.addChild(handLight);

  const timelineMaterials = [
    solidMaterial(new Color(.14, .27, .27).linear(), 0),
    solidMaterial(new Color(.36, .22, .15).linear(), 0),
    solidMaterial(new Color(.24, .19, .27).linear(), 0),
    solidMaterial(new Color(.91, .73, .27).linear(), 0),
  ];
  for (const material of timelineMaterials) {
    material.useLighting = false;
    material.emissive = material.diffuse;
    material.update();
  }
  primitive(app, app.root, 'Timeline_Past_Backplate', 'box', [worldX(456), worldY(707.5), 2.2], [9.12, 3.35, .02], timelineMaterials[0]);
  primitive(app, app.root, 'Timeline_Now_Backplate', 'box', [worldX(960), worldY(707.5), 2.2], [.96, 3.35, .02], timelineMaterials[1]);
  primitive(app, app.root, 'Timeline_Future_Backplate', 'box', [worldX(1464), worldY(707.5), 2.2], [9.12, 3.35, .02], timelineMaterials[2]);
  primitive(app, app.root, 'Timeline_Now_Rail', 'box', [worldX(960), worldY(707.5), 2.24], [.06, 3.35, .02], timelineMaterials[3]);


  const targetWellMaterial = solidMaterial(new Color(.025, .075, .08), .3);
  const targetDimMaterial = solidMaterial(new Color(.34, .4, .39), .5);
  const targetTealMaterial = solidMaterial(new Color(.08, .82, .72), .7, new Color(.02, .25, .21));
  const targetAmberMaterial = solidMaterial(new Color(1, .57, .16), .7, new Color(.34, .13, .02));
  for (const material of [targetWellMaterial, targetDimMaterial, targetTealMaterial, targetAmberMaterial]) {
    enableCardClipping(material);
  }

  const detailScrimMaterial = solidMaterial(new Color(0, 0, 0), 0);
  detailScrimMaterial.opacity = .62;
  detailScrimMaterial.blendType = BLEND_NORMAL;
  detailScrimMaterial.depthWrite = false;
  detailScrimMaterial.update();
  const detailScrim = primitive(
    app,
    app.root,
    'Card_Detail_Scene_Scrim',
    'box',
    [0, 0, 4.5],
    [DESIGN_WIDTH / WORLD_SCALE, DESIGN_HEIGHT / WORLD_SCALE, .01],
    detailScrimMaterial,
  );
  detailScrim.enabled = false;

  const builderCardBackTexture = textureFromCanvas(app, drawCardBack(), 'Bob builder card back');
  const builderCardBackMaterial = texturedMaterial(builderCardBackTexture, true, .025);
  builderCardBackMaterial.opacity = 1;
  builderCardBackMaterial.specular = new Color(.16, .14, .1);
  builderCardBackMaterial.gloss = .38;
  builderCardBackMaterial.clearCoat = .08;
  builderCardBackMaterial.clearCoatGloss = .4;
  builderCardBackMaterial.update();
  const echoCardBackTexture = textureFromCanvas(app, drawEchoCardBack(), 'Anonymous temporal afterimage');
  const echoCardBackMaterial = texturedMaterial(echoCardBackTexture, true, .65);
  echoCardBackMaterial.diffuse = new Color(.65, .85, .8).linear();
  echoCardBackMaterial.opacity = .5;
  echoCardBackMaterial.specular = new Color(.04, .07, .065);
  echoCardBackMaterial.gloss = .12;
  echoCardBackMaterial.clearCoat = 0;
  const enemyCardBackTexture = textureFromCanvas(app, drawCardBack(true), 'Enemy intent card back');
  const enemyCardBackMaterial = texturedMaterial(enemyCardBackTexture, true, .025);
  enemyCardBackMaterial.opacity = 1;
  enemyCardBackMaterial.specular = new Color(.16, .14, .1);
  enemyCardBackMaterial.gloss = .38;
  enemyCardBackMaterial.clearCoat = .08;
  enemyCardBackMaterial.clearCoatGloss = .4;
  enemyCardBackMaterial.update();
  enableCardClipping(builderCardBackMaterial);
  enableCardClipping(enemyCardBackMaterial);
  enableCardClipping(echoCardBackMaterial);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 384;
  const shadowContext = shadowCanvas.getContext('2d')!;
  shadowContext.fillStyle = '#000';
  shadowContext.shadowColor = '#000';
  shadowContext.shadowBlur = 6;
  shadowContext.beginPath();
  shadowContext.roundRect(10, 10, 236, 364, 18);
  shadowContext.fill();
  const cardShadowTexture = textureFromCanvas(app, shadowCanvas, 'Soft card shadow');
  const cardShadowMaterial = texturedMaterial(cardShadowTexture, true);
  cardShadowMaterial.useLighting = false;
  cardShadowMaterial.opacity = .22;
  cardShadowMaterial.alphaTest = 0;
  cardShadowMaterial.cull = CULLFACE_NONE;
  enableCardClipping(cardShadowMaterial);
  const cardEdgeMaterial = solidMaterial(new Color(.045, .055, .05), .18);
  cardEdgeMaterial.cull = CULLFACE_NONE;
  enableCardClipping(cardEdgeMaterial);

  function effectMaterial(color: Color): StandardMaterial {
    const material = solidMaterial(color, 0, color);
    material.useLighting = false;
    material.depthWrite = false;
    material.cull = CULLFACE_NONE;
    enableMapClipping(material);
    return material;
  }
  const inkEffectMaterial = effectMaterial(new Color(.035, .04, .035));
  const damageEffectMaterial = effectMaterial(new Color(.92, .16, .09));
  const criticalEffectMaterial = effectMaterial(new Color(1, .62, .08));
  const blockEffectMaterial = effectMaterial(new Color(.08, .72, .72));
  const healEffectMaterial = effectMaterial(new Color(.2, .88, .42));
  const exposedEffectMaterial = effectMaterial(new Color(1, .48, .08));
  const ringingEffectMaterial = effectMaterial(new Color(.7, .34, .9));
  const energyEffectMaterial = effectMaterial(new Color(1, .75, .12));
  const discardEffectMaterial = effectMaterial(new Color(.42, .22, .14));

  const cardTextures = new Map<string, Texture>();
  const cardTermRegions = new Map<string, CardTermRegion[]>();
  const energyBadgeMaterials = new Map<string, StandardMaterial>();
  const cards = new Map<string, CardRig>();
  const effects: SceneEffect[] = [];
  let reducedMotion = false;
  let paused = false;
  let sceneNow = performance.now();
  let destroyed = false;
  let worldSeed: number | null = null;
  let worldTick: number | null = null;

  function setMapClip(entity: Entity): void {
    for (const meshInstance of entity.render?.meshInstances ?? []) {
      meshInstance.setParameter('uMapClipRect', mapClipRect);
    }
  }

  function worldMaterial(key: string, source: HTMLCanvasElement): StandardMaterial {
    let material = worldMaterials.get(key);
    if (material) return material;
    const texture = pixelTextureFromCanvas(app, source, key);
    material = texturedMaterial(texture, true, .16);
    material.useLighting = false;
    material.specular = new Color(0, 0, 0);
    material.gloss = 0;
    enableMapClipping(material);
    worldTextures.set(key, texture);
    worldMaterials.set(key, material);
    return material;
  }

  function buildMap(state: WorldState): void {
    if (mapSurface) return;
    mapWidth = state.map.width;
    mapHeight = state.map.height;
    const surface = document.createElement('canvas');
    surface.width = mapWidth * 32;
    surface.height = mapHeight * 32;
    const context = surface.getContext('2d');
    if (!context) throw new Error('Canvas 2D is required for the world map.');
    context.imageSmoothingEnabled = false;
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        context.drawImage(drawWorldTile(state.map.tiles[y][x]), x * 32, y * 32);
      }
    }
    mapTexture = pixelTextureFromCanvas(app, surface, 'MOREMART static tile map');
    mapMaterial = texturedMaterial(mapTexture, false, .08);
    mapMaterial.useLighting = false;
    mapMaterial.specular = new Color(0, 0, 0);
    mapMaterial.gloss = 0;
    enableMapClipping(mapMaterial);
    mapSurface = primitive(
      app,
      tileRoot,
      'Tile_Map_Surface',
      'plane',
      [mapWidth * WORLD_TILE_SIZE / (2 * WORLD_SCALE), -mapHeight * WORLD_TILE_SIZE / (2 * WORLD_SCALE), 0],
      [mapWidth * WORLD_TILE_SIZE / WORLD_SCALE, 1, mapHeight * WORLD_TILE_SIZE / WORLD_SCALE],
      mapMaterial,
    );
    mapSurface.setLocalEulerAngles(90, 0, 0);
    setMapClip(mapSurface);
  }

  function localTileX(position: TilePosition): number {
    return (position.x + .5) * WORLD_TILE_SIZE / WORLD_SCALE;
  }

  function localTileY(position: TilePosition, sprite = false): number {
    return -(position.y + .5) * WORLD_TILE_SIZE / WORLD_SCALE + (sprite ? .12 : 0);
  }

  function setWorldRigTexture(rig: WorldRig, key: string, source: HTMLCanvasElement): void {
    if (rig.textureKey === key) return;
    if (rig.surface.render) rig.surface.render.material = worldMaterial(key, source);
    rig.textureKey = key;
    setMapClip(rig.surface);
  }

  function setWorldSprite(rig: WorldRig, direction: PixelDirection, frame: number): void {
    const key = `sprite:${rig.kind}:${direction}:${frame & 1}`;
    if (rig.textureKey !== key) setWorldRigTexture(rig, key, drawWorldSprite(rig.kind, direction, frame));
  }

  function resetWorldActions(): void {
    for (const rig of worldRigs.values()) {
      rig.attackDuration = 0;
      rig.attackX = 0;
      rig.attackY = 0;
      if (rig.root.parent === objectRoot) continue;
      rig.surface.setLocalScale(WORLD_TILE_SIZE / WORLD_SCALE, 1, WORLD_TILE_SIZE * 1.5 / WORLD_SCALE);
      setWorldSprite(rig, rig.facing, 0);
    }
  }

  function makeWorldRig(id: string, kind: string, tile: TilePosition, object: boolean): WorldRig {
    const root = new Entity(`${object ? 'Object' : 'Actor'}_${id}`, app);
    (object ? objectRoot : actorRoot).addChild(root);
    const key = object ? `object:${kind}` : `sprite:${kind}:down:0`;
    const source = object ? drawWorldObject(kind) : drawWorldSprite(kind, 'down', 0);
    const width = WORLD_TILE_SIZE / WORLD_SCALE;
    const height = (object ? WORLD_TILE_SIZE : WORLD_TILE_SIZE * 1.5) / WORLD_SCALE;
    const surface = primitive(app, root, 'Pixel_Surface', 'plane', [0, 0, .02], [width, 1, height], worldMaterial(key, source));
    surface.setLocalEulerAngles(90, 0, 0);
    setMapClip(surface);
    const selection = primitive(
      app,
      root,
      'Target_Selection',
      'cylinder',
      [0, object ? -.16 : -.26, .005],
      [width * .82, .012, width * .82],
      selectedWorldMaterial,
    );
    selection.setLocalEulerAngles(90, 0, 0);
    setMapClip(selection);
    selection.enabled = false;
    const x = localTileX(tile);
    const y = localTileY(tile, !object);
    root.setLocalPosition(x, y, object ? .12 : .24);
    return {
      id,
      kind,
      root,
      surface,
      visible: true,
      selection,
      tile: { x: tile.x, y: tile.y },
      facing: 'down',
      screenX: x,
      screenY: y,
      targetX: x,
      targetY: y,
      moveStartedAt: sceneNow,
      moveDuration: 0,
      fromX: x,
      fromY: y,
      attackStartedAt: sceneNow,
      attackDuration: 0,
      attackX: 0,
      attackY: 0,
      attackDirection: 'down',
      textureKey: key,
    };
  }

  function resetWorldPresentation(): void {
    resetWorldActions();
    selectedWorldId = null;
    for (const effect of effects) effect.root.destroy();
    effects.length = 0;
    for (const rig of worldRigs.values()) {
      rig.targetX = localTileX(rig.tile);
      rig.targetY = localTileY(rig.tile, rig.root.parent !== objectRoot);
      rig.screenX = rig.targetX;
      rig.screenY = rig.targetY;
      rig.moveDuration = 0;
    }
    positionWorld(true);
  }

  function updateWorldRig(rig: WorldRig, tile: TilePosition, kind: string, direction: PixelDirection = 'down', frame = 0): void {
    const object = rig.root.parent === objectRoot;
    if (rig.tile.x !== tile.x || rig.tile.y !== tile.y) {
      // State arrives before its presentation events. Keep the displayed pose until playEvent
      // stages the matching move, so simultaneous simulation updates do not animate together.
      rig.tile.x = tile.x;
      rig.tile.y = tile.y;
    }
    rig.kind = kind;
    rig.facing = direction;
    if (object) setWorldRigTexture(rig, `object:${kind}`, drawWorldObject(kind));
    else if (rig.attackDuration <= 0) setWorldSprite(rig, direction, frame);
  }

  function syncWorld(state: WorldState, snap: boolean): void {
    const reset = snap || worldSeed !== state.seed || (worldTick !== null && state.tick < worldTick);
    if (worldSeed !== null && (worldSeed !== state.seed || worldTick !== state.tick)) resetWorldActions();
    worldSeed = state.seed;
    worldTick = state.tick;
    buildMap(state);
    const horizontalInset = Math.min(10.5, mapWidth / 2);
    targetCameraTileX = Math.max(horizontalInset, Math.min(mapWidth - horizontalInset, state.player.position.x + .5));
    targetCameraTileY = Math.max(
      MAP_VIEW.height / (2 * WORLD_TILE_SIZE),
      Math.min(mapHeight - MAP_VIEW.height / (2 * WORLD_TILE_SIZE), state.player.position.y + .5),
    );
    cameraTileX = targetCameraTileX;
    cameraTileY = targetCameraTileY;

    const live = new Set<string>();
    const visibleEnemyIds = new Set(visibleEnemies(state).map((enemy) => enemy.id));
    const syncActor = (id: string, kind: string, tile: TilePosition, direction: PixelDirection, frame: number): void => {
      live.add(id);
      let rig = worldRigs.get(id);
      if (!rig) {
        rig = makeWorldRig(id, kind, tile, false);
        worldRigs.set(id, rig);
      }
      rig.visible = id === state.player.id || visibleEnemyIds.has(id);
      updateWorldRig(rig, tile, kind, direction, frame);
    };
    syncActor(state.player.id, 'bob', state.player.position, state.player.facing, state.tick);
    for (const enemy of state.enemies) {
      if (enemy.hp > 0) syncActor(enemy.id, enemy.encounterId, enemy.position, enemy.facing, state.tick);
    }
    const visibleObjectIds = new Set(visibleObjects(state).map((object) => object.id));
    for (const object of state.map.objects) {
      if (state.usedObjectIds.includes(object.id)) continue;
      live.add(object.id);
      let rig = worldRigs.get(object.id);
      if (!rig) {
        rig = makeWorldRig(object.id, object.kind, object.position, true);
        worldRigs.set(object.id, rig);
      }
      rig.visible = visibleObjectIds.has(object.id);
      updateWorldRig(rig, object.position, object.kind);
    }
    for (const [id, rig] of worldRigs) {
      if (live.has(id)) continue;
      rig.root.destroy();
      worldRigs.delete(id);
    }
    if (reset) resetWorldPresentation();
    else positionWorld(reducedMotion);
  }

  function positionWorld(immediate = false): void {
    const blend = immediate || reducedMotion ? 1 : .22;
    cameraTileX += (targetCameraTileX - cameraTileX) * blend;
    cameraTileY += (targetCameraTileY - cameraTileY) * blend;
    worldRoot.setPosition(
      worldX(MAP_VIEW.x + MAP_VIEW.width / 2) - cameraTileX * WORLD_TILE_SIZE / WORLD_SCALE,
      worldY(MAP_VIEW.y + MAP_VIEW.height / 2) + cameraTileY * WORLD_TILE_SIZE / WORLD_SCALE,
      0,
    );
    for (const rig of worldRigs.values()) {
      if (immediate || rig.moveDuration <= 0) {
        rig.screenX = rig.targetX;
        rig.screenY = rig.targetY;
      } else {
        const progress = Math.min(1, Math.max(0, (sceneNow - rig.moveStartedAt) / rig.moveDuration));
        const eased = progress * progress * (3 - 2 * progress);
        rig.screenX = rig.fromX + (rig.targetX - rig.fromX) * eased;
        rig.screenY = rig.fromY + (rig.targetY - rig.fromY) * eased;
        if (progress === 1) rig.moveDuration = 0;
      }

      let attackOffsetX = 0;
      let attackOffsetY = 0;
      let attackScaleX = 1;
      let attackScaleY = 1;
      if (rig.attackDuration > 0) {
        const progress = Math.min(1, Math.max(0, (sceneNow - rig.attackStartedAt) / rig.attackDuration));
        if (immediate || progress === 1) {
          rig.attackDuration = 0;
          setWorldSprite(rig, rig.attackDirection, 0);
        } else {
          let reach: number;
          if (progress < .18) {
            const windup = progress / .18;
            reach = -.035 * windup * windup;
          } else if (progress < .46) {
            const strike = (progress - .18) / .28;
            reach = -.035 + .195 * strike * strike * (3 - 2 * strike);
          } else {
            const recoil = (progress - .46) / .54;
            reach = .16 * (1 - recoil * recoil * (3 - 2 * recoil));
          }
          attackOffsetX = rig.attackX * reach;
          attackOffsetY = rig.attackY * reach;
          const emphasis = Math.sin(Math.min(1, progress / .72) * Math.PI) * .08;
          attackScaleX = 1 + emphasis;
          attackScaleY = 1 - emphasis;
          setWorldSprite(rig, rig.attackDirection, progress < .72 ? 1 : 0);
        }
      }
      if (rig.root.parent !== objectRoot) {
        rig.surface.setLocalScale(
          WORLD_TILE_SIZE / WORLD_SCALE * attackScaleX,
          1,
          WORLD_TILE_SIZE * 1.5 / WORLD_SCALE * attackScaleY,
        );
      }
      rig.root.setLocalPosition(
        rig.screenX + attackOffsetX,
        rig.screenY + attackOffsetY,
        rig.root.parent === objectRoot ? .12 : .24 + rig.tile.y * .0002,
      );
      const screenX = (rig.root.getPosition().x * WORLD_SCALE) + DESIGN_WIDTH / 2;
      const screenY = DESIGN_HEIGHT / 2 - (rig.root.getPosition().y * WORLD_SCALE);
      rig.root.enabled = rig.visible
        && screenX > MAP_VIEW.x - WORLD_TILE_SIZE
        && screenX < MAP_VIEW.x + MAP_VIEW.width + WORLD_TILE_SIZE
        && screenY > MAP_VIEW.y - WORLD_TILE_SIZE * 1.5
        && screenY < MAP_VIEW.y + MAP_VIEW.height + WORLD_TILE_SIZE;
      rig.selection.enabled = rig.root.enabled && selectedWorldId === rig.id;
    }
  }

  function actorAnchor(actor: string | undefined): [number, number] | null {
    if (!actor) return null;
    const rig = worldRigs.get(actor);
    if (!rig || !rig.root.enabled) return null;
    const position = rig.root.getPosition();
    return [position.x, position.y];
  }

  function spawnEffect(event: WorldEvent): void {
    if (
      reducedMotion
      || (!event.actor && !event.target)
      || (event.amount ?? 1) <= 0
      || (
        event.kind !== 'damage'
        && event.kind !== 'block'
        && event.kind !== 'heal'
        && event.kind !== 'exposed'
        && event.kind !== 'ringing'
        && event.kind !== 'energy'
        && event.kind !== 'draw'
        && event.kind !== 'discard'
      )
    ) return;
    const actor = event.target ?? event.actor;
    const anchor = actorAnchor(actor);
    if (!anchor) return;
    const [anchorX, anchorY] = anchor;
    const root = new Entity(`Combat_${event.kind}_Effect`, app);
    root.setPosition(anchorX, anchorY, 1.45);
    app.root.addChild(root);
    const parts: EffectPart[] = [];
    const addPart = (
      name: string,
      material: StandardMaterial,
      x: number,
      y: number,
      width: number,
      height: number,
      rotation = 0,
      vx = 0,
      vy = 0,
      growth = 0,
      spin = 0,
      round = false,
    ): void => {
      const z = parts.length * .002;
      const entity = primitive(
        app,
        root,
        name,
        round ? 'cylinder' : 'box',
        [x, y, z],
        round ? [width, .022, width] : [width, height, .028],
        material,
      );
      setMapClip(entity);
      if (round) entity.setLocalEulerAngles(90, 0, rotation);
      else entity.setLocalEulerAngles(0, 0, rotation);
      parts.push({ entity, x, y, z, vx, vy, width, height, growth, rotation, spin, round });
    };

    let duration = .42;
    if (event.kind === 'damage') {
      const critical = Boolean(event.critical);
      const rayCount = critical ? 9 : 6;
      duration = critical ? .52 : .36;
      addPart('Ink_Impact_Core', inkEffectMaterial, 0, 0, critical ? .52 : .4, .16, 0, 0, 0, .3, 0, true);
      addPart('Impact_Color_Core', critical ? criticalEffectMaterial : damageEffectMaterial, 0, 0, critical ? .32 : .24, .1, 0, 0, 0, .15, 0, true);
      for (let index = 0; index < rayCount; index++) {
        const angle = index * 360 / rayCount + (critical ? 10 : 0);
        const radians = angle * Math.PI / 180;
        const radius = critical ? .46 : .36;
        addPart(
          critical ? 'Critical_Ink_Ray' : 'Damage_Ink_Ray',
          index % 2 ? inkEffectMaterial : critical ? criticalEffectMaterial : damageEffectMaterial,
          Math.cos(radians) * radius,
          Math.sin(radians) * radius,
          critical ? .58 : .44,
          index % 2 ? .055 : .085,
          angle,
          Math.cos(radians) * .7,
          Math.sin(radians) * .7,
          .22,
        );
      }
    } else if (event.kind === 'block') {
      duration = .48;
      addPart('Block_Ink_Backplate', inkEffectMaterial, 0, 0, .82, .1, 0, 0, 0, .22, 0, true);
      addPart('Block_Teal_Face', blockEffectMaterial, 0, 0, .64, .1, 0, 0, 0, .18, 0, true);
      for (const [x, y, rotation] of [[-.42, .34, -35], [.42, .34, 35], [-.42, -.34, 35], [.42, -.34, -35]] as const) {
        addPart('Block_Brace', blockEffectMaterial, x, y, .34, .075, rotation, x * .35, y * .35, .08);
      }
    } else if (event.kind === 'heal') {
      duration = .62;
      for (let index = 0; index < 3; index++) {
        const x = (index - 1) * .44;
        const y = -.25 + Math.abs(index - 1) * .12;
        addPart('Healing_Plus', inkEffectMaterial, x, y, .34, .14, 0, x * .12, .72 + index * .08, -.25);
        addPart('Healing_Plus', healEffectMaterial, x, y, .12, .34, 0, x * .12, .72 + index * .08, -.25);
      }
    } else if (event.kind === 'exposed') {
      duration = .58;
      addPart('Exposed_Focus', exposedEffectMaterial, 0, 0, .22, .1, 0, 0, 0, .35, 0, true);
      for (const [x, y, rotation] of [[-.48, .36, 45], [.48, .36, 135], [-.48, -.36, -45], [.48, -.36, -135]] as const) {
        addPart('Exposed_Corner', x < 0 ? inkEffectMaterial : exposedEffectMaterial, x, y, .38, .08, rotation, x * .28, y * .28, .12);
      }
    } else if (event.kind === 'ringing') {
      duration = .68;
      addPart('Ringing_Ink_Bell', inkEffectMaterial, 0, .08, .58, .11, 0, 0, .15, .65, 0, true);
      addPart('Ringing_Violet_Pulse', ringingEffectMaterial, 0, .08, .4, .1, 0, 0, .15, .9, 0, true);
      addPart('Ringing_Clapper', criticalEffectMaterial, 0, -.32, .13, .18, 0, 0, -.12, -.2, 90);
      addPart('Ringing_Line', ringingEffectMaterial, -.52, .38, .38, .07, 40, -.32, .3, .25);
      addPart('Ringing_Line', ringingEffectMaterial, .52, .38, .38, .07, -40, .32, .3, .25);
    } else if (event.kind === 'energy') {
      duration = .56;
      for (let index = 0; index < 5; index++) {
        const angle = index * 72 * Math.PI / 180;
        addPart('Energy_Spark', index % 2 ? energyEffectMaterial : inkEffectMaterial,
          Math.cos(angle) * .38, Math.sin(angle) * .26, .16, .07,
          angle * 180 / Math.PI, Math.cos(angle) * .3, .55 + Math.sin(angle) * .18, -.18, 150);
      }
    } else if (event.kind === 'draw' || event.kind === 'discard') {
      duration = .46;
      const material = event.kind === 'draw' ? energyEffectMaterial : discardEffectMaterial;
      for (let index = 0; index < 5; index++) {
        const angle = (-140 + index * 25) * Math.PI / 180;
        addPart(event.kind === 'draw' ? 'Deal_Card_Puff' : 'Discard_Card_Puff', index % 2 ? inkEffectMaterial : material,
          0, 0, .22, .1, angle * 180 / Math.PI, Math.cos(angle) * .75, Math.sin(angle) * .75 + .28, -.3, 120);
      }
    } else {
      root.destroy();
      return;
    }
    effects.push({ root, parts, age: 0, duration });
    if (effects.length > 12) effects.shift()!.root.destroy();
  }


  function cardTextureKey(visual: CardVisual): string {
    if (visual.echo) return 'echo';
    const characterColor = visual.definition.characterColor ?? '#e97a2d';
    const rarity = visual.definition.rarity ?? 'common';
    const forecast = visual.forecast;
    const forecastKey = forecast
      ? `${forecast.amounts.join(',')}|${forecast.criticalAmounts?.join(',') ?? ''}|${forecast.canceled ? 1 : 0}`
      : '';
    return `${visual.locked ? 'locked' : 'player'}:${visual.definition.id}:color:${characterColor}:rarity:${rarity}:level:${visual.upgradeLevel}:targets:${visual.targets.length > 0}:dimmed:${visual.dimmed}:forecast:${forecastKey}`;
  }

  function getCardTexture(visual: CardVisual, key = cardTextureKey(visual)): Texture {
    if (visual.echo) return echoCardBackTexture;
    let texture = cardTextures.get(key);
    if (!texture) {
      const regions: CardTermRegion[] = [];
      texture = textureFromCanvas(
        app,
        drawCardArt(visual.definition, visual.locked, visual.upgradeLevel, visual.targets.length > 0, visual.dimmed, regions, visual.forecast),
        `${visual.locked ? 'Locked intent' : 'Card'} ${visual.definition.name}`,
      );
      cardTextures.set(key, texture);
      cardTermRegions.set(key, regions);
    }
    return texture;
  }
  function energyBadgeMaterial(visual: CardVisual): StandardMaterial {
    const key = `energy:${visual.definition.cost}:dimmed:${visual.dimmed}`;
    let material = energyBadgeMaterials.get(key);
    if (!material) {
      const texture = textureFromCanvas(app, drawEnergyBadge(visual.definition.cost, visual.dimmed), key);
      cardTextures.set(key, texture);
      material = texturedMaterial(texture, true, .025);
      energyBadgeMaterials.set(key, material);
      material.specular = new Color(0, 0, 0);
      material.clearCoat = 0;
      material.update();
      enableCardClipping(material);
    }
    return material;
  }

  function positionCardDots(rig: CardRig): void {
    const diameter = rig.displayedWidth * .12 / WORLD_SCALE;
    for (let index = 0; index < rig.dots.length; index++) {
      const dot = rig.dots[index];
      const normalizedX = .5 + (index - (rig.dots.length - 1) / 2) * CARD_TARGET_GAP;
      dot.root.setLocalPosition(
        (normalizedX - .5) * rig.displayedWidth / WORLD_SCALE,
        (.5 - CARD_TARGET_Y) * rig.displayedHeight / WORLD_SCALE,
        .04,
      );
      dot.ring.setLocalScale(diameter, .016, diameter);
      dot.well.setLocalScale(diameter * .56, .012, diameter * .56);
    }
  }
  function syncCardVisibility(rig: CardRig): void {
    const clip = rig.visual.clip;
    if (clip) {
      rig.clipRect[0] = worldX(clip.x);
      rig.clipRect[1] = worldY(clip.y + clip.height);
      rig.clipRect[2] = worldX(clip.x + clip.width);
      rig.clipRect[3] = worldY(clip.y);
    } else {
      rig.clipRect.set(UNCLIPPED_RECT);
    }
    const fog = rig.visual.fog;
    if (fog && Number.isFinite(fog.left) && Number.isFinite(fog.right) && fog.right > fog.left) {
      rig.fogBounds[0] = worldX(fog.left);
      rig.fogBounds[1] = worldX(fog.right);
      rig.fogBounds[2] = Math.max(.001, Math.min(
        Number.isFinite(fog.feather) ? Math.max(0, fog.feather) / WORLD_SCALE : .001,
        (rig.fogBounds[1] - rig.fogBounds[0]) / 2,
      ));
      rig.fogBounds[3] = 1;
    } else {
      rig.fogBounds.set(UNFOGGED_BOUNDS);
    }
    for (const entity of [rig.surface, rig.backSurface, rig.energyBadge]) {
      applyCardParameters(entity, rig.clipRect, rig.fogBounds);
    }
    if (rig.edgeSurface) applyCardParameters(rig.edgeSurface, rig.clipRect, rig.fogBounds);
    if (rig.shadow) applyCardParameters(rig.shadow, rig.clipRect, rig.fogBounds);
    for (const dot of rig.dots) {
      applyCardParameters(dot.ring, rig.clipRect, rig.fogBounds);
      applyCardParameters(dot.well, rig.clipRect, rig.fogBounds);
    }
    if (rig.surface.render) rig.surface.render.castShadows = !fog && !rig.visual.echo;
    if (rig.backSurface.render) rig.backSurface.render.castShadows = !fog && !rig.visual.echo;
  }

  function syncCardDots(rig: CardRig): void {
    const targets = rig.visual.locked || rig.visual.echo ? [] : rig.visual.targets;
    const targetsChanged = rig.dots.length !== targets.length
      || rig.dots.some((dot, index) => dot.actor !== targets[index]);
    if (targetsChanged) {
      for (const dot of rig.dots) dot.root.destroy();
      rig.dots = targets.map((actor) => {
        const root = new Entity(`Target_Dot_${actor}`, app);
        rig.root.addChild(root);
        const ring = primitive(app, root, 'Target_Ring', 'cylinder', [0, 0, 0], [1, 1, 1], targetDimMaterial);
        ring.setLocalEulerAngles(90, 0, 0);
        const well = primitive(app, root, 'Target_Well', 'cylinder', [0, 0, .011], [1, 1, 1], targetWellMaterial);
        well.setLocalEulerAngles(90, 0, 0);
        return { actor, root, ring, well };
      });
    }
    for (const dot of rig.dots) {
      if (dot.ring.render) {
        dot.ring.render.material = rig.visual.target === dot.actor
          ? dot.actor === 'bob' ? targetAmberMaterial : targetTealMaterial
          : targetDimMaterial;
      }
    }
    positionCardDots(rig);
    syncCardVisibility(rig);
  }


  function syncCardMaterial(rig: CardRig): void {
    if (rig.visual.echo) {
      rig.energyBadge.enabled = false;
      if (rig.surface.render && rig.surface.render.material !== echoCardBackMaterial) {
        rig.surface.render.material = echoCardBackMaterial;
      }
      if (rig.backSurface.render && rig.backSurface.render.material !== echoCardBackMaterial) {
        rig.backSurface.render.material = echoCardBackMaterial;
      }
      return;
    }
    const glow = rig.visual.detail ? .14 : .025;
    if (rig.material.emissive.r !== glow) {
      rig.material.emissive = new Color(glow, glow, glow);
      rig.material.update();
    }
    rig.energyBadge.enabled = !rig.visual.locked;
    const badgeMaterial = energyBadgeMaterial(rig.visual);
    if (rig.energyBadge.render && rig.energyBadge.render.material !== badgeMaterial) {
      rig.energyBadge.render.material = badgeMaterial;
    }
    const backMaterial = rig.visual.locked ? enemyCardBackMaterial : builderCardBackMaterial;
    if (rig.backSurface.render && rig.backSurface.render.material !== backMaterial) {
      rig.backSurface.render.material = backMaterial;
    }
  }

  function scaleCardFaces(rig: CardRig): void {
    if (rig.shadow) {
      rig.shadow.setLocalScale(
        rig.displayedWidth * 256 / 236 / WORLD_SCALE,
        1,
        rig.displayedHeight * 384 / 364 / WORLD_SCALE,
      );
      rig.shadow.setLocalPosition(
        rig.displayedWidth * .015 / WORLD_SCALE,
        -rig.displayedHeight * .018 / WORLD_SCALE,
        Math.cos(rig.flip.value * Math.PI / 180) >= 0 ? -.008 : .008,
      );
    }
    rig.surface.setLocalScale(
      rig.displayedWidth / WORLD_SCALE,
      1,
      rig.displayedHeight / WORLD_SCALE,
    );
    rig.backSurface.setLocalScale(
      rig.displayedWidth / WORLD_SCALE,
      1,
      rig.displayedHeight / WORLD_SCALE,
    );
    rig.edgeSurface?.setLocalScale(
      rig.displayedWidth * 1.018 / WORLD_SCALE,
      1,
      rig.displayedHeight * 1.013 / WORLD_SCALE,
    );
    const diameter = rig.displayedWidth * .18 / WORLD_SCALE;
    // A square face keeps the badge round regardless of the card's aspect ratio.
    rig.energyBadge.setLocalScale(diameter, 1, diameter);
    rig.energyBadge.setLocalPosition(
      -rig.displayedWidth / (2 * WORLD_SCALE) + diameter / 4,
      rig.displayedHeight / (2 * WORLD_SCALE) - diameter / 4,
      .0065,
    );
    positionCardDots(rig);
  }

  function makeCard(visual: CardVisual, layer: number): CardRig {
    const echo = Boolean(visual.echo);
    const textureKey = cardTextureKey(visual);
    const material = echo ? echoCardBackMaterial : texturedMaterial(getCardTexture(visual, textureKey), true, .025);
    if (!echo) {
      material.opacity = 1;
      material.specular = new Color(.16, .14, .1);
      material.gloss = .38;
      material.clearCoat = .08;
      material.clearCoatGloss = .4;
      enableCardClipping(material);
    }
    const root = new Entity(`Card_${visual.uid}`, app);
    const shadow = echo ? null : primitive(app, root, 'Soft_Card_Shadow', 'plane', [0, 0, -.008], [1, 1, 1], cardShadowMaterial);
    shadow?.setLocalEulerAngles(90, 0, 0);
    const edgeSurface = echo ? null : primitive(
      app,
      root,
      'Ink_Card_Edge',
      'plane',
      [0, 0, 0],
      [visual.width * 1.018 / WORLD_SCALE, 1, visual.height * 1.013 / WORLD_SCALE],
      cardEdgeMaterial,
    );
    edgeSurface?.setLocalEulerAngles(90, 0, 0);
    const surface = primitive(app, root, echo ? 'Anonymous_Afterimage_Front' : 'Printed_Lit_Card_Front', 'plane', [0, 0, .006], [visual.width / WORLD_SCALE, 1, visual.height / WORLD_SCALE], material, !echo && !visual.fog);
    surface.setLocalEulerAngles(90, 0, 0);
    const backMaterial = echo ? echoCardBackMaterial : visual.locked ? enemyCardBackMaterial : builderCardBackMaterial;
    const backSurface = primitive(app, root, echo ? 'Anonymous_Afterimage_Back' : 'Printed_Lit_Card_Back', 'plane', [0, 0, -.006], [visual.width / WORLD_SCALE, 1, visual.height / WORLD_SCALE], backMaterial, !echo && !visual.fog);
    backSurface.setLocalEulerAngles(90, 180, 0);
    const energyBadge = primitive(app, root, 'Corner_Energy_Badge', 'plane', [0, 0, .0065], [1, 1, 1], echo ? echoCardBackMaterial : energyBadgeMaterial(visual));
    energyBadge.setLocalEulerAngles(90, 0, 0);
    const targetPose = cardPose(visual);
    const initialDepth = visual.dragged ? 1.5 : visual.hovered ? .55 : visual.queued ? .08 : 0;
    root.setPosition(targetPose.x, targetPose.y, visual.detail ? 5 : 2.5 + layer * .002 + initialDepth);
    root.setEulerAngles(0, targetPose.flip, targetPose.roll);
    app.root.addChild(root);
    const rig: CardRig = {
      root,
      surface,
      backSurface,
      edgeSurface,
      shadow,
      energyBadge,
      material,
      dots: [],
      textureKey,
      visual,
      clipRect: new Float32Array(UNCLIPPED_RECT),
      fogBounds: new Float32Array(UNFOGGED_BOUNDS),
      ownsMaterial: !echo,
      layer,
      x: { value: targetPose.x, velocity: 0 },
      y: { value: targetPose.y, velocity: 0 },
      roll: { value: targetPose.roll, velocity: 0 },
      flip: { value: targetPose.flip, velocity: 0 },
      depth: { value: initialDepth, velocity: 0 },
      displayedWidth: visual.width,
      displayedHeight: visual.height,
      widthVelocity: 0,
      heightVelocity: 0,
      targetPose,
      transition: null,
    };
    syncCardMaterial(rig);
    syncCardDots(rig);
    return rig;
  }
  function desiredCardRotation(visual: CardVisual): number {
    return visual.dragged || visual.queued ? 0 : visual.rotation;
  }

  function cardPose(visual: CardVisual): CardPose {
    return {
      x: worldX(visual.x + visual.width / 2),
      y: worldY(visual.y + visual.height / 2),
      roll: -desiredCardRotation(visual),
      flip: visual.flip ?? 0,
      width: visual.width,
      height: visual.height,
    };
  }

  function snapCardPose(rig: CardRig): void {
    snap(rig.x, rig.targetPose.x);
    snap(rig.y, rig.targetPose.y);
    snap(rig.roll, rig.targetPose.roll);
    snap(rig.flip, rig.targetPose.flip);
    rig.displayedWidth = rig.targetPose.width;
    rig.displayedHeight = rig.targetPose.height;
    rig.transition = null;
    rig.widthVelocity = 0;
    rig.heightVelocity = 0;
  }

  function shiftCardTarget(rig: CardRig, targetPose: CardPose): void {
    rig.x.value += targetPose.x - rig.targetPose.x;
    rig.y.value += targetPose.y - rig.targetPose.y;
    rig.roll.value += angleOffset(targetPose.roll, rig.targetPose.roll);
    rig.flip.value += angleOffset(targetPose.flip, rig.targetPose.flip);
    rig.displayedWidth += targetPose.width - rig.targetPose.width;
    rig.displayedHeight += targetPose.height - rig.targetPose.height;
    rig.targetPose = targetPose;
  }

  function startCardTransition(rig: CardRig, targetPose: CardPose, durationMs: number): void {
    rig.targetPose = targetPose;
    rig.transition = {
      startedAt: sceneNow,
      durationMs,
      offset: {
        x: rig.x.value - targetPose.x,
        y: rig.y.value - targetPose.y,
        roll: angleOffset(rig.roll.value, targetPose.roll),
        flip: angleOffset(rig.flip.value, targetPose.flip),
        width: rig.displayedWidth - targetPose.width,
        height: rig.displayedHeight - targetPose.height,
      },
    };
    rig.x.velocity = 0;
    rig.y.velocity = 0;
    rig.roll.velocity = 0;
    rig.flip.velocity = 0;
    rig.widthVelocity = 0;
    rig.heightVelocity = 0;
  }


  function positionCard(rig: CardRig, dt: number, now: number, immediate: boolean): void {
    const visual = rig.visual;
    if (immediate) {
      snapCardPose(rig);
    } else if (rig.transition) {
      const transition = rig.transition;
      const elapsedMs = Math.min(transition.durationMs, Math.max(0, now - transition.startedAt));
      const progress = elapsedMs / transition.durationMs;
      const eased = progress * progress * (3 - 2 * progress);
      const remaining = 1 - eased;
      rig.x.value = rig.targetPose.x + transition.offset.x * remaining;
      rig.y.value = rig.targetPose.y + transition.offset.y * remaining;
      rig.roll.value = rig.targetPose.roll + transition.offset.roll * remaining;
      rig.flip.value = rig.targetPose.flip + transition.offset.flip * remaining;
      rig.displayedWidth = rig.targetPose.width + transition.offset.width * remaining;
      rig.displayedHeight = rig.targetPose.height + transition.offset.height * remaining;
      if (elapsedMs === transition.durationMs) snapCardPose(rig);
    } else if (visual.dragged) {
      snap(rig.x, rig.targetPose.x);
      snap(rig.y, rig.targetPose.y);
      followCritical(rig.roll, rig.roll.value - angleOffset(rig.roll.value, rig.targetPose.roll), dt);
      followCritical(rig.flip, rig.flip.value - angleOffset(rig.flip.value, rig.targetPose.flip), dt);
      const widthOffset = rig.displayedWidth - rig.targetPose.width;
      const widthDecay = Math.exp(-24 * dt);
      const widthImpulse = (rig.widthVelocity + 24 * widthOffset) * dt;
      rig.displayedWidth = rig.targetPose.width + (widthOffset + widthImpulse) * widthDecay;
      rig.widthVelocity = (rig.widthVelocity - 24 * widthImpulse) * widthDecay;
      const heightOffset = rig.displayedHeight - rig.targetPose.height;
      const heightImpulse = (rig.heightVelocity + 24 * heightOffset) * dt;
      rig.displayedHeight = rig.targetPose.height + (heightOffset + heightImpulse) * widthDecay;
      rig.heightVelocity = (rig.heightVelocity - 24 * heightImpulse) * widthDecay;
    } else {
      snapCardPose(rig);
    }
    const desiredDepth = visual.dragged ? 1.5 : visual.hovered ? .55 : visual.queued ? .08 : 0;
    if (immediate) snap(rig.depth, desiredDepth);
    else followCritical(rig.depth, desiredDepth, dt, 20);
    rig.root.setPosition(
      rig.x.value,
      rig.y.value,
      visual.detail ? 5 : 2.5 + rig.layer * .002 + rig.depth.value,
    );
    rig.root.setEulerAngles(0, rig.flip.value, rig.roll.value);
    scaleCardFaces(rig);
    const frontVisible = Math.cos(rig.flip.value * Math.PI / 180) > 0;
    for (const dot of rig.dots) dot.root.enabled = frontVisible;
  }

  const attachmentOffset = new Vec3();
  const displayedAttachmentOffset = new Vec3();

  function positionAttachedCard(rig: CardRig, host: CardRig): void {
    const visual = rig.visual;
    const hostVisual = host.visual;
    const hostTargetRotation = desiredCardRotation(hostVisual) * Math.PI / 180;
    const targetX = visual.x + visual.width / 2 - hostVisual.x - hostVisual.width / 2;
    const targetY = visual.y + visual.height / 2 - hostVisual.y - hostVisual.height / 2;
    const targetCos = Math.cos(hostTargetRotation);
    const targetSin = Math.sin(hostTargetRotation);
    const localX = (targetCos * targetX + targetSin * targetY) * host.displayedWidth / hostVisual.width;
    const localY = (-targetSin * targetX + targetCos * targetY) * host.displayedHeight / hostVisual.height;
    attachmentOffset.set(localX / WORLD_SCALE, -localY / WORLD_SCALE, 0);
    host.root.getRotation().transformVector(attachmentOffset, displayedAttachmentOffset);
    snap(rig.x, host.x.value + displayedAttachmentOffset.x);
    snap(rig.y, host.y.value + displayedAttachmentOffset.y);
    snap(rig.roll, host.roll.value - visual.rotation + desiredCardRotation(hostVisual));
    snap(rig.flip, host.flip.value);
    rig.displayedWidth = visual.width * host.displayedWidth / hostVisual.width;
    rig.displayedHeight = visual.height * host.displayedHeight / hostVisual.height;
    rig.root.setPosition(
      rig.x.value,
      rig.y.value,
      host.root.getPosition().z - .012 - Math.max(1, host.layer - rig.layer) * .0002,
    );
    rig.root.setEulerAngles(0, rig.flip.value, rig.roll.value);
    scaleCardFaces(rig);
    const frontVisible = Math.cos(rig.flip.value * Math.PI / 180) > 0;
    for (const dot of rig.dots) dot.root.enabled = frontVisible;
  }


  function update(dtRaw: number): void {
    if (paused) return;
    const dt = Math.min(dtRaw, .05);
    sceneNow += dt * 1000;
    positionWorld();

    for (let index = effects.length - 1; index >= 0; index--) {
      const effect = effects[index];
      effect.age += dt;
      if (effect.age >= effect.duration) {
        effect.root.destroy();
        effects.splice(index, 1);
        continue;
      }
      const progress = effect.age / effect.duration;
      const tail = progress < .72 ? 1 : Math.max(0, (1 - progress) / .28);
      for (const part of effect.parts) {
        const scale = Math.max(.015, (1 + part.growth * progress) * tail);
        part.entity.setLocalPosition(part.x + part.vx * effect.age, part.y + part.vy * effect.age, part.z);
        part.entity.setLocalScale(
          part.width * scale,
          part.round ? .022 : part.height * scale,
          part.round ? part.width * scale : .028,
        );
        part.entity.setLocalEulerAngles(part.round ? 90 : 0, 0, part.rotation + part.spin * effect.age);
      }
    }

    for (const rig of cards.values()) {
      if (!rig.visual.underCard) positionCard(rig, dt, sceneNow, reducedMotion);
    }
    for (const rig of cards.values()) {
      if (!rig.visual.underCard) continue;
      const host = cards.get(rig.visual.underCard);
      if (host) positionAttachedCard(rig, host);
      else positionCard(rig, dt, sceneNow, reducedMotion);
    }
  }

  app.on('update', update);

  function syncSize(): void {
    if (destroyed) return;
    const host = canvas.parentElement ?? canvas;
    const bounds = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width || canvas.clientWidth || DESIGN_WIDTH));
    const height = Math.max(1, Math.round(bounds.height || canvas.clientHeight || DESIGN_HEIGHT));
    app.graphicsDevice.resizeCanvas(width, height);
  }
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncSize);
  resizeObserver?.observe(canvas.parentElement ?? canvas);
  window.addEventListener('resize', syncSize);
  syncSize();
  app.start();

  return {
    setPresentation(options): void {
      if (destroyed) return;
      paused = options.paused;
      if (reducedMotion === options.reducedMotion) return;
      reducedMotion = options.reducedMotion;
      if (!reducedMotion) return;
      for (const effect of effects) effect.root.destroy();
      effects.length = 0;
      resetWorldActions();
      positionWorld(true);
      for (const rig of cards.values()) {
        if (!rig.visual.underCard) positionCard(rig, 0, sceneNow, true);
      }
      for (const rig of cards.values()) {
        if (!rig.visual.underCard) continue;
        const host = cards.get(rig.visual.underCard);
        if (host) positionAttachedCard(rig, host);
        else positionCard(rig, 0, sceneNow, true);
      }
    },

    setCards(visuals): void {
      if (destroyed) return;
      detailScrim.enabled = visuals.some((visual) => visual.detail);
      const live = new Set(visuals.map((visual) => visual.uid));
      for (const [uid, rig] of cards) {
        if (live.has(uid)) continue;
        rig.root.destroy();
        if (rig.ownsMaterial) rig.material.destroy();
        cards.delete(uid);
      }
      for (let layer = 0; layer < visuals.length; layer++) {
        const visual = visuals[layer];
        let rig = cards.get(visual.uid);
        if (rig && Boolean(rig.visual.echo) !== Boolean(visual.echo)) {
          rig.root.destroy();
          if (rig.ownsMaterial) rig.material.destroy();
          cards.delete(visual.uid);
          rig = undefined;
        }
        if (!rig) {
          rig = makeCard(visual, layer);
          cards.set(visual.uid, rig);
        } else {
          const previousVisual = rig.visual;
          const nextPose = cardPose(visual);
          const sameTimelineAnchor = visual.timelinePosition !== undefined
            && previousVisual.timelinePosition === visual.timelinePosition;
          const layoutModeChanged = previousVisual.timelinePosition !== visual.timelinePosition
            || previousVisual.dragged !== visual.dragged
            || previousVisual.queued !== visual.queued
            || previousVisual.detail !== visual.detail;
          const explicitImmediate = visual.transitionMs !== undefined && visual.transitionMs <= 0;
          if (reducedMotion || visual.snap || explicitImmediate) {
            rig.targetPose = nextPose;
            snapCardPose(rig);
          } else if (sameTimelineAnchor && !visual.dragged) {
            shiftCardTarget(rig, nextPose);
          } else if (!samePose(rig.targetPose, nextPose) || layoutModeChanged) {
            if (visual.dragged) {
              if (!previousVisual.dragged) {
                startCardTransition(rig, nextPose, CARD_MOTION.layout);
              } else {
                // Move the pickup endpoint without restarting its clock or shifting its start.
                if (rig.transition) {
                  rig.transition.offset.x += rig.targetPose.x - nextPose.x;
                  rig.transition.offset.y += rig.targetPose.y - nextPose.y;
                }
                rig.targetPose = nextPose;
              }
            } else {
              startCardTransition(rig, nextPose, visual.transitionMs ?? CARD_MOTION.layout);
            }
          } else {
            rig.targetPose = nextPose;
          }
          const textureKey = cardTextureKey(visual);
          if (rig.textureKey !== textureKey) {
            const texture = getCardTexture(visual, textureKey);
            rig.material.diffuseMap = texture;
            rig.material.emissiveMap = texture;
            rig.material.opacityMap = texture;
            rig.material.update();
            rig.textureKey = textureKey;
          }
          rig.visual = visual;
          rig.layer = layer;
          syncCardMaterial(rig);
          syncCardDots(rig);
        }
      }
      for (const rig of cards.values()) {
        if (!rig.visual.underCard) positionCard(rig, 0, sceneNow, reducedMotion);
      }
      for (const rig of cards.values()) {
        if (!rig.visual.underCard) continue;
        const host = cards.get(rig.visual.underCard);
        if (host) positionAttachedCard(rig, host);
        else positionCard(rig, 0, sceneNow, reducedMotion);
      }
      const liveTextureKeys = new Set([...cards.values()].map((rig) => rig.textureKey));
      for (const [key, texture] of cardTextures) {
        if (!key.includes(':forecast:') || key.endsWith(':forecast:') || liveTextureKeys.has(key)) continue;
        texture.destroy();
        cardTextures.delete(key);
        cardTermRegions.delete(key);
      }
    },

    setState(state: WorldState, snap: boolean): void {
      if (!destroyed) syncWorld(state, snap);
    },

    setPointer(_x: number, _y: number): void {},

    setTarget(nextTarget: string | null): void {
      if (destroyed || selectedWorldId === nextTarget) return;
      selectedWorldId = nextTarget;
      for (const rig of worldRigs.values()) {
        rig.selection.enabled = rig.root.enabled && selectedWorldId === rig.id;
      }
    },

    getCardPose(uid) {
      const rig = cards.get(uid);
      if (!rig || destroyed) return null;
      const centerX = rig.x.value * WORLD_SCALE + DESIGN_WIDTH / 2;
      const centerY = DESIGN_HEIGHT / 2 - rig.y.value * WORLD_SCALE;
      return {
        x: centerX - rig.displayedWidth / 2,
        y: centerY - rig.displayedHeight / 2,
        width: rig.displayedWidth,
        height: rig.displayedHeight,
        rotation: -rig.roll.value,
        flip: rig.flip.value,
      };
    },

    getCardTermAt(uid, x, y) {
      const rig = cards.get(uid);
      if (!rig || destroyed || rig.visual.echo || !rig.root.enabled || !rig.surface.enabled) return null;
      const flipScale = Math.cos(rig.flip.value * Math.PI / 180);
      if (flipScale <= .001) return null;
      const clip = rig.visual.clip;
      if (clip && (x < clip.x || x > clip.x + clip.width || y < clip.y || y > clip.y + clip.height)) return null;
      const fog = rig.visual.fog;
      if (fog && (x <= fog.left || x >= fog.right)) return null;

      const centerX = rig.x.value * WORLD_SCALE + DESIGN_WIDTH / 2;
      const centerY = DESIGN_HEIGHT / 2 - rig.y.value * WORLD_SCALE;
      const rotation = -rig.roll.value * Math.PI / 180;
      const dx = x - centerX;
      const dy = y - centerY;
      const localX = (Math.cos(rotation) * dx + Math.sin(rotation) * dy) / flipScale;
      const localY = -Math.sin(rotation) * dx + Math.cos(rotation) * dy;
      const normalizedX = .5 + localX / rig.displayedWidth;
      const normalizedY = .5 + localY / rig.displayedHeight;
      for (const region of cardTermRegions.get(rig.textureKey) ?? []) {
        if (
          normalizedX >= region.x
          && normalizedX <= region.x + region.width
          && normalizedY >= region.y
          && normalizedY <= region.y + region.height
        ) return region.term;
      }
      return null;
    },
    getWorldPose(entityId) {
      const rig = worldRigs.get(entityId);
      if (!rig || destroyed || !rig.root.enabled) return null;
      const position = rig.root.getPosition();
      return {
        x: position.x * WORLD_SCALE + DESIGN_WIDTH / 2,
        y: DESIGN_HEIGHT / 2 - position.y * WORLD_SCALE,
      };
    },

    playEvent(event: WorldEvent): void {
      if (destroyed || event.visible === false) return;
      if (event.kind === 'action' && event.actor && event.definition) {
        const rig = worldRigs.get(event.actor);
        if (!rig || rig.root.parent === objectRoot || !rig.root.enabled) return;
        const target = event.target && event.target !== event.actor ? worldRigs.get(event.target) : undefined;
        let attackX = 0;
        let attackY = 0;
        let direction = rig.facing;
        if (target?.root.enabled) {
          const actorPosition = rig.root.getLocalPosition();
          const targetPosition = target.root.getLocalPosition();
          const dx = targetPosition.x - actorPosition.x;
          const dy = targetPosition.y - actorPosition.y;
          if (Math.abs(dx) >= Math.abs(dy)) {
            attackX = dx < 0 ? -1 : 1;
            direction = attackX < 0 ? 'left' : 'right';
          } else {
            attackY = dy < 0 ? -1 : 1;
            direction = attackY < 0 ? 'down' : 'up';
          }
        }
        rig.attackStartedAt = sceneNow;
        rig.attackDuration = reducedMotion ? 0 : WORLD_ATTACK_MS;
        rig.attackX = attackX;
        rig.attackY = attackY;
        rig.attackDirection = direction;
        setWorldSprite(rig, direction, 1);
        positionWorld(reducedMotion);
        return;
      }
      if (event.kind === 'move' && event.actor && event.from && event.to) {
        const rig = worldRigs.get(event.actor);
        if (!rig) return;
        rig.attackDuration = 0;
        rig.attackX = 0;
        rig.attackY = 0;
        setWorldSprite(rig, rig.facing, event.tick);
        rig.fromX = localTileX(event.from);
        rig.fromY = localTileY(event.from, true);
        rig.screenX = rig.fromX;
        rig.screenY = rig.fromY;
        rig.targetX = localTileX(event.to);
        rig.targetY = localTileY(event.to, true);
        rig.tile.x = event.to.x;
        rig.tile.y = event.to.y;
        rig.moveStartedAt = sceneNow;
        rig.moveDuration = reducedMotion ? 0 : WORLD_MOVE_MS;
        positionWorld(reducedMotion);
        return;
      }
      if (event.kind === 'rewind') {
        resetWorldPresentation();
        return;
      }
      spawnEffect(event);
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncSize);
      app.off('update', update);
      for (const effect of effects) effect.root.destroy();
      effects.length = 0;
      for (const rig of cards.values()) if (rig.ownsMaterial) rig.material.destroy();
      cards.clear();
      for (const texture of cardTextures.values()) texture.destroy();
      cardTextures.clear();
      cardTermRegions.clear();
      for (const material of energyBadgeMaterials.values()) material.destroy();
      energyBadgeMaterials.clear();
      builderCardBackMaterial.destroy();
      builderCardBackTexture.destroy();
      enemyCardBackMaterial.destroy();
      enemyCardBackTexture.destroy();
      echoCardBackMaterial.destroy();
      echoCardBackTexture.destroy();
      cardShadowMaterial.destroy();
      cardShadowTexture.destroy();
      cardEdgeMaterial.destroy();
      inkEffectMaterial.destroy();
      damageEffectMaterial.destroy();
      criticalEffectMaterial.destroy();
      blockEffectMaterial.destroy();
      healEffectMaterial.destroy();
      exposedEffectMaterial.destroy();
      ringingEffectMaterial.destroy();
      energyEffectMaterial.destroy();
      discardEffectMaterial.destroy();
      detailScrimMaterial.destroy();
      for (const material of timelineMaterials) material.destroy();
      for (const material of worldMaterials.values()) material.destroy();
      for (const texture of worldTextures.values()) texture.destroy();
      worldMaterials.clear();
      worldTextures.clear();
      worldRigs.clear();
      mapMaterial?.destroy();
      mapTexture?.destroy();
      mapBackdropMaterial.destroy();
      selectedWorldMaterial.destroy();
      targetWellMaterial.destroy();
      targetDimMaterial.destroy();
      targetTealMaterial.destroy();
      targetAmberMaterial.destroy();
      app.destroy();
    },
  };
}
