import {
  Application,
  BLEND_NORMAL,
  Color,
  Entity,
  FOG_LINEAR,
  GAMMA_SRGB,
  PROJECTION_ORTHOGRAPHIC,
  SHADOW_PCF3,
  StandardMaterial,
  Texture,
  TONEMAP_ACES,
  Vec3,
} from 'playcanvas';
import type { ActorId, CombatEvent, CombatState } from '../game/types';
import { drawActorArt, drawArenaArt, drawCardArt, drawCardBack, drawEnergyBadge } from './art';
import { ACTOR_CENTERS, CARD_TARGET_GAP, CARD_TARGET_Y, type CardVisual, type ScenePort } from './types';

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const WORLD_SCALE = 100;

type Spring = { value: number; velocity: number };
type ActorRig = {
  root: Entity;
  material: StandardMaterial;
  baseX: number;
  baseY: number;
  defeated: boolean;
  hit: number;
  heal: number;
  exposed: number;
  action: number;
};
type CardDotRig = {
  actor: ActorId;
  root: Entity;
  ring: Entity;
  well: Entity;
};
type CardRig = {
  root: Entity;
  surface: Entity;
  backSurface: Entity;
  energyBadge: Entity;
  material: StandardMaterial;
  dots: CardDotRig[];
  textureKey: string;
  visual: CardVisual;
  layer: number;
  x: Spring;
  y: Spring;
  roll: Spring;
  flip: Spring;
  displayedWidth: number;
  displayedHeight: number;
};

function worldX(designX: number): number {
  return (designX - DESIGN_WIDTH / 2) / WORLD_SCALE;
}

function worldY(designY: number): number {
  return (DESIGN_HEIGHT / 2 - designY) / WORLD_SCALE;
}

function spring(current: Spring, target: number, dt: number, stiffness = 500, damping = 30): void {
  current.velocity += (target - current.value) * stiffness * dt;
  current.velocity *= Math.exp(-damping * dt);
  current.value += current.velocity * dt;
}

function snap(current: Spring, target: number): void {
  current.value = target;
  current.velocity = 0;
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
  app.scene.ambientLight = new Color(.13, .18, .17);
  app.scene.exposure = .98;
  app.scene.fog.type = FOG_LINEAR;
  app.scene.fog.color = new Color(.025, .065, .065);
  app.scene.fog.start = 11.65;
  app.scene.fog.end = 14.2;

  const camera = new Entity('FightCamera', app);
  camera.addComponent('camera', {
    clearColor: new Color(.025, .065, .065),
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

  const arenaRoot = new Entity('MOREMART_Arena', app);
  app.root.addChild(arenaRoot);
  // Separate painted distance, dimensional fixtures and the playable plane without a full-screen
  // depth-of-field pass, which would soften card text along with the background.
  const backdropRoot = new Entity('Distant_Aisle', app);
  arenaRoot.addChild(backdropRoot);
  const fixtureRoot = new Entity('Aisle_Fixtures', app);
  arenaRoot.addChild(fixtureRoot);
  const backdropArt = drawArenaArt();
  const backdropContext = backdropArt.getContext('2d')!;
  backdropContext.save();
  backdropContext.filter = 'blur(3px)';
  backdropContext.globalCompositeOperation = 'copy';
  backdropContext.drawImage(backdropArt, 0, 0);
  backdropContext.restore();
  const backdropTexture = textureFromCanvas(app, backdropArt, 'MOREMART soft-focus arena');
  const backdropMaterial = texturedMaterial(backdropTexture, false, .025);
  backdropMaterial.specular = new Color(.08, .08, .065);
  backdropMaterial.gloss = .18;
  backdropMaterial.clearCoat = 0;
  backdropMaterial.update();
  primitive(app, backdropRoot, 'Painted_Arena', 'box', [0, 0, -.95], [19.5, 11.1, .08], backdropMaterial);
  const shelfMaterial = solidMaterial(new Color(.105, .19, .185), .32);
  const shelfEdgeMaterial = solidMaterial(new Color(.28, .34, .29), .38);
  for (const side of [-8.9, 8.9]) {
    primitive(app, fixtureRoot, 'Shelf_Post', 'box', [side, .55, -.22], [.13, 3.9, .32], shelfEdgeMaterial, true);
    for (const y of [-.75, .15, 1.05, 1.95]) {
      primitive(app, fixtureRoot, 'Shelf_Lip', 'box', [side, y, -.17], [1.3, .09, .38], shelfMaterial, true);
    }
  }
  const amberMaterial = solidMaterial(new Color(.78, .44, .13), .38, new Color(.28, .09, .012));
  for (const x of [-6.6, -2.2, 2.2, 6.6]) {
    primitive(app, fixtureRoot, 'Amber_Practical', 'box', [x, 3.72, -.1], [1.15, .08, .18], amberMaterial);
  }
  const foregroundMaterial = solidMaterial(new Color(.68, .4, .09), .34);
  const leftBollard = primitive(app, arenaRoot, 'Foreground_Bollard', 'cylinder', [-8.55, -4.45, .35], [.28, .75, .28], foregroundMaterial, true);
  leftBollard.setLocalEulerAngles(0, 0, -8);
  const rightBollard = primitive(app, arenaRoot, 'Foreground_Bollard', 'cylinder', [8.62, -4.4, .35], [.3, .84, .3], foregroundMaterial, true);
  rightBollard.setLocalEulerAngles(0, 0, 7);

  const key = new Entity('Warm_Aisle_Key', app);
  key.addComponent('light', {
    type: 'omni',
    color: new Color(.96, .7, .46),
    intensity: 1.6,
    range: 22,
    castShadows: true,
    shadowType: SHADOW_PCF3,
    shadowResolution: 1024,
    shadowBias: .08,
    normalOffsetBias: .04,
  });
  key.setPosition(-2.5, 5.2, 7.5);
  app.root.addChild(key);
  const fill = new Entity('Muted_Aisle_Fill', app);
  fill.addComponent('light', {
    type: 'omni',
    color: new Color(.3, .5, .34),
    intensity: .34,
    range: 12,
    castShadows: false,
  });
  fill.setPosition(5.2, -.25, 5.5);
  app.root.addChild(fill);
  const handLight = new Entity('Tabletop_Reading_Light', app);
  handLight.addComponent('light', {
    type: 'omni',
    color: new Color(1, .9, .74),
    intensity: .9,
    range: 13,
    castShadows: false,
  });
  handLight.setPosition(0, -4, 7);
  app.root.addChild(handLight);

  const actorTextures = new Map<ActorId, Texture>();
  const actors = new Map<ActorId, ActorRig>();
  for (const actor of ['guard', 'bob'] as const) {
    const texture = textureFromCanvas(app, drawActorArt(actor), `${actor} procedural character`);
    actorTextures.set(actor, texture);
    const material = texturedMaterial(texture, true, .055);
    const root = new Entity(actor === 'guard' ? 'Possessed_Security_Guard' : 'Hardware_Worker_Bob', app);
    const surface = primitive(app, root, `${actor}_Illustrated_Surface`, 'box', [0, 0, 0], [3.2, 3.5, .09], material, true);
    surface.setLocalPosition(0, -1.65, 0);
    const center = ACTOR_CENTERS[actor];
    const baseX = worldX(center.x);
    const baseY = worldY(center.y);
    root.setPosition(baseX, baseY, .45);
    arenaRoot.addChild(root);
    actors.set(actor, { root, material, baseX, baseY, defeated: false, hit: 0, heal: 0, exposed: 0, action: 0 });
  }

  const targetWellMaterial = solidMaterial(new Color(.025, .075, .08), .3);
  const targetDimMaterial = solidMaterial(new Color(.34, .4, .39), .5);
  const targetTealMaterial = solidMaterial(new Color(.08, .82, .72), .7, new Color(.02, .25, .21));
  const targetAmberMaterial = solidMaterial(new Color(1, .57, .16), .7, new Color(.34, .13, .02));

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
  const enemyCardBackTexture = textureFromCanvas(app, drawCardBack(true), 'Enemy intent card back');
  const enemyCardBackMaterial = texturedMaterial(enemyCardBackTexture, true, .025);
  enemyCardBackMaterial.opacity = 1;
  enemyCardBackMaterial.specular = new Color(.16, .14, .1);
  enemyCardBackMaterial.gloss = .38;
  enemyCardBackMaterial.clearCoat = .08;
  enemyCardBackMaterial.clearCoatGloss = .4;
  enemyCardBackMaterial.update();

  const cardTextures = new Map<string, Texture>();
  const energyBadgeMaterials = new Map<string, StandardMaterial>();
  const cards = new Map<string, CardRig>();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pointerX = DESIGN_WIDTH / 2;
  let pointerY = DESIGN_HEIGHT / 2;
  let parallaxX = 0;
  let parallaxY = 0;
  let target: ActorId | null = null;
  let destroyed = false;

  function cardTextureKey(visual: CardVisual): string {
    const characterColor = visual.definition.characterColor ?? '#e97a2d';
    const rarity = visual.definition.rarity ?? 'common';
    return `${visual.locked ? 'locked' : 'player'}:${visual.definition.id}:color:${characterColor}:rarity:${rarity}:damage:${visual.damageModifier}:targets:${visual.targets.length > 0}:dimmed:${visual.dimmed}`;
  }

  function getCardTexture(visual: CardVisual, key = cardTextureKey(visual)): Texture {
    let texture = cardTextures.get(key);
    if (!texture) {
      texture = textureFromCanvas(
        app,
        drawCardArt(visual.definition, visual.locked, visual.damageModifier, visual.targets.length > 0, visual.dimmed),
        `${visual.locked ? 'Locked intent' : 'Card'} ${visual.definition.name}`,
      );
      cardTextures.set(key, texture);
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
    }
    return material;
  }

  function positionCardDots(rig: CardRig): void {
    const diameter = rig.visual.width * .12 / WORLD_SCALE;
    for (let index = 0; index < rig.dots.length; index++) {
      const dot = rig.dots[index];
      const normalizedX = .5 + (index - (rig.dots.length - 1) / 2) * CARD_TARGET_GAP;
      dot.root.setLocalPosition(
        (normalizedX - .5) * rig.visual.width / WORLD_SCALE,
        (.5 - CARD_TARGET_Y) * rig.visual.height / WORLD_SCALE,
        .04,
      );
      dot.ring.setLocalScale(diameter, .016, diameter);
      dot.well.setLocalScale(diameter * .56, .012, diameter * .56);
    }
  }

  function syncCardDots(rig: CardRig): void {
    const targets = rig.visual.locked ? [] : rig.visual.targets;
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
          ? dot.actor === 'guard' ? targetTealMaterial : targetAmberMaterial
          : targetDimMaterial;
      }
    }
    positionCardDots(rig);
  }


  function syncCardMaterial(rig: CardRig): void {
    const glow = rig.visual.detail ? .14 : .025;
    rig.material.emissive = new Color(glow, glow, glow);
    rig.material.opacity = 1;
    rig.material.update();
    rig.energyBadge.enabled = !rig.visual.locked;
    if (rig.energyBadge.render) rig.energyBadge.render.material = energyBadgeMaterial(rig.visual);
    if (rig.backSurface.render) {
      rig.backSurface.render.material = rig.visual.locked ? enemyCardBackMaterial : builderCardBackMaterial;
    }
  }

  function scaleCardFaces(rig: CardRig): void {
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
    const diameter = rig.displayedWidth * .18 / WORLD_SCALE;
    // A square face keeps the badge round regardless of the card's aspect ratio.
    rig.energyBadge.setLocalScale(diameter, 1, diameter);
    rig.energyBadge.setLocalPosition(
      -rig.displayedWidth / (2 * WORLD_SCALE) + diameter / 4,
      rig.displayedHeight / (2 * WORLD_SCALE) - diameter / 4,
      .0065,
    );
  }

  function makeCard(visual: CardVisual, layer: number): CardRig {
    const textureKey = cardTextureKey(visual);
    const material = texturedMaterial(getCardTexture(visual, textureKey), true, .025);
    material.opacity = 1;
    material.specular = new Color(.16, .14, .1);
    material.gloss = .38;
    material.clearCoat = .08;
    material.clearCoatGloss = .4;
    material.update();
    const root = new Entity(`Card_${visual.uid}`, app);
    const surface = primitive(app, root, 'Printed_Lit_Card_Front', 'plane', [0, 0, .006], [visual.width / WORLD_SCALE, 1, visual.height / WORLD_SCALE], material, true);
    surface.setLocalEulerAngles(90, 0, 0);
    const backSurface = primitive(app, root, 'Printed_Lit_Card_Back', 'plane', [0, 0, -.006], [visual.width / WORLD_SCALE, 1, visual.height / WORLD_SCALE], visual.locked ? enemyCardBackMaterial : builderCardBackMaterial, true);
    backSurface.setLocalEulerAngles(90, 180, 0);
    const energyBadge = primitive(app, root, 'Corner_Energy_Badge', 'plane', [0, 0, .0065], [1, 1, 1], energyBadgeMaterial(visual));
    energyBadge.setLocalEulerAngles(90, 0, 0);
    const x = worldX(visual.x + visual.width / 2);
    const y = worldY(visual.y + visual.height / 2);
    const initialRotation = -desiredCardRotation(visual);
    const initialFlip = visual.flip ?? 0;
    root.setPosition(x, y, visual.detail ? 5 : visual.dragged ? 4 : 2.5 + layer * .002);
    root.setEulerAngles(0, initialFlip, initialRotation);
    app.root.addChild(root);
    const rig: CardRig = {
      root,
      surface,
      backSurface,
      energyBadge,
      material,
      dots: [],
      textureKey,
      visual,
      layer,
      x: { value: x, velocity: 0 },
      y: { value: y, velocity: 0 },
      roll: { value: initialRotation, velocity: 0 },
      flip: { value: initialFlip, velocity: 0 },
      displayedWidth: visual.width,
      displayedHeight: visual.height,
    };
    syncCardMaterial(rig);
    syncCardDots(rig);
    return rig;
  }
  function desiredCardRotation(visual: CardVisual): number {
    return visual.dragged || visual.queued ? 0 : visual.rotation;
  }


  function positionCard(rig: CardRig, dt: number, immediate: boolean): void {
    const visual = rig.visual;
    immediate ||= (visual.queued && !visual.dragged) || Boolean(visual.detail || visual.snap);
    const cx = visual.x + visual.width / 2;
    const cy = visual.y + visual.height / 2;
    const advance = immediate ? snap : spring;
    const rotate = visual.queued ? snap : advance;
    advance(rig.x, worldX(cx), dt);
    advance(rig.y, worldY(cy), dt);
    rotate(rig.roll, -desiredCardRotation(visual), dt);
    advance(rig.flip, visual.flip ?? 0, dt);
    rig.root.setPosition(
      rig.x.value,
      rig.y.value,
      visual.detail ? 5 : visual.dragged ? 4 : 2.5 + rig.layer * .002 + (visual.hovered ? .55 : 0) + (visual.queued ? .08 : 0),
    );
    rig.root.setEulerAngles(0, rig.flip.value, rig.roll.value);
    const sizeBlend = immediate ? 1 : 1 - Math.exp(-18 * dt);
    rig.displayedWidth += (visual.width - rig.displayedWidth) * sizeBlend;
    rig.displayedHeight += (visual.height - rig.displayedHeight) * sizeBlend;
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


  function applyActorAppearance(actor: ActorId): void {
    const rig = actors.get(actor);
    if (!rig) return;
    if (rig.defeated) {
      rig.material.diffuse = new Color(.28, .34, .32);
      rig.material.opacity = .38;
    } else if (rig.hit > 0) {
      rig.material.diffuse = new Color(1, .5, .38);
      rig.material.opacity = 1;
    } else if (rig.heal > 0) {
      rig.material.diffuse = new Color(.62, 1, .68);
      rig.material.opacity = 1;
    } else if (rig.exposed > 0) {
      rig.material.diffuse = new Color(1, .72, .34);
      rig.material.opacity = 1;
    } else if (target === actor) {
      rig.material.diffuse = actor === 'guard' ? new Color(.72, 1, .42) : new Color(1, .78, .42);
      rig.material.opacity = 1;
    } else {
      rig.material.diffuse = new Color(1, 1, 1);
      rig.material.opacity = 1;
    }
    rig.material.update();
  }

  function update(dtRaw: number): void {
    const dt = Math.min(dtRaw, .05);
    const motionScale = reduceMotion.matches ? 0 : 1;
    const desiredParallaxX = (pointerX / DESIGN_WIDTH - .5) * .05 * motionScale;
    const desiredParallaxY = (.5 - pointerY / DESIGN_HEIGHT) * .032 * motionScale;
    const parallaxBlend = reduceMotion.matches ? 1 : 1 - Math.exp(-5 * dt);
    parallaxX += (desiredParallaxX - parallaxX) * parallaxBlend;
    parallaxY += (desiredParallaxY - parallaxY) * parallaxBlend;
    backdropRoot.setLocalPosition(parallaxX, parallaxY, 0);
    fixtureRoot.setLocalPosition(parallaxX * .45, parallaxY * .45, 0);

    for (const [actor, rig] of actors) {
      const hadFeedback = rig.hit > 0 || rig.heal > 0 || rig.exposed > 0;
      rig.hit = Math.max(0, rig.hit - dt);
      rig.heal = Math.max(0, rig.heal - dt);
      rig.exposed = Math.max(0, rig.exposed - dt);
      rig.action = Math.max(0, rig.action - dt);
      const actionPhase = rig.action > 0 ? Math.sin((rig.action / .26) * Math.PI) : 0;
      const healPhase = rig.heal > 0 ? Math.sin((rig.heal / .42) * Math.PI) : 0;
      const hitShake = rig.hit > 0 ? Math.sin(rig.hit * 92) * rig.hit * .32 : 0;
      const direction = actor === 'bob' ? 1 : -1;
      rig.root.setLocalPosition(rig.baseX + actionPhase * direction * .28 + hitShake, rig.baseY + Math.abs(hitShake) * .15 + healPhase * .05, .45);
      rig.root.setLocalEulerAngles(0, 0, rig.defeated ? direction * 9 : hitShake * 8);
      if (hadFeedback && rig.hit === 0 && rig.heal === 0 && rig.exposed === 0) applyActorAppearance(actor);
    }

    for (const rig of cards.values()) {
      if (!rig.visual.underCard) positionCard(rig, dt, reduceMotion.matches);
    }
    for (const rig of cards.values()) {
      if (!rig.visual.underCard) continue;
      const host = cards.get(rig.visual.underCard);
      if (host) positionAttachedCard(rig, host);
      else positionCard(rig, dt, reduceMotion.matches);
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
    setCards(visuals): void {
      if (destroyed) return;
      detailScrim.enabled = visuals.some((visual) => visual.detail);
      const live = new Set(visuals.map((visual) => visual.uid));
      for (const [uid, rig] of cards) {
        if (live.has(uid)) continue;
        rig.root.destroy();
        rig.material.destroy();
        cards.delete(uid);
      }
      for (let layer = 0; layer < visuals.length; layer++) {
        const visual = visuals[layer];
        let rig = cards.get(visual.uid);
        if (!rig) {
          rig = makeCard(visual, layer);
          cards.set(visual.uid, rig);
        } else {
          const textureKey = cardTextureKey(visual);
          if (rig.textureKey !== textureKey) {
            const texture = getCardTexture(visual, textureKey);
            rig.material.diffuseMap = texture;
            rig.material.emissiveMap = texture;
            rig.material.opacityMap = texture;
            rig.textureKey = textureKey;
          }
          rig.visual = visual;
          rig.layer = layer;
          syncCardMaterial(rig);
          syncCardDots(rig);
        }
      }
      for (const rig of cards.values()) {
        if (!rig.visual.underCard) positionCard(rig, 0, reduceMotion.matches);
      }
      for (const rig of cards.values()) {
        if (!rig.visual.underCard) continue;
        const host = cards.get(rig.visual.underCard);
        if (host) positionAttachedCard(rig, host);
        else positionCard(rig, 0, reduceMotion.matches);
      }
    },

    setState(state: CombatState): void {
      if (destroyed) return;
      for (const actor of ['guard', 'bob'] as const) {
        const rig = actors.get(actor);
        if (!rig) continue;
        rig.defeated = state.actors[actor].hp <= 0;
        rig.root.enabled = true;
        applyActorAppearance(actor);
      }
    },

    setPointer(x: number, y: number): void {
      pointerX = Math.max(0, Math.min(DESIGN_WIDTH, x));
      pointerY = Math.max(0, Math.min(DESIGN_HEIGHT, y));
    },

    setTarget(nextTarget: ActorId | null): void {
      const previous = target;
      target = nextTarget;
      if (previous) applyActorAppearance(previous);
      if (target) applyActorAppearance(target);
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

    playEvent(event: CombatEvent): void {
      if (destroyed) return;
      if (event.kind === 'action' && event.actor) {
        const rig = actors.get(event.actor);
        if (rig && !rig.defeated) rig.action = .26;
      }
      if (event.kind === 'damage' && event.target) {
        const rig = actors.get(event.target);
        if (rig) {
          rig.hit = .34;
          applyActorAppearance(event.target);
        }
      }
      if (event.kind === 'heal' && event.target) {
        const rig = actors.get(event.target);
        if (rig && !rig.defeated) {
          rig.heal = .42;
          applyActorAppearance(event.target);
        }
      }
      if (event.kind === 'exposed' && event.target) {
        const rig = actors.get(event.target);
        if (rig && !rig.defeated) {
          rig.exposed = .36;
          applyActorAppearance(event.target);
        }
      }
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncSize);
      app.off('update', update);
      for (const rig of cards.values()) rig.material.destroy();
      cards.clear();
      for (const rig of actors.values()) rig.material.destroy();
      for (const texture of cardTextures.values()) texture.destroy();
      for (const texture of actorTextures.values()) texture.destroy();
      for (const material of energyBadgeMaterials.values()) material.destroy();
      builderCardBackMaterial.destroy();
      builderCardBackTexture.destroy();
      enemyCardBackMaterial.destroy();
      enemyCardBackTexture.destroy();
      detailScrimMaterial.destroy();
      backdropTexture.destroy();
      backdropMaterial.destroy();
      shelfMaterial.destroy();
      shelfEdgeMaterial.destroy();
      amberMaterial.destroy();
      foregroundMaterial.destroy();
      targetWellMaterial.destroy();
      targetDimMaterial.destroy();
      targetTealMaterial.destroy();
      targetAmberMaterial.destroy();
      app.destroy();
    },
  };
}
