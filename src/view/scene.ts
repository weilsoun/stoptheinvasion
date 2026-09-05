import {
  Application,
  BLEND_NORMAL,
  Color,
  Entity,
  GAMMA_SRGB,
  PROJECTION_ORTHOGRAPHIC,
  SHADOW_PCF3,
  StandardMaterial,
  Texture,
  TONEMAP_ACES,
} from 'playcanvas';
import type { ActorId, CombatEvent, CombatState } from '../game/types';
import { drawActorArt, drawArenaArt, drawCardArt } from './art';
import { CARD_TARGET_GAP, CARD_TARGET_Y, type CardVisual, type ScenePort } from './types';

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const WORLD_SCALE = 100;

type Spring = { value: number; velocity: number };
type ActorRig = {
  root: Entity;
  material: StandardMaterial;
  baseX: number;
  defeated: boolean;
  hit: number;
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
  material: StandardMaterial;
  dots: CardDotRig[];
  textureKey: string;
  visual: CardVisual;
  layer: number;
  x: Spring;
  y: Spring;
  roll: Spring;
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
  type: 'box' | 'sphere' | 'cylinder',
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
  app.scene.ambientLight = new Color(.15, .24, .23);
  app.scene.exposure = 1.05;

  const camera = new Entity('FightCamera', app);
  camera.addComponent('camera', {
    clearColor: new Color(.025, .07, .075),
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
  const backdropTexture = textureFromCanvas(app, drawArenaArt(), 'MOREMART procedural arena');
  const backdropMaterial = texturedMaterial(backdropTexture, false, .1);
  primitive(app, arenaRoot, 'Painted_Arena', 'box', [0, 0, -.65], [19.5, 11.1, .08], backdropMaterial);

  // A few real depth cues catch highlights while the painted shelf bays carry the detail.
  const shelfMaterial = solidMaterial(new Color(.12, .24, .23), .5);
  const shelfEdgeMaterial = solidMaterial(new Color(.38, .43, .34), .65);
  for (const side of [-8.9, 8.9]) {
    primitive(app, arenaRoot, 'Shelf_Post', 'box', [side, .55, -.22], [.13, 3.9, .32], shelfEdgeMaterial, true);
    for (const y of [-.75, .15, 1.05, 1.95]) {
      primitive(app, arenaRoot, 'Shelf_Lip', 'box', [side, y, -.17], [1.3, .09, .38], shelfMaterial, true);
    }
  }
  const amberMaterial = solidMaterial(new Color(1, .57, .17), .6, new Color(.7, .26, .035));
  for (const x of [-6.6, -2.2, 2.2, 6.6]) {
    primitive(app, arenaRoot, 'Amber_Practical', 'box', [x, 3.72, -.1], [1.15, .08, .18], amberMaterial);
  }
  const foregroundMaterial = solidMaterial(new Color(.79, .47, .08), .42);
  const leftBollard = primitive(app, arenaRoot, 'Foreground_Bollard', 'cylinder', [-8.55, -4.45, .35], [.28, .75, .28], foregroundMaterial, true);
  leftBollard.setLocalEulerAngles(0, 0, -8);
  const rightBollard = primitive(app, arenaRoot, 'Foreground_Bollard', 'cylinder', [8.62, -4.4, .35], [.3, .84, .3], foregroundMaterial, true);
  rightBollard.setLocalEulerAngles(0, 0, 7);

  const key = new Entity('Warm_Aisle_Key', app);
  key.addComponent('light', {
    type: 'omni',
    color: new Color(1, .63, .32),
    intensity: 2.1,
    range: 24,
    castShadows: true,
    shadowType: SHADOW_PCF3,
    shadowResolution: 1024,
    shadowBias: .15,
  });
  key.setPosition(-2.5, 5.2, 7.5);
  app.root.addChild(key);

  const fill = new Entity('Acidic_Fill', app);
  fill.addComponent('light', {
    type: 'omni',
    color: new Color(.36, .88, .24),
    intensity: .7,
    range: 11,
    castShadows: false,
  });
  fill.setPosition(5.2, -.25, 5.5);
  app.root.addChild(fill);

  const handLight = new Entity('Tabletop_Reading_Light', app);
  handLight.addComponent('light', {
    type: 'omni',
    color: new Color(1, .9, .72),
    intensity: .8,
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
    const root = new Entity(actor === 'guard' ? 'Infected_Security_Guard' : 'Hardware_Worker_Bob', app);
    const surface = primitive(app, root, `${actor}_Illustrated_Surface`, 'box', [0, 0, 0], [3.2, 3.5, .09], material, true);
    surface.setLocalPosition(0, 0, 0);
    const baseX = actor === 'bob' ? worldX(410) : worldX(1500);
    root.setPosition(baseX, worldY(400), .45);
    arenaRoot.addChild(root);
    actors.set(actor, { root, material, baseX, defeated: false, hit: 0, action: 0 });
  }

  const targetWellMaterial = solidMaterial(new Color(.025, .075, .08), .3);
  const targetDimMaterial = solidMaterial(new Color(.34, .4, .39), .5);
  const targetTealMaterial = solidMaterial(new Color(.08, .82, .72), .7, new Color(.02, .25, .21));
  const targetAmberMaterial = solidMaterial(new Color(1, .57, .16), .7, new Color(.34, .13, .02));

  const cardTextures = new Map<string, Texture>();
  const cards = new Map<string, CardRig>();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pointerX = DESIGN_WIDTH / 2;
  let pointerY = DESIGN_HEIGHT / 2;
  let target: ActorId | null = null;
  let destroyed = false;

  function cardTextureKey(visual: CardVisual): string {
    return `${visual.locked ? 'locked' : 'player'}:${visual.definition.id}:damage:${visual.damageModifier}:targets:${visual.targets.length > 0}`;
  }

  function getCardTexture(visual: CardVisual, key = cardTextureKey(visual)): Texture {
    let texture = cardTextures.get(key);
    if (!texture) {
      texture = textureFromCanvas(
        app,
        drawCardArt(visual.definition, visual.locked, visual.damageModifier, visual.targets.length > 0),
        `${visual.locked ? 'Locked intent' : 'Card'} ${visual.definition.name}`,
      );
      cardTextures.set(key, texture);
    }
    return texture;
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


  function makeCard(visual: CardVisual, layer: number): CardRig {
    const textureKey = cardTextureKey(visual);
    const material = texturedMaterial(getCardTexture(visual, textureKey), true, .025);
    material.specular = new Color(.16, .14, .1);
    material.gloss = .38;
    material.clearCoat = .08;
    material.clearCoatGloss = .4;
    material.update();
    const root = new Entity(`Card_${visual.uid}`, app);
    const surface = primitive(app, root, 'Printed_Lit_Card', 'box', [0, 0, 0], [visual.width / WORLD_SCALE, visual.height / WORLD_SCALE, .055], material, true);
    const x = worldX(visual.x + visual.width / 2);
    const y = worldY(visual.y + visual.height / 2);
    const straight = visual.dragged || visual.queued;
    root.setPosition(x, y, visual.dragged ? 4 : 2.5 + layer * .002);
    root.setEulerAngles(0, 0, straight ? 0 : -visual.rotation);
    app.root.addChild(root);
    const rig: CardRig = {
      root,
      surface,
      material,
      dots: [],
      textureKey,
      visual,
      layer,
      x: { value: x, velocity: 0 },
      y: { value: y, velocity: 0 },
      roll: { value: straight ? 0 : -visual.rotation, velocity: 0 },
      displayedWidth: visual.width,
      displayedHeight: visual.height,
    };
    syncCardDots(rig);
    return rig;
  }

  function positionCard(rig: CardRig, dt: number, immediate: boolean): void {
    const visual = rig.visual;
    immediate ||= visual.queued && !visual.dragged;
    const cx = visual.x + visual.width / 2;
    const cy = visual.y + visual.height / 2;
    const advance = immediate ? snap : spring;
    const rotate = visual.queued ? snap : advance;
    advance(rig.x, worldX(cx), dt);
    advance(rig.y, worldY(cy), dt);
    rotate(rig.roll, visual.dragged || visual.queued ? 0 : -visual.rotation, dt);
    rig.root.setPosition(rig.x.value, rig.y.value, visual.dragged ? 4 : 2.5 + rig.layer * .002 + (visual.hovered ? .55 : 0) + (visual.queued ? .08 : 0));
    rig.root.setEulerAngles(0, 0, rig.roll.value);
    const sizeBlend = immediate ? 1 : 1 - Math.exp(-18 * dt);
    rig.displayedWidth += (visual.width - rig.displayedWidth) * sizeBlend;
    rig.displayedHeight += (visual.height - rig.displayedHeight) * sizeBlend;
    rig.surface.setLocalScale(rig.displayedWidth / WORLD_SCALE, rig.displayedHeight / WORLD_SCALE, .055);
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
    const parallaxX = (pointerX / DESIGN_WIDTH - .5) * .09;
    const parallaxY = (.5 - pointerY / DESIGN_HEIGHT) * .055;
    arenaRoot.setLocalPosition(parallaxX, parallaxY, 0);
    key.setPosition(-2.5 + parallaxX * 5, 5.2 + parallaxY * 4, 7.5);

    for (const [actor, rig] of actors) {
      const hadHit = rig.hit > 0;
      rig.hit = Math.max(0, rig.hit - dt);
      rig.action = Math.max(0, rig.action - dt);
      const actionPhase = rig.action > 0 ? Math.sin((rig.action / .26) * Math.PI) : 0;
      const hitShake = rig.hit > 0 ? Math.sin(rig.hit * 92) * rig.hit * .32 : 0;
      const direction = actor === 'bob' ? 1 : -1;
      rig.root.setLocalPosition(rig.baseX + actionPhase * direction * .28 + hitShake, worldY(400) + Math.abs(hitShake) * .15, .45);
      rig.root.setLocalEulerAngles(0, 0, rig.defeated ? direction * 9 : hitShake * 8);
      if (hadHit && rig.hit === 0) applyActorAppearance(actor);
    }

    for (const rig of cards.values()) {
      positionCard(rig, dt, reduceMotion.matches);
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
        const appearanceChanged = !rig || rig.visual.dimmed !== visual.dimmed;
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
            rig.material.update();
          }
          rig.visual = visual;
          rig.layer = layer;
          syncCardDots(rig);
          if (visual.queued) {
            snap(rig.roll, 0);
            rig.root.setEulerAngles(0, 0, 0);
          }
        }
        if (appearanceChanged) {
          rig.material.diffuse = visual.dimmed ? new Color(.32, .36, .36) : new Color(1, 1, 1);
          rig.material.opacity = visual.dimmed ? .62 : 1;
          rig.material.update();
        }
        positionCard(rig, 0, reduceMotion.matches);
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
