import {
  Application,
  BLEND_ADDITIVE,
  BLEND_NORMAL,
  Color,
  CULLFACE_NONE,
  Entity,
  GAMMA_SRGB,
  PROJECTION_ORTHOGRAPHIC,
  StandardMaterial,
  Texture,
  TONEMAP_ACES,
} from 'playcanvas';
import {
  shipHandPoses,
  SHIP_CARD_DETAIL_SCALE,
  SHIP_CARD_LIFT,
  SHIP_CARD_SELECTED_SCALE,
  SHIP_DESIGN,
  SHIP_PILES,
  SHIP_SCREEN,
  SHIP_SELF_DROP,
  enemyShipPose,
  type EnemyShip,
  type ShipActor,
  type ShipBattleEvent,
  type ShipBattleState,
  type ShipCardVisual,
  type ShipScene,
} from './types';
import { drawBridgeArt, drawEnemyShipArt, drawPileTop, drawShipCardBack, drawShipCardFace } from './art';
import { cardDefinition, previewCard } from './combat';
import {
  AIM_RETICLE_SIZE,
  ENEMY_TELEMETRY_SIZE,
  PLAYER_TELEMETRY_SIZE,
  drawAimReticle,
  drawEnemyTelemetry,
  drawPlayerTelemetry,
  enemyHudTextureKey,
  enemyHudScaleKey,
  playerHudTextureKey,
} from './enemy-hud';

const WORLD_SCALE = 100;
const CARD_Z = 3;
const ENEMY_Z = 1.2;
// Pane feedback sits behind telemetry; both stay below cards throughout pickup easing.
const VIEWSCREEN_IMPACT_Z = 1.65;
const ENEMY_HUD_Z = 1.72;
const VIEWSCREEN_CENTER = {
  x: SHIP_SCREEN.x + SHIP_SCREEN.width / 2,
  y: SHIP_SCREEN.y + SHIP_SCREEN.height / 2,
};
const PLAYER_MUZZLES = [
  { x: SHIP_SCREEN.x + 24, y: SHIP_SCREEN.y + SHIP_SCREEN.height - 20 },
  { x: SHIP_SCREEN.x + SHIP_SCREEN.width - 24, y: SHIP_SCREEN.y + SHIP_SCREEN.height - 20 },
] as const;
const PLAYER_SYSTEM_SOURCE = {
  x: VIEWSCREEN_CENTER.x,
  y: SHIP_SCREEN.y + SHIP_SCREEN.height - 54,
};

type HudSurface = {
  entity: Entity;
  texture: Texture;
  key: string;
};

type EnemyRig = {
  root: Entity;
  hudRoot: Entity;
  telemetry: HudSurface;
};

type AimPhase = 'hidden' | 'fading' | 'arriving' | 'settled';

type CardRig = {
  root: Entity;
  shadow: Entity;
  edge: Entity;
  face: Entity;
  back: Entity;
  material: StandardMaterial;
  textureKey: string;
  visual: ShipCardVisual;
  x: number;
  y: number;
  z: number;
  flip: number;
  layer: number;
  following: boolean;
  targetX: number;
  targetY: number;
  previousTargetX: number;
  targetZ: number;
  targetRotation: number;
  targetScale: number;
  sway: number;
  rotation: number;
  scale: number;
  width: number;
  height: number;
};

type Flight = {
  root: Entity;
  startedAt: number;
  duration: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  z: number;
  arc: number;
  spin: number;
  scale: number;
  approaching: boolean;
};

type Impact = {
  root: Entity;
  startedAt: number;
  duration: number;
  x: number;
  y: number;
  baseScale: number;
  pane: boolean;
};

type CardMotion = {
  rig: CardRig;
  startedAt: number;
  duration: number;
  fromX: number;
  fromY: number;
  fromRotation: number;
  fromZ: number;
  fromFlip: number;
  fromScale: number;
  toX: number;
  toY: number;
  toRotation: number;
  toZ: number;
  toFlip: number;
  arc: number;
  toScale: number;
};

type Waiter = { frame: number; finish: (completed: boolean) => void };

type RecycleMotion = { root: Entity; startedAt: number; duration: number };

type ActivePresentation = { token: number; finalState: ShipBattleState };

function worldX(x: number): number {
  return (x - SHIP_DESIGN.width / 2) / WORLD_SCALE;
}

function worldY(y: number): number {
  return (SHIP_DESIGN.height / 2 - y) / WORLD_SCALE;
}

function cloneActor(actor: ShipActor): ShipActor {
  return { ...actor };
}

function cloneEnemy(enemy: EnemyShip): EnemyShip {
  return {
    ...enemy,
    sequence: enemy.sequence.map((intent) => ({ ...intent, effects: intent.effects.map((effect) => ({ ...effect })) })),
  };
}

function cloneState(state: ShipBattleState): ShipBattleState {
  return {
    ...state,
    player: cloneActor(state.player),
    enemies: state.enemies.map(cloneEnemy),
    hand: state.hand.map((card) => ({ ...card })),
    draw: state.draw.map((card) => ({ ...card })),
    discard: state.discard.map((card) => ({ ...card })),
    exhaust: state.exhaust.map((card) => ({ ...card })),
  };
}

function primitive(
  app: Application,
  parent: Entity,
  name: string,
  type: 'box' | 'plane' | 'sphere' | 'cylinder',
  position: [number, number, number],
  scale: [number, number, number],
  material: StandardMaterial,
  lit = true,
): Entity {
  const entity = new Entity(name, app);
  entity.addComponent('render', {
    type,
    material,
    castShadows: lit,
    receiveShadows: lit,
  });
  entity.setLocalPosition(...position);
  entity.setLocalScale(...scale);
  parent.addChild(entity);
  return entity;
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

function textureMaterial(texture: Texture, emissive = .03): StandardMaterial {
  const material = new StandardMaterial();
  material.diffuseMap = texture;
  material.diffuse = new Color(1, 1, 1);
  material.emissiveMap = texture;
  material.emissive = new Color(emissive, emissive, emissive);
  material.opacityMap = texture;
  material.opacityMapChannel = 'a';
  material.alphaTest = .03;
  material.blendType = BLEND_NORMAL;
  material.cull = CULLFACE_NONE;
  material.specular = new Color(.16, .18, .18);
  material.gloss = .42;
  material.clearCoat = .12;
  material.clearCoatGloss = .6;
  material.update();
  return material;
}

function solidMaterial(color: Color, emissive?: Color, transparent = false): StandardMaterial {
  const material = new StandardMaterial();
  material.diffuse = color.clone().linear();
  material.specular = new Color(.2, .2, .18).linear();
  material.gloss = .32;
  if (emissive) material.emissive = emissive.clone().linear();
  if (transparent) {
    material.blendType = BLEND_NORMAL;
    material.opacity = color.a;
    material.depthWrite = false;
  }
  material.update();
  return material;
}

function poseEntity(entity: Entity, x: number, y: number, z: number, rotation = 0): void {
  entity.setPosition(worldX(x), worldY(y), z);
  entity.setEulerAngles(0, 0, -rotation);
}

function eventRecipient(event: ShipBattleEvent): string {
  return event.targetId ?? event.actorId;
}

export function createShipScene(canvas: HTMLCanvasElement): ShipScene {
  const app = new Application(canvas, {
    graphicsDeviceOptions: { alpha: false, antialias: true, depth: true, stencil: false },
  });
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  app.scene.ambientLight = new Color(.23, .29, .34);
  app.scene.exposure = 1.05;

  const textures = new Set<Texture>();
  const materials = new Set<StandardMaterial>();
  const cards = new Map<string, CardRig>();
  const cardTextures = new Map<string, Texture>();
  const enemyRigs = new Map<string, EnemyRig>();
  const flights: Flight[] = [];
  const impacts: Impact[] = [];
  const cardMotions: CardMotion[] = [];
  const waiters = new Set<Waiter>();
  let nextPlayerMuzzle = 0;
  let displayedState: ShipBattleState | null = null;
  let destroyed = false;
  let sequence = 0;
  let activePresentation: ActivePresentation | null = null;
  let sceneNow = performance.now();
  let motionReduced = false;
  let recycleMotion: RecycleMotion | null = null;
  let cssScale = 1;
  let playerTelemetry: HudSurface | null = null;
  let aimCurrentId: string | null = null;
  let aimPendingId: string | null = null;
  let aimPhase: AimPhase = 'hidden';
  let aimPhaseStartedAt = sceneNow;
  let aimFadeFromOpacity = 0;

  const ownTexture = (texture: Texture): Texture => {
    textures.add(texture);
    return texture;
  };
  const ownMaterial = (material: StandardMaterial): StandardMaterial => {
    materials.add(material);
    return material;
  };

  const camera = new Entity('Ship_Bridge_Camera', app);
  camera.addComponent('camera', {
    clearColor: new Color(.01, .02, .035),
    projection: PROJECTION_ORTHOGRAPHIC,
    orthoHeight: SHIP_DESIGN.height / WORLD_SCALE / 2,
    nearClip: .1,
    farClip: 40,
    frustumCulling: true,
  });
  camera.setPosition(0, 0, 12);
  camera.lookAt(0, 0, 0);
  app.root.addChild(camera);
  if (camera.camera) {
    camera.camera.gammaCorrection = GAMMA_SRGB;
    camera.camera.toneMapping = TONEMAP_ACES;
  }

  const bridgeRoot = new Entity('Kestrel_Illustrated_Bridge', app);
  app.root.addChild(bridgeRoot);
  const bridgeTexture = ownTexture(textureFromCanvas(app, drawBridgeArt(), 'Kestrel bridge and spacefield composite'));
  const bridgeMaterial = ownMaterial(textureMaterial(bridgeTexture, .52));
  bridgeMaterial.useLighting = false;
  bridgeMaterial.specular = new Color(0, 0, 0);
  bridgeMaterial.clearCoat = 0;
  bridgeMaterial.update();
  const bridge = primitive(
    app,
    bridgeRoot,
    'Bridge_Viewsceen_Console_Art',
    'plane',
    [0, 0, 0],
    [SHIP_DESIGN.width / WORLD_SCALE, 1, SHIP_DESIGN.height / WORLD_SCALE],
    bridgeMaterial,
    false,
  );
  bridge.setLocalEulerAngles(90, 0, 0);

  // Deliberate cool key plus warm tabletop task light. Art remains emissive but cards retain depth.
  const keyLight = new Entity('Viewsceen_Cool_Key', app);
  keyLight.addComponent('light', {
    type: 'directional',
    color: new Color(.65, .82, 1),
    intensity: .72,
    castShadows: true,
    shadowResolution: 1024,
    shadowDistance: 18,
  });
  keyLight.setEulerAngles(22, -28, 18);
  app.root.addChild(keyLight);
  const tableLight = new Entity('Console_Warm_Task_Light', app);
  tableLight.addComponent('light', {
    type: 'omni',
    color: new Color(1, .79, .52),
    intensity: .78,
    range: 17,
    castShadows: false,
  });
  tableLight.setPosition(0, -4.2, 7);
  app.root.addChild(tableLight);

  const cardEdgeMaterial = ownMaterial(solidMaterial(new Color(.035, .055, .065), undefined));
  cardEdgeMaterial.cull = CULLFACE_NONE;
  cardEdgeMaterial.update();
  const cardBackTexture = ownTexture(textureFromCanvas(app, drawShipCardBack(), 'Kestrel tactical card back'));
  const cardBackMaterial = ownMaterial(textureMaterial(cardBackTexture, 1));
  cardBackMaterial.useLighting = false;
  cardBackMaterial.specular.set(0, 0, 0);
  cardBackMaterial.clearCoat = 0;
  cardBackMaterial.update();
  const shadowMaterial = ownMaterial(solidMaterial(new Color(0, 0, 0, .28), undefined, true));
  shadowMaterial.useLighting = false;
  shadowMaterial.cull = CULLFACE_NONE;
  shadowMaterial.update();

  const aimTexture = ownTexture(textureFromCanvas(app, drawAimReticle(), 'Proximity aim reticle'));
  const aimMaterial = ownMaterial(textureMaterial(aimTexture, .86));
  aimMaterial.useLighting = false;
  aimMaterial.specular.set(0, 0, 0);
  aimMaterial.clearCoat = 0;
  aimMaterial.depthWrite = false;
  aimMaterial.opacity = 0;
  aimMaterial.update();
  const aimRoot = new Entity('Proximity_Aim_Reticle', app);
  const aimPlane = primitive(
    app,
    aimRoot,
    'Cyan_Ring_And_Crosshair',
    'plane',
    [0, 0, 0],
    [AIM_RETICLE_SIZE / WORLD_SCALE, 1, AIM_RETICLE_SIZE / WORLD_SCALE],
    aimMaterial,
    false,
  );
  aimPlane.setLocalEulerAngles(90, 0, 0);
  aimRoot.enabled = false;
  app.root.addChild(aimRoot);
  const projectileMaterial = ownMaterial(solidMaterial(new Color(.74, .98, 1), new Color(.62, 1, 1)));
  projectileMaterial.useLighting = false;
  projectileMaterial.blendType = BLEND_ADDITIVE;
  projectileMaterial.update();
  const shieldProjectileMaterial = ownMaterial(solidMaterial(new Color(.45, 1, .78), new Color(.3, .9, .65)));
  shieldProjectileMaterial.useLighting = false;
  shieldProjectileMaterial.blendType = BLEND_ADDITIVE;
  shieldProjectileMaterial.update();
  const impactMaterial = ownMaterial(solidMaterial(new Color(1, .44, .22, .72), new Color(1, .23, .07), true));
  impactMaterial.useLighting = false;
  impactMaterial.blendType = BLEND_ADDITIVE;
  impactMaterial.cull = CULLFACE_NONE;
  impactMaterial.update();
  const shieldImpactMaterial = ownMaterial(solidMaterial(new Color(.25, .92, .78, .58), new Color(.12, .7, .61), true));
  shieldImpactMaterial.useLighting = false;
  shieldImpactMaterial.blendType = BLEND_ADDITIVE;
  shieldImpactMaterial.cull = CULLFACE_NONE;
  shieldImpactMaterial.update();
  const incomingProjectileMaterial = ownMaterial(solidMaterial(new Color(1, .38, .16), new Color(1, .18, .045)));
  incomingProjectileMaterial.useLighting = false;
  incomingProjectileMaterial.blendType = BLEND_ADDITIVE;
  incomingProjectileMaterial.update();
  const paneShieldMaterial = ownMaterial(solidMaterial(new Color(.12, .88, 1, .1), new Color(.08, .52, .72), true));
  paneShieldMaterial.useLighting = false;
  paneShieldMaterial.blendType = BLEND_NORMAL;
  paneShieldMaterial.cull = CULLFACE_NONE;
  paneShieldMaterial.update();
  const paneShieldRimMaterial = ownMaterial(solidMaterial(new Color(.22, .95, 1, .7), new Color(.12, .72, .92), true));
  paneShieldRimMaterial.useLighting = false;
  paneShieldRimMaterial.blendType = BLEND_NORMAL;
  paneShieldRimMaterial.cull = CULLFACE_NONE;
  paneShieldRimMaterial.update();
  const paneHullMaterial = ownMaterial(solidMaterial(new Color(1, .19, .06, .11), new Color(.72, .08, .015), true));
  paneHullMaterial.useLighting = false;
  paneHullMaterial.blendType = BLEND_NORMAL;
  paneHullMaterial.cull = CULLFACE_NONE;
  paneHullMaterial.update();
  const paneHullRimMaterial = ownMaterial(solidMaterial(new Color(1, .42, .16, .76), new Color(1, .16, .035), true));
  paneHullRimMaterial.useLighting = false;
  paneHullRimMaterial.blendType = BLEND_NORMAL;
  paneHullRimMaterial.cull = CULLFACE_NONE;
  paneHullRimMaterial.update();

  const detailScrimMaterial = ownMaterial(solidMaterial(new Color(0, 0, 0, .62), undefined, true));
  detailScrimMaterial.useLighting = false;
  detailScrimMaterial.cull = CULLFACE_NONE;
  detailScrimMaterial.update();
  const detailScrim = primitive(
    app,
    app.root,
    'Physical_Card_Detail_Scrim',
    'plane',
    [0, 0, 5.5],
    [SHIP_DESIGN.width / WORLD_SCALE, 1, SHIP_DESIGN.height / WORLD_SCALE],
    detailScrimMaterial,
    false,
  );
  detailScrim.setLocalEulerAngles(90, 0, 0);
  detailScrim.enabled = false;

  const pileRoot = new Entity('Physical_Card_Piles', app);
  app.root.addChild(pileRoot);
  const pileSurfaces = new Map<'draw' | 'discard' | 'exhaust', Entity[]>();
  const pileWells = new Map<'draw' | 'discard' | 'exhaust', Entity>();
  const wellMaterial = ownMaterial(solidMaterial(new Color(.32, .54, .52), new Color(.48, .72, .67)));
  wellMaterial.useLighting = false;
  wellMaterial.update();
  for (const kind of ['draw', 'discard', 'exhaust'] as const) {
    const pose = SHIP_PILES[kind];
    const well = new Entity(`${kind}_Empty_Pile_Outline`, app);
    poseEntity(well, pose.x, pose.y, 2.16);
    primitive(app, well, 'Top', 'box', [0, .93, 0], [1.34, .025, .01], wellMaterial, false);
    primitive(app, well, 'Bottom', 'box', [0, -.93, 0], [1.34, .025, .01], wellMaterial, false);
    primitive(app, well, 'Left', 'box', [-.657, 0, 0], [.025, 1.86, .01], wellMaterial, false);
    primitive(app, well, 'Right', 'box', [.657, 0, 0], [.025, 1.86, .01], wellMaterial, false);
    pileRoot.addChild(well);
    pileWells.set(kind, well);
    const texture = ownTexture(textureFromCanvas(app, drawPileTop(kind), `${kind} pile face`));
    const material = ownMaterial(textureMaterial(texture, 1));
    material.useLighting = false;
    material.specular.set(0, 0, 0);
    material.clearCoat = 0;
    material.update();
    const stack: Entity[] = [];
    for (let layer = 0; layer < 4; layer++) {
      const root = new Entity(`${kind}_Pile_Card_${layer + 1}`, app);
      const edge = primitive(app, root, 'Cardstock_Edge', 'box', [0, 0, 0], [1.34, 1.89, .025], cardEdgeMaterial);
      edge.setLocalEulerAngles(0, 0, 0);
      const face = primitive(app, root, 'Printed_Pile_Face', 'plane', [0, 0, .018], [1.3, 1, 1.85], material, false);
      face.setLocalEulerAngles(90, 0, 0);
      root.setLocalPosition(worldX(pose.x + layer * 2), worldY(pose.y - layer * 3), 2.18 + layer * .018);
      root.setLocalEulerAngles(0, 0, (kind === 'discard' ? 5 : kind === 'exhaust' ? -4 : -2) + layer * .7);
      pileRoot.addChild(root);
      stack.push(root);
    }
    pileSurfaces.set(kind, stack);
  }

  function enemyScreenPoint(id: string): { x: number; y: number } | null {
    const index = displayedState?.enemies.findIndex((enemy) => enemy.id === id) ?? -1;
    if (index < 0) return null;
    const pose = enemyShipPose(index);
    return { x: pose.x, y: pose.y };
  }

  function actorPoint(id: string): { x: number; y: number } {
    if (!displayedState || id === displayedState.player.id) return VIEWSCREEN_CENTER;
    return enemyScreenPoint(id) ?? VIEWSCREEN_CENTER;
  }

  function livingEnemy(id: string | null): EnemyShip | null {
    if (!id || !displayedState) return null;
    return displayedState.enemies.find((enemy) => enemy.id === id && enemy.hull > 0) ?? null;
  }

  function hideAimImmediately(): void {
    aimCurrentId = null;
    aimPendingId = null;
    aimPhase = 'hidden';
    aimMaterial.opacity = 0;
    aimMaterial.update();
    aimRoot.enabled = false;
  }

  function beginAimArrival(id: string): void {
    const point = enemyScreenPoint(id);
    if (!point) {
      hideAimImmediately();
      return;
    }
    aimCurrentId = id;
    aimPendingId = null;
    aimPhase = motionReduced ? 'settled' : 'arriving';
    aimPhaseStartedAt = sceneNow;
    aimMaterial.opacity = motionReduced ? 1 : 0;
    aimMaterial.update();
    aimRoot.enabled = true;
    poseEntity(aimRoot, point.x, point.y, 1.56);
    aimRoot.setLocalScale(motionReduced ? 1 : 1.32, motionReduced ? 1 : 1.32, 1);
  }

  function changeAimTarget(targetId: string | null): void {
    const validTarget = livingEnemy(targetId)?.id ?? null;
    if (!validTarget) {
      hideAimImmediately();
      return;
    }
    if (aimPhase === 'fading') {
      if (validTarget === aimCurrentId) beginAimArrival(validTarget);
      else aimPendingId = validTarget;
      return;
    }
    if (validTarget === aimCurrentId) return;
    if (!aimCurrentId) {
      beginAimArrival(validTarget);
      return;
    }
    if (motionReduced) {
      beginAimArrival(validTarget);
      return;
    }
    aimPendingId = validTarget;
    aimPhase = 'fading';
    aimPhaseStartedAt = sceneNow;
    aimFadeFromOpacity = aimMaterial.opacity;
  }

  function makeEnemy(enemy: EnemyShip, index: number): EnemyRig {
    const pose = enemyShipPose(index);
    const texture = ownTexture(textureFromCanvas(app, drawEnemyShipArt(enemy.role), `${enemy.role} spacecraft cutout`));
    const material = ownMaterial(textureMaterial(texture, .18));
    material.specular = new Color(.22, .25, .28);
    material.gloss = .5;
    material.update();
    const root = new Entity(`Hostile_${enemy.role}_${enemy.id}`, app);
    poseEntity(root, pose.x, pose.y, ENEMY_Z, pose.rotation);
    app.root.addChild(root);
    const hullSurface = primitive(
      app,
      root,
      'Detailed_Illustrated_Hull',
      'plane',
      [0, 0, 0],
      [pose.width / WORLD_SCALE, 1, pose.height / WORLD_SCALE],
      material,
      false,
    );
    hullSurface.setLocalEulerAngles(90, 0, 0);

    const hudRoot = new Entity(`Enemy_Telemetry_${enemy.id}`, app);
    poseEntity(
      hudRoot,
      SHIP_SCREEN.x + (index + .5) * SHIP_SCREEN.width / 3,
      SHIP_SCREEN.y + SHIP_SCREEN.height - 80,
      ENEMY_HUD_Z,
    );
    app.root.addChild(hudRoot);
    const key = enemyHudTextureKey(enemy, cssScale);
    const telemetryTexture = ownTexture(textureFromCanvas(app, drawEnemyTelemetry(enemy, cssScale), `${enemy.name} compact telemetry`));
    const telemetryMaterial = ownMaterial(textureMaterial(telemetryTexture, .72));
    telemetryMaterial.useLighting = false;
    telemetryMaterial.specular.set(0, 0, 0);
    telemetryMaterial.clearCoat = 0;
    telemetryMaterial.depthWrite = false;
    telemetryMaterial.update();
    const telemetryEntity = primitive(
      app,
      hudRoot,
      'Compact_Telemetry_Strip',
      'plane',
      [0, 0, 0],
      [ENEMY_TELEMETRY_SIZE.width / WORLD_SCALE, 1, ENEMY_TELEMETRY_SIZE.height / WORLD_SCALE],
      telemetryMaterial,
      false,
    );
    telemetryEntity.setLocalEulerAngles(90, 0, 0);

    return {
      root,
      hudRoot,
      telemetry: { entity: telemetryEntity, texture: telemetryTexture, key },
    };
  }

  function syncEnemies(): void {
    if (!displayedState) return;
    const liveIds = new Set(displayedState.enemies.map((enemy) => enemy.id));
    for (const [id, rig] of enemyRigs) {
      if (liveIds.has(id)) continue;
      rig.root.destroy();
      rig.hudRoot.destroy();
      enemyRigs.delete(id);
    }
    displayedState.enemies.forEach((enemy, index) => {
      let rig = enemyRigs.get(enemy.id);
      if (!rig) {
        rig = makeEnemy(enemy, index);
        enemyRigs.set(enemy.id, rig);
      }
      const pose = enemyShipPose(index);
      const alive = enemy.hull > 0;
      poseEntity(rig.root, pose.x, pose.y, ENEMY_Z, pose.rotation);
      poseEntity(
        rig.hudRoot,
        SHIP_SCREEN.x + (index + .5) * SHIP_SCREEN.width / 3,
        SHIP_SCREEN.y + SHIP_SCREEN.height - 80,
        ENEMY_HUD_Z,
      );
      rig.root.enabled = alive;
      rig.hudRoot.enabled = alive;
      const key = enemyHudTextureKey(enemy, cssScale);
      if (rig.telemetry.key !== key) {
        rig.telemetry.key = key;
        rig.telemetry.texture.setSource(drawEnemyTelemetry(enemy, cssScale));
      }
    });
    if (aimCurrentId && !livingEnemy(aimCurrentId)) hideAimImmediately();
    if (aimPendingId && !livingEnemy(aimPendingId)) aimPendingId = null;
    if (aimCurrentId) {
      const point = enemyScreenPoint(aimCurrentId);
      if (point) poseEntity(aimRoot, point.x, point.y, 1.56);
    }
  }

  function syncPlayerTelemetry(): void {
    if (!displayedState) return;
    const key = playerHudTextureKey(displayedState, cssScale);
    if (!playerTelemetry) {
      const texture = ownTexture(textureFromCanvas(app, drawPlayerTelemetry(displayedState, cssScale), 'Kestrel compact telemetry'));
      const material = ownMaterial(textureMaterial(texture, .72));
      material.useLighting = false;
      material.specular.set(0, 0, 0);
      material.clearCoat = 0;
      material.depthWrite = false;
      material.update();
      const entity = primitive(
        app,
        app.root,
        'Player_Telemetry',
        'plane',
        [worldX(180), worldY(280), 1.72],
        [PLAYER_TELEMETRY_SIZE.width / WORLD_SCALE, 1, PLAYER_TELEMETRY_SIZE.height / WORLD_SCALE],
        material,
        false,
      );
      entity.setLocalEulerAngles(90, 0, 0);
      playerTelemetry = { entity, texture, key };
      return;
    }
    if (playerTelemetry.key === key) return;
    playerTelemetry.key = key;
    playerTelemetry.texture.setSource(drawPlayerTelemetry(displayedState, cssScale));
  }

  function syncPiles(): void {
    if (!displayedState) return;
    const counts = {
      draw: displayedState.draw.length,
      discard: displayedState.discard.length,
      exhaust: displayedState.exhaust.length,
    };
    for (const kind of ['draw', 'discard', 'exhaust'] as const) {
      const stack = pileSurfaces.get(kind) ?? [];
      const visibleLayers = counts[kind] === 0 ? 0 : Math.min(stack.length, 1 + Math.floor((counts[kind] - 1) / 3));
      stack.forEach((entity, index) => { entity.enabled = index < visibleLayers; });
      const well = pileWells.get(kind);
      if (well) well.enabled = counts[kind] === 0;
    }
  }

  function cardKey(visual: ShipCardVisual): string {
    const effects = visual.definition.effects.map((effect) => `${effect.kind}:${effect.amount}`).join(',');
    return `${visual.definition.id}|${visual.definition.kind}|${visual.definition.title}|${visual.definition.cost}|${effects}|${visual.definition.exhaust ? 1 : 0}|${visual.dimmed ? 1 : 0}`;
  }

  function getCardTexture(visual: ShipCardVisual, key: string): Texture {
    let texture = cardTextures.get(key);
    if (!texture) {
      texture = ownTexture(textureFromCanvas(app, drawShipCardFace(visual.definition, visual.dimmed), `Card face ${visual.definition.title}`));
      cardTextures.set(key, texture);
    }
    return texture;
  }

  function updateCardTexture(rig: CardRig, visual: ShipCardVisual, key = cardKey(visual)): void {
    if (rig.textureKey === key) return;
    rig.textureKey = key;
    rig.material.diffuseMap = getCardTexture(visual, key);
    rig.material.emissiveMap = rig.material.diffuseMap;
    // The engine aliases all three samplers when the material is first compiled.
    // Keep them on one texture so later face swaps also change the sampled RGB.
    rig.material.opacityMap = rig.material.diffuseMap;
    rig.material.update();
  }

  function setCardSize(rig: Pick<CardRig, 'shadow' | 'edge' | 'face' | 'back'>, width: number, height: number): void {
    rig.shadow.setLocalScale(width / WORLD_SCALE * 1.04, 1, height / WORLD_SCALE * 1.035);
    rig.edge.setLocalScale(width / WORLD_SCALE * 1.018, height / WORLD_SCALE * 1.014, .045);
    rig.face.setLocalScale(width / WORLD_SCALE, 1, height / WORLD_SCALE);
    rig.back.setLocalScale(width / WORLD_SCALE, 1, height / WORLD_SCALE);
  }

  function cardPose(visual: ShipCardVisual, layer: number): { y: number; z: number; scale: number } {
    if (visual.detail) return { y: visual.y, z: 6.4, scale: SHIP_CARD_DETAIL_SCALE };
    if (visual.held) return { y: visual.y, z: 5.8 + layer * .004, scale: SHIP_CARD_SELECTED_SCALE };
    return {
      y: visual.y - (visual.selected ? SHIP_CARD_LIFT : 0),
      z: CARD_Z + layer * .004 + (visual.selected ? .28 : 0),
      scale: visual.selected ? SHIP_CARD_SELECTED_SCALE : 1,
    };
  }

  function makeCard(visual: ShipCardVisual, layer: number): CardRig {
    const key = cardKey(visual);
    const material = ownMaterial(textureMaterial(getCardTexture(visual, key), 1));
    // Printed faces are neutral, unlit ink; cardstock edges and shadows retain scene depth.
    material.useLighting = false;
    material.specular.set(0, 0, 0);
    material.clearCoat = 0;
    material.update();
    const root = new Entity(`Physical_Card_${visual.uid}`, app);
    const shadow = primitive(app, root, 'Tabletop_Shadow', 'plane', [.04, -.05, -.035], [1, 1, 1], shadowMaterial, false);
    shadow.setLocalEulerAngles(90, 0, 0);
    const edge = primitive(app, root, 'Cardstock_Thickness', 'box', [0, 0, 0], [1, 1, 1], cardEdgeMaterial);
    const face = primitive(app, root, 'Readable_Printed_Front', 'plane', [0, 0, .026], [1, 1, 1], material, true);
    face.setLocalEulerAngles(90, 0, 0);
    const back = primitive(app, root, 'Printed_Back', 'plane', [0, 0, -.026], [1, 1, 1], cardBackMaterial, true);
    back.setLocalEulerAngles(90, 180, 0);
    setCardSize({ shadow, edge, face, back }, visual.width, visual.height);
    const pose = cardPose(visual, layer);
    poseEntity(root, visual.x, pose.y, pose.z, visual.rotation);
    root.setLocalScale(pose.scale, pose.scale, 1);
    app.root.addChild(root);
    return {
      root,
      shadow,
      edge,
      face,
      back,
      material,
      textureKey: key,
      visual,
      x: visual.x,
      y: pose.y,
      z: pose.z,
      flip: 0,
      layer,
      following: Boolean(visual.held),
      targetX: visual.x,
      targetY: pose.y,
      previousTargetX: visual.x,
      targetZ: pose.z,
      targetRotation: visual.rotation,
      targetScale: pose.scale,
      sway: 0,
      rotation: visual.rotation,
      scale: pose.scale,
      width: visual.width,
      height: visual.height,
    };
  }

  function resetCardPose(rig: CardRig, layer: number): void {
    const visual = rig.visual;
    if (rig.width !== visual.width || rig.height !== visual.height) {
      setCardSize(rig, visual.width, visual.height);
      rig.width = visual.width;
      rig.height = visual.height;
    }
    const pose = cardPose(visual, layer);
    rig.root.enabled = true;
    poseEntity(rig.root, visual.x, pose.y, pose.z, visual.rotation);
    rig.face.enabled = true;
    rig.back.enabled = true;
    rig.shadow.enabled = true;
    rig.root.setLocalScale(pose.scale, pose.scale, 1);
    rig.x = visual.x;
    rig.y = pose.y;
    rig.z = pose.z;
    rig.flip = 0;
    rig.layer = layer;
    rig.following = false;
    rig.previousTargetX = visual.x;
    rig.sway = 0;
    rig.rotation = visual.rotation;
    rig.scale = pose.scale;
  }

  function renderCardPose(rig: CardRig): void {
    rig.root.setPosition(worldX(rig.x), worldY(rig.y), rig.z);
    rig.root.setEulerAngles(0, rig.flip, -rig.rotation);
    rig.root.setLocalScale(rig.scale, rig.scale, 1);
    rig.face.enabled = rig.flip <= 90;
    rig.back.enabled = rig.flip > 90;
    rig.shadow.enabled = rig.flip === 0;
  }

  function followCardVisual(rig: CardRig, layer: number): void {
    const pose = cardPose(rig.visual, layer);
    rig.layer = layer;
    rig.targetX = rig.visual.x;
    rig.targetY = pose.y;
    rig.targetZ = pose.z;
    rig.targetRotation = rig.visual.rotation;
    rig.targetScale = pose.scale;
    rig.following = true;
    rig.root.enabled = true;
  }

  function handVisual(state: ShipBattleState, index: number, poses = shipHandPoses(state.hand.length)): ShipCardVisual {
    const card = state.hand[index]!;
    return {
      ...poses[index]!,
      uid: card.uid,
      definition: previewCard(state, card.uid) ?? cardDefinition(card.id, state.catalog),
      dimmed: true,
    };
  }

  function settleCardsAgainst(state: ShipBattleState): void {
    const hand = new Set(state.hand.map((card) => card.uid));
    for (const [uid, rig] of cards) {
      if (hand.has(uid)) continue;
      rig.root.destroy();
      rig.material.destroy();
      materials.delete(rig.material);
      cards.delete(uid);
    }
    const poses = shipHandPoses(state.hand.length);
    state.hand.forEach((card, index) => {
      const visual = handVisual(state, index, poses);
      let rig = cards.get(card.uid);
      if (!rig) {
        rig = makeCard(visual, index);
        cards.set(card.uid, rig);
      } else {
        rig.visual = visual;
        updateCardTexture(rig, visual);
        resetCardPose(rig, index);
      }
    });
  }

  function adoptState(state: ShipBattleState): void {
    hideAimImmediately();
    displayedState = cloneState(state);
    syncPlayerTelemetry();
    syncEnemies();
    syncPiles();
  }

  function clearTransient(): void {
    for (const flight of flights) flight.root.destroy();
    flights.length = 0;
    for (const impact of impacts) impact.root.destroy();
    impacts.length = 0;
    cardMotions.length = 0;
    recycleMotion?.root.destroy();
    recycleMotion = null;
    for (const rig of cards.values()) rig.following = false;
  }

  function resolveWaiters(completed: boolean): void {
    for (const waiter of waiters) {
      cancelAnimationFrame(waiter.frame);
      waiter.finish(completed);
    }
    waiters.clear();
  }

  function waitDuration(duration: number, token: number): Promise<boolean> {
    if (destroyed || token !== sequence || duration <= 0) return Promise.resolve(!destroyed && token === sequence);
    return new Promise((resolve) => {
      const startedAt = sceneNow;
      const waiter: Waiter = { frame: 0, finish: resolve };
      const tick = (): void => {
        if (destroyed || token !== sequence) {
          waiters.delete(waiter);
          resolve(false);
          return;
        }
        if (sceneNow - startedAt >= duration) {
          waiters.delete(waiter);
          resolve(true);
          return;
        }
        waiter.frame = requestAnimationFrame(tick);
      };
      waiter.frame = requestAnimationFrame(tick);
      waiters.add(waiter);
    });
  }

  function spawnFlight(
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration: number,
    shield: boolean,
    name = shield ? 'Shield_Energy_Transfer' : 'Focused_Weapon_Projectile',
  ): void {
    const root = new Entity(name, app);
    const beam = primitive(app, root, 'Luminous_Core', shield ? 'sphere' : 'box', [0, 0, 0], shield ? [.18, .18, .18] : [.38, .09, .09], shield ? shieldProjectileMaterial : projectileMaterial, false);
    if (!shield) beam.setLocalEulerAngles(0, 0, Math.atan2(-(to.y - from.y), to.x - from.x) * 180 / Math.PI);
    const scale = shield ? 1 : .8;
    poseEntity(root, from.x, from.y, 5.1);
    root.setLocalScale(scale, scale, 1);
    app.root.addChild(root);
    flights.push({ root, startedAt: sceneNow, duration, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, z: 5.1, arc: shield ? 38 : 22, spin: shield ? 210 : 0, scale, approaching: false });
  }

  function spawnIncomingFlight(from: { x: number; y: number }, duration: number, shieldOnly: boolean): void {
    const root = new Entity(shieldOnly ? 'Incoming_Shield_Absorbed_Viewer_Projectile' : 'Incoming_Hull_Damage_Viewer_Projectile', app);
    primitive(app, root, 'Approaching_Luminous_Core', 'sphere', [0, 0, 0], [.14, .14, .14], shieldOnly ? shieldProjectileMaterial : incomingProjectileMaterial, false);
    poseEntity(root, from.x, from.y, 5.1);
    root.setLocalScale(.35, .35, .35);
    app.root.addChild(root);
    flights.push({
      root,
      startedAt: sceneNow,
      duration,
      fromX: from.x,
      fromY: from.y,
      toX: VIEWSCREEN_CENTER.x,
      toY: VIEWSCREEN_CENTER.y,
      z: 5.1,
      arc: 0,
      spin: 0,
      scale: 1,
      approaching: true,
    });
  }

  function spawnImpact(point: { x: number; y: number }, shield: boolean, duration: number): void {
    const root = new Entity(shield ? 'Shield_Impact_Ripple' : 'Weapon_Impact_Burst', app);
    const ring = primitive(app, root, 'Impact_Ring', 'cylinder', [0, 0, 0], [1, .016, 1], shield ? shieldImpactMaterial : impactMaterial, false);
    ring.setLocalEulerAngles(90, 0, 0);
    const baseScale = shield ? .24 : .18;
    poseEntity(root, point.x, point.y, 5.15);
    root.setLocalScale(baseScale, baseScale, baseScale);
    app.root.addChild(root);
    impacts.push({ root, startedAt: sceneNow, duration, x: point.x, y: point.y, baseScale, pane: false });
  }

  function spawnViewscreenImpact(shieldOnly: boolean, duration: number): void {
    const root = new Entity(shieldOnly ? 'Viewscreen_Shield_Absorb_Impact' : 'Viewscreen_Hull_Damage_Impact', app);
    const paneMaterial = shieldOnly ? paneShieldMaterial : paneHullMaterial;
    const rimMaterial = shieldOnly ? paneShieldRimMaterial : paneHullRimMaterial;
    const pane = primitive(
      app,
      root,
      'Transparent_Full_Pane_Feedback',
      'plane',
      [0, 0, 0],
      [SHIP_SCREEN.width / WORLD_SCALE, 1, SHIP_SCREEN.height / WORLD_SCALE],
      paneMaterial,
      false,
    );
    pane.setLocalEulerAngles(90, 0, 0);
    const width = SHIP_SCREEN.width / WORLD_SCALE;
    const height = SHIP_SCREEN.height / WORLD_SCALE;
    const rim = .075;
    primitive(app, root, 'Viewscreen_Rim_Top', 'box', [0, height / 2 - rim / 2, .012], [width, rim, .025], rimMaterial, false);
    primitive(app, root, 'Viewscreen_Rim_Bottom', 'box', [0, -height / 2 + rim / 2, .012], [width, rim, .025], rimMaterial, false);
    primitive(app, root, 'Viewscreen_Rim_Left', 'box', [-width / 2 + rim / 2, 0, .012], [rim, height, .025], rimMaterial, false);
    primitive(app, root, 'Viewscreen_Rim_Right', 'box', [width / 2 - rim / 2, 0, .012], [rim, height, .025], rimMaterial, false);
    poseEntity(root, VIEWSCREEN_CENTER.x, VIEWSCREEN_CENTER.y, VIEWSCREEN_IMPACT_Z);
    root.setLocalScale(.985, .985, 1);
    app.root.addChild(root);
    impacts.push({ root, startedAt: sceneNow, duration, x: VIEWSCREEN_CENTER.x, y: VIEWSCREEN_CENTER.y, baseScale: 1, pane: true });
  }

  function startCardMotion(rig: CardRig, x: number, y: number, rotation: number, scale: number, duration: number, z = 5.9, flip = 0, arc = 34): void {
    for (let index = cardMotions.length - 1; index >= 0; index--) {
      if (cardMotions[index]!.rig === rig) cardMotions.splice(index, 1);
    }
    rig.following = false;
    cardMotions.push({
      rig,
      startedAt: sceneNow,
      duration,
      fromX: rig.x,
      fromY: rig.y,
      fromZ: rig.z,
      fromFlip: rig.flip,
      fromRotation: rig.rotation,
      fromScale: rig.scale,
      toX: x,
      toY: y,
      toRotation: rotation,
      toZ: z,
      toFlip: flip,
      arc,
      toScale: scale,
    });
  }

  function applyEventSnapshot(event: ShipBattleEvent): void {
    if (!displayedState) return;
    const recipient = eventRecipient(event);
    const actor = recipient === displayedState.player.id
      ? displayedState.player
      : displayedState.enemies.find((enemy) => enemy.id === recipient);
    if (actor && typeof event.hull === 'number') actor.hull = event.hull;
    if (actor && typeof event.shield === 'number') actor.shield = event.shield;
    if (typeof event.energy === 'number') displayedState.energy = event.energy;
    if (event.type === 'card' && event.card) {
      displayedState.hand = displayedState.hand.filter((card) => card.uid !== event.card?.uid);
      if (event.definition?.effects.some((effect) => effect.kind === 'shield')) displayedState.coilsAvailable = false;
    }
    if (event.type === 'turn') {
      if (event.turn !== undefined) displayedState.turn = event.turn;
      displayedState.coilsAvailable = true;
    }
    if ((event.type === 'discard' || event.type === 'exhaust') && event.card) {
      displayedState.hand = displayedState.hand.filter((card) => card.uid !== event.card?.uid);
      const destination = event.type === 'discard' ? displayedState.discard : displayedState.exhaust;
      if (!destination.some((card) => card.uid === event.card?.uid)) destination.push({ ...event.card });
    }
    if (event.type === 'draw' && event.card) {
      displayedState.draw = displayedState.draw.filter((card) => card.uid !== event.card?.uid);
      if (!displayedState.hand.some((card) => card.uid === event.card?.uid)) displayedState.hand.push({ ...event.card });
    }
    if (event.type === 'recycle') {
      displayedState.draw.push(...displayedState.discard.map((card) => ({ ...card })));
      displayedState.discard = [];
    }
    syncPlayerTelemetry();
    syncEnemies();
    syncPiles();
  }

  async function presentEvent(event: ShipBattleEvent, reducedMotion: boolean, token: number, onEvent?: (value: ShipBattleEvent) => void): Promise<boolean> {
    if (destroyed || token !== sequence) return false;
    const duration = reducedMotion ? 0 : 210;
    const recipientId = eventRecipient(event);
    const playerId = displayedState?.player.id;

    if (event.type === 'card' && event.card) {
      const rig = cards.get(event.card.uid);
      if (rig) {
        // A committed play is no longer an unavailable hand card.
        rig.visual = { ...rig.visual, definition: event.definition ?? rig.visual.definition, dimmed: false };
        updateCardTexture(rig, rig.visual);
      }
      const targetId = event.targetId;
      const selfTarget = !targetId || targetId === playerId;
      const stage = targetId && !selfTarget
        ? enemyScreenPoint(targetId) ?? actorPoint(targetId)
        : { x: SHIP_SELF_DROP.x + SHIP_SELF_DROP.width / 2, y: SHIP_SELF_DROP.y + SHIP_SELF_DROP.height / 2 };
      if (rig && !reducedMotion) {
        startCardMotion(rig, stage.x, stage.y, rig.visual.rotation * .2, selfTarget ? .38 : .62, 125);
      }
      if (!(await waitDuration(reducedMotion ? 0 : 125, token)) || destroyed || token !== sequence) return false;
      applyEventSnapshot(event);
      onEvent?.(event);
      if (!(await waitDuration(reducedMotion ? 0 : 55, token)) || destroyed || token !== sequence) return false;
      return true;
    }

    if (event.type === 'intent') {
      if (!reducedMotion) {
        const enemy = enemyRigs.get(event.actorId);
        enemy?.root.setLocalScale(1.08, 1.08, 1);
      }
      if (!(await waitDuration(reducedMotion ? 0 : 110, token)) || destroyed || token !== sequence) return false;
      const enemy = enemyRigs.get(event.actorId);
      enemy?.root.setLocalScale(1, 1, 1);
      onEvent?.(event);
      return true;
    }

    if (event.type === 'damage' || event.type === 'shield' || event.type === 'energy') {
      const shieldEffect = event.type !== 'damage';
      const showEffect = event.type !== 'energy' || (event.amount ?? 0) > 0;
      const playerRecipient = recipientId === playerId;
      const incomingDamage = event.type === 'damage' && playerRecipient && event.actorId !== playerId;
      const playerDamage = event.type === 'damage' && event.actorId === playerId && !playerRecipient;
      const shieldOnly = incomingDamage
        && typeof event.hull === 'number'
        && displayedState !== null
        && event.hull >= displayedState.player.hull;
      let recipient = actorPoint(recipientId);
      let source = actorPoint(event.actorId);
      let flightName: string | undefined;
      if (playerDamage) {
        const muzzle = nextPlayerMuzzle;
        source = PLAYER_MUZZLES[muzzle]!;
        nextPlayerMuzzle = muzzle === 0 ? 1 : 0;
        flightName = muzzle === 0 ? 'Port_Viewscreen_Muzzle_Projectile' : 'Starboard_Viewscreen_Muzzle_Projectile';
      } else if (playerRecipient && shieldEffect) {
        source = PLAYER_SYSTEM_SOURCE;
        recipient = VIEWSCREEN_CENTER;
        flightName = event.type === 'shield' ? 'Viewscreen_Player_Shield_Transfer' : 'Viewscreen_Player_Energy_Transfer';
      }
      if (!reducedMotion && showEffect) {
        if (incomingDamage) spawnIncomingFlight(source, duration, shieldOnly);
        else spawnFlight(source, recipient, duration, shieldEffect, flightName);
      }
      if (!(await waitDuration(duration, token)) || destroyed || token !== sequence) return false;
      if (!reducedMotion && showEffect) {
        if (incomingDamage) spawnViewscreenImpact(shieldOnly, 190);
        else if (playerRecipient && shieldEffect) spawnViewscreenImpact(true, 190);
        else spawnImpact(recipient, shieldEffect, 190);
      }
      applyEventSnapshot(event);
      onEvent?.(event);
      return waitDuration(reducedMotion ? 0 : 95, token);
    }

    if ((event.type === 'discard' || event.type === 'exhaust') && event.card) {
      const rig = cards.get(event.card.uid);
      const pile = event.type === 'discard' ? SHIP_PILES.discard : SHIP_PILES.exhaust;
      if (rig && !reducedMotion) {
        const layer = Math.min(3, Math.floor((displayedState?.[event.type].length ?? 0) / 3));
        const rotation = (event.type === 'discard' ? -5 : 4) - layer * .7;
        startCardMotion(rig, pile.x + layer * 2, pile.y - layer * 3, rotation, 130 / rig.width, 150, 2.22 + layer * .018, 180);
      }
      if (!(await waitDuration(reducedMotion ? 0 : 150, token)) || destroyed || token !== sequence) return false;
      applyEventSnapshot(event);
      if (rig) rig.root.enabled = false;
      onEvent?.(event);
      return true;
    }

    if (event.type === 'draw' && event.card && displayedState) {
      // Only this event's identity is used; later draws remain anonymous in the pile.
      const view = cloneState(displayedState);
      view.draw = view.draw.filter((card) => card.uid !== event.card!.uid);
      if (!view.hand.some((card) => card.uid === event.card!.uid)) view.hand.push({ ...event.card });
      const poses = shipHandPoses(view.hand.length);
      view.hand.forEach((card, index) => {
        const visual = handVisual(view, index, poses);
        let rig = cards.get(card.uid);
        if (card.uid === event.card!.uid) {
          if (rig) {
            rig.root.destroy();
            rig.material.destroy();
            materials.delete(rig.material);
          }
          rig = makeCard(visual, index);
          cards.set(card.uid, rig);
          const layer = Math.min(3, Math.floor(Math.max(0, displayedState!.draw.length - 1) / 3));
          rig.x = SHIP_PILES.draw.x + layer * 2;
          rig.y = SHIP_PILES.draw.y - layer * 3;
          rig.z = 2.22 + layer * .018;
          rig.rotation = 2 - layer * .7;
          rig.scale = 130 / visual.width;
          rig.flip = 180;
          renderCardPose(rig);
        } else if (rig) {
          rig.visual = visual;
          updateCardTexture(rig, visual);
        }
        if (!rig) return;
        if (reducedMotion) resetCardPose(rig, index);
        else startCardMotion(rig, visual.x, visual.y, visual.rotation, 1, 300, CARD_Z + index * .004, 0, card.uid === event.card!.uid ? 100 : 0);
      });
      if (!(await waitDuration(reducedMotion ? 0 : 300, token)) || destroyed || token !== sequence) return false;
      applyEventSnapshot(event);
      onEvent?.(event);
      return true;
    }

    if (event.type === 'recycle') {
      if (!reducedMotion) {
        const root = new Entity('Recycling_Anonymous_Card_Stack', app);
        const layers = Math.min(4, 1 + Math.floor(Math.max(0, (event.amount ?? 1) - 1) / 3));
        for (let layer = 0; layer < layers; layer++) {
          const back = primitive(app, root, 'Recycled_Card_Back', 'plane', [layer * .025, layer * .035, layer * .02], [1.3, 1, 1.85], cardBackMaterial, false);
          back.setLocalEulerAngles(90, 0, layer * 2);
        }
        app.root.addChild(root);
        poseEntity(root, SHIP_PILES.discard.x, SHIP_PILES.discard.y, 5.7, -5);
        recycleMotion = { root, startedAt: sceneNow, duration: 320 };
        for (const entity of pileSurfaces.get('discard') ?? []) entity.enabled = false;
      }
      if (!(await waitDuration(reducedMotion ? 0 : 320, token)) || destroyed || token !== sequence) return false;
      recycleMotion?.root.destroy();
      recycleMotion = null;
      applyEventSnapshot(event);
      onEvent?.(event);
      return true;
    }

    applyEventSnapshot(event);
    onEvent?.(event);
    return waitDuration(reducedMotion ? 0 : 35, token);
  }

  function update(dt: number): void {
    if (destroyed) return;
    const delta = Math.max(0, Math.min(dt, .05));
    sceneNow += delta * 1000;
    if (delta > 0) {
      const follow = 1 - Math.exp(-(motionReduced ? 65 : 22) * delta);
      const swayFollow = 1 - Math.exp(-16 * delta);
      for (const rig of cards.values()) {
        if (!rig.following) continue;
        if (rig.visual.held) {
          rig.x = rig.targetX;
          rig.y = rig.targetY;
        } else {
          rig.x += (rig.targetX - rig.x) * follow;
          rig.y += (rig.targetY - rig.y) * follow;
        }
        rig.z += (rig.targetZ - rig.z) * follow;
        rig.scale += (rig.targetScale - rig.scale) * follow;
        // Positive screen rotation leans the top right (the world Z angle is negated).
        // Use pointer-target motion, not the rendered pose or the pickup displacement.
        const velocitySway = rig.visual.held && !motionReduced
          ? Math.max(-2.6, Math.min(2.6, -(rig.targetX - rig.previousTargetX) * .0013 / delta))
          : 0;
        rig.previousTargetX = rig.targetX;
        rig.sway = motionReduced ? 0 : rig.sway + (velocitySway - rig.sway) * swayFollow;
        rig.rotation += (rig.targetRotation + rig.sway - rig.rotation) * follow;
        renderCardPose(rig);
        if (!rig.visual.held && Math.abs(rig.x - rig.targetX) < .05 && Math.abs(rig.y - rig.targetY) < .05
          && Math.abs(rig.rotation - rig.targetRotation) < .02 && Math.abs(rig.scale - rig.targetScale) < .001) {
          resetCardPose(rig, rig.layer);
        }
      }
    }
    if (aimRoot.enabled && aimCurrentId) {
      if (motionReduced) {
        if (aimPhase !== 'settled') {
          aimPhase = 'settled';
          aimMaterial.opacity = 1;
          aimMaterial.update();
          aimRoot.setLocalScale(1, 1, 1);
          aimRoot.setEulerAngles(0, 0, 0);
        }
      } else if (aimPhase === 'fading') {
        const progress = Math.min(1, (sceneNow - aimPhaseStartedAt) / 90);
        aimMaterial.opacity = aimFadeFromOpacity * (1 - progress);
        aimMaterial.update();
        aimRoot.setLocalScale(1 - progress * .08, 1 - progress * .08, 1);
        if (progress >= 1) {
          const nextId = livingEnemy(aimPendingId)?.id ?? null;
          aimRoot.enabled = false;
          aimCurrentId = null;
          if (nextId) beginAimArrival(nextId);
          else hideAimImmediately();
        }
      } else if (aimPhase === 'arriving') {
        const progress = Math.min(1, (sceneNow - aimPhaseStartedAt) / 145);
        const settled = 1 - Math.pow(1 - progress, 3);
        aimMaterial.opacity = settled;
        aimMaterial.update();
        const scale = 1 + (1 - settled) * .32;
        aimRoot.setLocalScale(scale, scale, 1);
        aimRoot.setEulerAngles(0, 0, (1 - settled) * -9);
        if (progress >= 1) aimPhase = 'settled';
      } else if (aimPhase === 'settled') {
        const pulse = 1 + Math.sin(sceneNow * .008) * .018;
        aimRoot.setLocalScale(pulse, pulse, 1);
        aimRoot.setEulerAngles(0, 0, Math.sin(sceneNow * .0024) * 2.5);
      }
    }
    if (recycleMotion) {
      const t = Math.min(1, (sceneNow - recycleMotion.startedAt) / recycleMotion.duration);
      const eased = t * t * (3 - 2 * t);
      poseEntity(recycleMotion.root,
        SHIP_PILES.discard.x + (SHIP_PILES.draw.x - SHIP_PILES.discard.x) * eased,
        SHIP_PILES.discard.y + (SHIP_PILES.draw.y - SHIP_PILES.discard.y) * eased - Math.sin(t * Math.PI) * 150,
        5.7, -5 + 7 * eased);
    }
    for (let index = flights.length - 1; index >= 0; index--) {
      const flight = flights[index];
      const t = Math.min(1, Math.max(0, (sceneNow - flight.startedAt) / Math.max(1, flight.duration)));
      const eased = 1 - Math.pow(1 - t, 3);
      const x = flight.fromX + (flight.toX - flight.fromX) * eased;
      const y = flight.fromY + (flight.toY - flight.fromY) * eased - Math.sin(t * Math.PI) * flight.arc;
      poseEntity(flight.root, x, y, flight.z, t * flight.spin);
      if (flight.approaching) {
        const scale = flight.scale * (.35 + eased * 3.65);
        flight.root.setLocalScale(scale, scale, scale);
      } else {
        flight.root.setLocalScale(flight.scale * (1 + Math.sin(t * Math.PI) * .45), flight.scale, 1);
      }
      if (t < 1) continue;
      flight.root.destroy();
      flights.splice(index, 1);
    }
    for (let index = impacts.length - 1; index >= 0; index--) {
      const impact = impacts[index];
      const t = Math.min(1, Math.max(0, (sceneNow - impact.startedAt) / Math.max(1, impact.duration)));
      if (impact.pane) {
        poseEntity(impact.root, impact.x, impact.y, VIEWSCREEN_IMPACT_Z);
        const scale = .985 + Math.sin(t * Math.PI) * .015;
        impact.root.setLocalScale(scale, scale, 1);
      } else {
        poseEntity(impact.root, impact.x, impact.y, 5.15, t * 70);
        const scale = impact.baseScale + t * 1.25;
        impact.root.setLocalScale(scale, scale, scale);
      }
      if (t < 1) continue;
      impact.root.destroy();
      impacts.splice(index, 1);
    }
    for (let index = cardMotions.length - 1; index >= 0; index--) {
      const motion = cardMotions[index];
      const t = Math.min(1, Math.max(0, (sceneNow - motion.startedAt) / Math.max(1, motion.duration)));
      const eased = t * t * (3 - 2 * t);
      motion.rig.x = motion.fromX + (motion.toX - motion.fromX) * eased;
      motion.rig.y = motion.fromY + (motion.toY - motion.fromY) * eased - Math.sin(t * Math.PI) * motion.arc;
      motion.rig.z = motion.fromZ + (motion.toZ - motion.fromZ) * eased;
      motion.rig.flip = motion.fromFlip + (motion.toFlip - motion.fromFlip) * eased;
      motion.rig.rotation = motion.fromRotation + (motion.toRotation - motion.fromRotation) * eased;
      motion.rig.scale = motion.fromScale + (motion.toScale - motion.fromScale) * eased;
      renderCardPose(motion.rig);
      if (t < 1) continue;
      cardMotions.splice(index, 1);
    }
  }
  app.on('update', update);

  app.start();

  function cancelPresentation(adoptFinal: boolean, preserveCardPoses = false, resetMuzzle = true): void {
    sequence++;
    resolveWaiters(false);
    if (resetMuzzle) nextPlayerMuzzle = 0;
    clearTransient();
    hideAimImmediately();
    for (const rig of enemyRigs.values()) rig.root.setLocalScale(1, 1, 1);
    for (const stack of pileSurfaces.values()) {
      for (const entity of stack) entity.setLocalScale(1, 1, 1);
    }
    let finalToAdopt: ShipBattleState | null = null;
    if (adoptFinal && activePresentation) finalToAdopt = activePresentation.finalState;
    activePresentation = null;
    if (finalToAdopt && !destroyed) {
      adoptState(finalToAdopt);
      settleCardsAgainst(finalToAdopt);
    } else if (!preserveCardPoses) {
      let layer = 0;
      for (const rig of cards.values()) resetCardPose(rig, layer++);
    }
    detailScrim.enabled = false;
  }

  return {
    resize(cssWidth: number, cssHeight: number): void {
      if (destroyed) return;
      const width = Math.max(1, Math.round(cssWidth));
      const height = Math.max(1, Math.round(cssHeight));
      const previousScaleKey = enemyHudScaleKey(cssScale);
      cssScale = Math.min(cssWidth / SHIP_DESIGN.width, cssHeight / SHIP_DESIGN.height);
      app.graphicsDevice.resizeCanvas(width, height);
      if (enemyHudScaleKey(cssScale) !== previousScaleKey) {
        syncPlayerTelemetry();
        syncEnemies();
      }
    },

    setState(state: ShipBattleState): void {
      if (destroyed) return;
      adoptState(state);
    },

    setAimTarget(targetId: string | null): void {
      if (!destroyed) changeAimTarget(targetId);
    },

    setCards(visuals: readonly ShipCardVisual[], options?: { reducedMotion: boolean }): void {
      if (destroyed) return;
      if (options) motionReduced = options.reducedMotion;
      detailScrim.enabled = visuals.some((visual) => visual.detail);
      const live = new Set(visuals.map((visual) => visual.uid));
      for (const [uid, rig] of cards) {
        if (live.has(uid)) continue;
        for (let index = cardMotions.length - 1; index >= 0; index--) {
          if (cardMotions[index]!.rig === rig) cardMotions.splice(index, 1);
        }
        rig.root.destroy();
        rig.material.destroy();
        materials.delete(rig.material);
        cards.delete(uid);
      }
      visuals.forEach((visual, layer) => {
        const key = cardKey(visual);
        let rig = cards.get(visual.uid);
        if (!rig) {
          rig = makeCard(visual, layer);
          cards.set(visual.uid, rig);
        } else {
          const follow = visual.held || rig.visual.held || rig.following;
          if (visual.held && !rig.visual.held) rig.previousTargetX = visual.x;
          rig.visual = visual;
          updateCardTexture(rig, visual, key);
          if (follow) followCardVisual(rig, layer);
          else resetCardPose(rig, layer);
        }
      });
    },

    async present(events: readonly ShipBattleEvent[], finalState: ShipBattleState, options: { reducedMotion: boolean; onEvent?: (event: ShipBattleEvent) => void }): Promise<void> {
      if (destroyed) return;
      cancelPresentation(true, true, false);
      motionReduced = options.reducedMotion;
      const token = sequence;
      activePresentation = { token, finalState: cloneState(finalState) };
      try {
        for (const event of events) {
          if (!(await presentEvent(event, options.reducedMotion, token, options.onEvent)) || destroyed || token !== sequence) return;
        }
      } finally {
        if (!destroyed && token === sequence) {
          adoptState(finalState);
          activePresentation = null;
          clearTransient();
          settleCardsAgainst(finalState);
          detailScrim.enabled = false;
        }
      }
    },

    cancel(): void {
      if (!destroyed) cancelPresentation(true);
    },

    destroy(): void {
      if (destroyed) return;
      cancelPresentation(false);
      destroyed = true;
      resolveWaiters(false);
      app.off('update', update);
      clearTransient();
      cards.clear();
      enemyRigs.clear();
      cardTextures.clear();
      for (const material of materials) material.destroy();
      materials.clear();
      for (const texture of textures) texture.destroy();
      textures.clear();
      app.destroy();
    },
  };
}
