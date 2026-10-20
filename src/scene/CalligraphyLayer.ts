import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { annotations, type ScrollCalligraphy } from '../data/annotations';
import type { ChapterId } from '../data/chapters';
import type { CameraSample, SceneManifest } from '../types';
import './CalligraphyLayer.css';

interface MountedCalligraphy { object: CSS3DObject; config: ScrollCalligraphy; anchor: THREE.Vector3 }
export interface ArtTextLayer {
  id: string; name: string; title: string; lines: string[];
  /** Column-major matrix for a unit XY plane; scale includes its world width/height. */
  matrix: number[]; domWidth: number; domHeight: number; color: string; narrative: string;
  /** A seal is a neutral contemporary display mark, never a historical facsimile. */
  variant?: 'caption' | 'seal';
  /** Independent of the opening annotation range; omitted means the entire scroll. */
  range?: [number, number];
  /** Opt-in short vertical typography; existing captions retain their original layout. */
  layout?: 'vertical';
  /** Editorial route anchor used to select one active vertical group. */
  anchorProgress?: number;
  /** Smooth fade distance in normalized route progress, independent of motion settings. */
  fade?: number;
  /** Optional neutral contemporary display mark, never a historical seal facsimile. */
  seal?: string;
  bodyColor?: string;
  /** Typography sizes in the editable DOM design frame, shared with Blender. */
  titleSize?: number;
  bodySize?: number;
  /** Optional editorial position for a specific responsive aspect range. */
  narrowPlacement?: { x: number; y: number; maxAspect?: number };
}
interface MountedArtText {
  object: CSS3DObject; config: ArtTextLayer; anchor: THREE.Vector3; baseScale: THREE.Vector3;
  /** Measured while attached and visible; CSS3D hides inactive groups with display:none. */
  verticalInk?: { left: number; top: number; width: number; height: number };
}

/**
 * Real HTML lettering on a fixed plane in the original artwork space.
 * A separate transparent CSS3D pass uses the exact WebGL camera; no camera or
 * Blender asset is changed. The overlay never captures painting interactions.
 */
export class CalligraphyLayer {
  private renderer = new CSS3DRenderer();
  private scene = new THREE.Scene();
  private mounted: MountedCalligraphy[] = [];
  private artText: MountedArtText[] = [];
  private compactOpening?: MountedArtText;
  private width = 1;
  private height = 1;

  constructor(host: HTMLElement) {
    this.renderer.domElement.className = 'calligraphy-layer';
    this.renderer.domElement.setAttribute('aria-label', '卷内题字');
    Object.assign(this.renderer.domElement.style, { position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none', overflow: 'hidden' });
    host.appendChild(this.renderer.domElement);
  }

  load(chapterId: number, manifest: SceneManifest, textLayers: ArtTextLayer[] = []) {
    this.clear();
    const config = annotations[chapterId as ChapterId];
    if (config?.display.enabled && manifest.cameras.length) {
      const stopProgress = manifest.stops[config.placement.stop]?.progress ?? 0;
      const viewpoint = this.sampleViewpoint(manifest.cameras, stopProgress);
      const element = this.createElement(config);
      const object = new CSS3DObject(element);
      const quaternion = new THREE.Quaternion().fromArray(viewpoint.quaternion).normalize();
      const { localX, localY, distance, width, height, domWidth, domHeight } = config.placement;
      object.position.set(localX, localY, -distance).applyQuaternion(quaternion).add(new THREE.Vector3().fromArray(viewpoint.position));
      object.quaternion.copy(quaternion);
      object.scale.set(width / domWidth, height / domHeight, 1);
      this.scene.add(object);
      this.mounted.push({ object, config, anchor: object.position.clone() });
    }
    for (const layer of textLayers) {
      if (layer.matrix.length !== 16 || !layer.matrix.every(Number.isFinite) || !Number.isFinite(layer.domWidth) || !Number.isFinite(layer.domHeight) || layer.domWidth <= 0 || layer.domHeight <= 0) continue;
      this.artText.push(this.mountArtText(chapterId, layer));
    }
    // The original opening is a web annotation too. Reuse its copy in the
    // compact paper band without adding a second manifest or Blender layer.
    const opening = this.mounted[0]?.object;
    if (chapterId === 3 && config?.display.enabled && opening && textLayers.some(layer => layer.layout === 'vertical')) {
      const nextStart = Math.min(...textLayers.filter(layer => layer.layout === 'vertical' && layer.range && layer.range[0] > 0).map(layer => layer.range![0]));
      const end = Math.min(config.display.range[1], nextStart);
      const layer: ArtTextLayer = {
        id: `chapter-${chapterId}-compact-opening`, name: `${config.content.title}，卷首题字`, title: config.content.title,
        lines: config.display.poem ? config.content.poem : [], seal: config.seal.text,
        matrix: new THREE.Matrix4().compose(opening.position, opening.quaternion, new THREE.Vector3(config.placement.height * 200 / 360, config.placement.height, 1)).toArray(),
        domWidth: 200, domHeight: 360, titleSize: 50, bodySize: 34,
        color: config.style.ink, bodyColor: config.style.secondaryInk, narrative: config.display.rationale,
        layout: 'vertical', range: [config.display.range[0], end], anchorProgress: config.display.range[0], fade: config.display.fade,
      };
      this.compactOpening = this.mountArtText(chapterId, layer);
      this.compactOpening.object.element.dataset.compactOpening = 'true';
      this.compactOpening.object.element.style.fontFamily = config.style.fontFamily;
      this.compactOpening.object.element.style.setProperty('--calligraphy', config.style.fontFamily);
    }
  }

  private mountArtText(chapterId: number, layer: ArtTextLayer): MountedArtText {
    const element = this.createArtTextElement(chapterId, layer);
    // Measure before CSS3DRenderer hides inactive groups with display:none.
    if (layer.layout === 'vertical') this.renderer.domElement.appendChild(element);
    const object = new CSS3DObject(element);
    const worldScale = new THREE.Vector3();
    new THREE.Matrix4().fromArray(layer.matrix).decompose(object.position, object.quaternion, worldScale);
    object.scale.set(worldScale.x / layer.domWidth, worldScale.y / layer.domHeight, worldScale.z);
    this.scene.add(object);
    const band = element.querySelector<HTMLElement>('.art-text-layer__vertical-band');
    const verticalInk = band ? { left: band.offsetLeft - layer.domWidth / 2, top: layer.domHeight / 2 - band.offsetTop, width: band.offsetWidth, height: band.offsetHeight } : undefined;
    return { object, config: layer, anchor: object.position.clone(), baseScale: object.scale.clone(), verticalInk };
  }

  resize(width: number, height: number) { this.width = width; this.height = height; this.renderer.setSize(width, height); }

  /** Reserve paper above the painting when a narrow frame has no safe side margin. */
  getCompactLayout(width: number, height: number): { reserveFraction: number } | null {
    if (width <= 0 || height <= 0) return null;
    const minimumInk = this.minimumVerticalInk();
    if (!minimumInk) return null;
    if (width / height > 1.2 && width >= minimumInk.width * 7 && minimumInk.height <= height * .46) return null;
    return { reserveFraction: THREE.MathUtils.clamp((minimumInk.height + height * .12) / height, .30, .72) };
  }

  /** Content sets the minimum reading height; short windows can scroll the page. */
  getMinimumReadingHeight(): number {
    const minimumInk = this.minimumVerticalInk();
    return minimumInk ? Math.ceil(minimumInk.height / .28) : 0;
  }

  private minimumVerticalInk(): { width: number; height: number } | null {
    const vertical = [...this.artText, ...(this.compactOpening ? [this.compactOpening] : [])]
      .filter(item => item.config.layout === 'vertical' && item.verticalInk);
    if (!vertical.length) return null;
    const minimumInk = vertical.map(({ object, config, verticalInk }) => {
      const body = Number(object.element.dataset.domBodySize), title = Number(object.element.dataset.domTitleSize);
      const scale = Math.max(config.lines.length ? 14 / body : 0, 18 / title);
      return { width: verticalInk!.width * scale, height: verticalInk!.height * scale };
    });
    return { width: Math.max(...minimumInk.map(ink => ink.width)), height: Math.max(...minimumInk.map(ink => ink.height)) };
  }

  render(camera: THREE.Camera, progress: number) {
    const compactOpening = this.getCompactLayout(this.width, this.height) ? this.compactOpening : undefined;
    for (const { object, config, anchor } of this.mounted) {
      const [start, end] = config.display.range;
      const visible = !compactOpening && progress >= start && progress <= end;
      object.visible = visible;
      // Keep opening labels immediately readable; fade only as their scene leaves.
      const opacity = visible ? Math.min(1, (end - progress) / Math.max(0.0001, config.display.fade)) : 0;
      object.element.style.opacity = String(Math.max(0, opacity));
      object.element.setAttribute('aria-hidden', String(!visible || opacity < 0.05));
      if (visible && this.compactOpening) this.protectOpeningMargin(object, config, anchor, camera);
    }
    const activeVertical = [...this.artText, ...(compactOpening ? [compactOpening] : [])].filter(({ config }) => {
      const [start, end] = config.range ?? [0, 1];
      return config.layout === 'vertical' && progress >= start && progress <= end;
    }).sort((a, b) => {
      const anchor = (config: ArtTextLayer) => config.anchorProgress ?? ((config.range?.[0] ?? 0) + (config.range?.[1] ?? 1)) / 2;
      return Math.abs(progress - anchor(a.config)) - Math.abs(progress - anchor(b.config));
    })[0];
    for (const item of [...this.artText, ...(this.compactOpening ? [this.compactOpening] : [])]) {
      const { object, config } = item;
      const [start, end] = config.range ?? [0, 1];
      let opacity = 0;
      if (progress >= start && progress <= end) {
        if (config.layout === 'vertical') {
          if (item === activeVertical) opacity = this.verticalRangeOpacity(config, progress) * this.placeReadableVerticalText(item, camera);
        } else opacity = this.placeReadableText(item, camera);
      }
      const visible = opacity > 0.001;
      object.visible = visible;
      object.element.style.opacity = String(opacity);
      object.element.setAttribute('aria-hidden', String(opacity < 0.05));
      object.element.dataset.progress = progress.toFixed(6);
    }
    this.renderer.render(this.scene, camera);
  }

  private verticalRangeOpacity(config: ArtTextLayer, progress: number) {
    const [start, end] = config.range ?? [0, 1];
    const fade = Math.min(Math.max(0, config.fade ?? 0.008), Math.max(0, (end - start) / 2));
    if (fade <= 0) return 1;
    const enter = start <= 0 ? 1 : THREE.MathUtils.smoothstep(progress, start, start + fade);
    const leave = end >= 1 ? 1 : 1 - THREE.MathUtils.smoothstep(progress, end - fade, end);
    return Math.min(enter, leave);
  }

  /** Keep the refined scroll's original side opening clear of a window edge. */
  private protectOpeningMargin(object: CSS3DObject, config: ScrollCalligraphy, anchor: THREE.Vector3, camera: THREE.Camera) {
    const clip = anchor.clone().project(camera);
    const xs = [-1, 1].flatMap(x => [-1, 1].map(y => {
      const point = new THREE.Vector3(x * config.placement.width / 2, y * config.placement.height / 2, 0).applyQuaternion(object.quaternion).add(anchor).project(camera);
      return (point.x + 1) * this.width / 2;
    }));
    const margin = Math.min(this.width, this.height) * .025;
    const left = Math.min(...xs), right = Math.max(...xs);
    const dx = left < margin ? margin - left : right > this.width - margin ? this.width - margin - right : 0;
    object.position.set(clip.x + dx * 2 / this.width, clip.y, clip.z).unproject(camera);
  }

  dispose() { this.clear(); this.renderer.domElement.remove(); }

  private clear() {
    for (const { object } of this.mounted) { this.scene.remove(object); object.element.remove(); }
    for (const { object } of this.artText) { this.scene.remove(object); object.element.remove(); }
    if (this.compactOpening) { this.scene.remove(this.compactOpening.object); this.compactOpening.object.element.remove(); }
    this.mounted = [];
    this.artText = [];
    this.compactOpening = undefined;
  }

  private sampleViewpoint(samples: CameraSample[], progress: number) {
    const index = samples.findIndex(sample => sample.progress >= progress);
    if (index <= 0) return samples[0];
    const a = samples[index - 1], b = samples[index];
    const mix = (progress - a.progress) / Math.max(0.000001, b.progress - a.progress);
    const quaternion = new THREE.Quaternion().fromArray(a.quaternion).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternion).normalize(), mix);
    const position = new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), mix);
    return { position: position.toArray() as [number, number, number], quaternion: quaternion.toArray() as [number, number, number, number] };
  }

  /** Keep a scene-anchored short label readable without changing the camera or opening titles. */
  private placeReadableText(item: MountedArtText, camera: THREE.Camera) {
    const { object, config, anchor, baseScale } = item;
    const clip = anchor.clone().project(camera);
    const anchorX = (clip.x + 1) * this.width / 2;
    const anchorY = (1 - clip.y) * this.height / 2;
    if (clip.z < -1 || clip.z > 1 || anchorX <= 0 || anchorX >= this.width || anchorY <= 0 || anchorY >= this.height) return 0;
    const projectBounds = (factor: number) => {
      const points = [-1, 1].flatMap(x => [-1, 1].map(y => {
        const point = new THREE.Vector3(x * config.domWidth * baseScale.x * factor / 2, y * config.domHeight * baseScale.y * factor / 2, 0)
          .applyQuaternion(object.quaternion).add(anchor).project(camera);
        return { x: (point.x + 1) * this.width / 2, y: (1 - point.y) * this.height / 2 };
      }));
      return { left: Math.min(...points.map(point => point.x)), right: Math.max(...points.map(point => point.x)), top: Math.min(...points.map(point => point.y)), bottom: Math.max(...points.map(point => point.y)) };
    };
    const original = projectBounds(1);
    const originalWidth = original.right - original.left, originalHeight = original.bottom - original.top;
    if (originalWidth <= 0.001 || originalHeight <= 0.001) return 0;
    const pixelsPerDomY = originalHeight / config.domHeight;
    const bodySize = config.domHeight * 0.12, titleSize = config.domHeight * (config.variant === 'seal' ? 0.38 : 0.16);
    const minimumScale = Math.max(1, config.lines.length ? 12 / (bodySize * pixelsPerDomY) : 1, 16 / (titleSize * pixelsPerDomY));
    const margin = Math.min(this.width, this.height) * 0.025;
    const factor = Math.min(minimumScale, (this.width - margin * 2) / originalWidth, (this.height - margin * 2) / originalHeight);
    object.scale.set(baseScale.x * factor, baseScale.y * factor, baseScale.z);
    const bounds = projectBounds(factor);
    const dx = bounds.left < margin ? margin - bounds.left : bounds.right > this.width - margin ? this.width - margin - bounds.right : 0;
    const dy = bounds.top < margin ? margin - bounds.top : bounds.bottom > this.height - margin ? this.height - margin - bounds.bottom : 0;
    // Unproject at the anchor depth so edge protection remains on the same camera plane.
    object.position.set(clip.x + dx * 2 / this.width, clip.y - dy * 2 / this.height, clip.z).unproject(camera);
    object.element.dataset.screenBodySize = String(bodySize * pixelsPerDomY * factor);
    object.element.dataset.screenTitleSize = String(titleSize * pixelsPerDomY * factor);
    const edgeDistance = Math.min(anchorX, this.width - anchorX, anchorY, this.height - anchorY);
    const fadeDistance = Math.min(this.width, this.height) * 0.08;
    return THREE.MathUtils.smoothstep(edgeDistance, 0, fadeDistance);
  }

  /** Fit actual vertical ink, not the much larger editable design frame. */
  private placeReadableVerticalText(item: MountedArtText, camera: THREE.Camera) {
    const { object, config, anchor, baseScale, verticalInk } = item;
    const clip = anchor.clone().project(camera);
    if (!Number.isFinite(clip.z) || clip.z < -1 || clip.z > 1) return 0;
    if (!verticalInk) return 0;
    const bodySize = Number(object.element.dataset.domBodySize);
    const titleSize = Number(object.element.dataset.domTitleSize);
    const { width, height } = verticalInk;
    if (width <= 0 || height <= 0 || !bodySize || !titleSize) return 0;
    const localLeft = verticalInk.left;
    const localTop = verticalInk.top;
    const projectBounds = (factor: number) => {
      const points = [localLeft, localLeft + width].flatMap(x => [localTop, localTop - height].map(y => {
        const point = new THREE.Vector3(x * baseScale.x * factor, y * baseScale.y * factor, 0)
          .applyQuaternion(object.quaternion).add(anchor).project(camera);
        return { x: (point.x + 1) * this.width / 2, y: (1 - point.y) * this.height / 2 };
      }));
      return { left: Math.min(...points.map(point => point.x)), right: Math.max(...points.map(point => point.x)), top: Math.min(...points.map(point => point.y)), bottom: Math.max(...points.map(point => point.y)) };
    };
    const original = projectBounds(1);
    const originalWidth = original.right - original.left, originalHeight = original.bottom - original.top;
    if (originalWidth <= 0.001 || originalHeight <= 0.001) return 0;
    const pixelsPerDom = Math.min(originalWidth / width, originalHeight / height);
    const minimumScale = Math.max(config.lines.length ? 14 / (bodySize * pixelsPerDom) : 1, 18 / (titleSize * pixelsPerDom));
    const compact = this.getCompactLayout(this.width, this.height);
    const safe = { left: this.width * .07, right: this.width * .93, top: this.height * (compact ? .05 : .24), bottom: this.height * (compact ? compact.reserveFraction - .03 : .70) };
    const maximumScale = Math.min((safe.right - safe.left) / originalWidth, (safe.bottom - safe.top) / originalHeight);
    // Short copy can satisfy both minima inside the safe band. Preserve readable
    // glyphs and expose a measurable overflow if an editor supplies longer copy.
    const factor = Math.max(minimumScale, Math.min(1, maximumScale));
    object.scale.set(baseScale.x * factor, baseScale.y * factor, baseScale.z);
    const bounds = projectBounds(factor);
    const clampOffset = (lower: number, upper: number, safeLower: number, safeUpper: number) => upper - lower > safeUpper - safeLower
      ? (safeLower + safeUpper - lower - upper) / 2
      : lower < safeLower ? safeLower - lower : upper > safeUpper ? safeUpper - upper : 0;
    const requested = compact ? { x: .5, y: compact.reserveFraction / 2 }
      : config.narrowPlacement && this.width / this.height <= (config.narrowPlacement.maxAspect ?? 1.15) ? config.narrowPlacement : null;
    const initialDx = requested ? requested.x * this.width - (bounds.left + bounds.right) / 2 : 0;
    const initialDy = requested ? requested.y * this.height - (bounds.top + bounds.bottom) / 2 : 0;
    const dx = initialDx + clampOffset(bounds.left + initialDx, bounds.right + initialDx, safe.left, safe.right);
    const dy = initialDy + clampOffset(bounds.top + initialDy, bounds.bottom + initialDy, safe.top, safe.bottom);
    // Only the selected semantic group reaches this path. Reposition on its
    // original depth plane, so a side label can remain readable on a narrow view.
    object.position.set(clip.x + dx * 2 / this.width, clip.y - dy * 2 / this.height, clip.z).unproject(camera);
    object.element.dataset.screenBodySize = String(bodySize * pixelsPerDom * factor);
    object.element.dataset.screenTitleSize = String(titleSize * pixelsPerDom * factor);
    object.element.dataset.layoutOverflow = String(minimumScale > maximumScale + .001);
    object.element.dataset.repositioned = String(Math.abs(dx) > .01 || Math.abs(dy) > .01);
    object.element.dataset.compactReserve = compact ? String(compact.reserveFraction) : '0';
    return 1;
  }

  private createElement(config: ScrollCalligraphy) {
    const element = document.createElement('section');
    element.className = 'artwork-calligraphy';
    element.dataset.annotationId = config.id;
    element.dataset.chapter = String(config.chapterId);
    element.dataset.readingStop = String(config.placement.stop + 1);
    Object.assign(element.style, {
      width: `${config.placement.domWidth}px`, height: `${config.placement.domHeight}px`,
      fontFamily: config.style.fontFamily,
    });
    for (const [name, value] of Object.entries({
      '--calligraphy-ink': config.style.ink,
      '--calligraphy-secondary': config.style.secondaryInk,
      '--calligraphy-title-size': `${config.style.titleSize}px`,
      '--calligraphy-poem-size': `${config.style.poemSize}px`,
      '--calligraphy-intro-size': `${config.style.introSize}px`,
      '--calligraphy-letter-spacing': `${config.style.letterSpacing}px`,
    })) element.style.setProperty(name, value);
    const title = document.createElement('h2');
    title.className = 'artwork-calligraphy-title';
    title.textContent = config.content.title;
    element.appendChild(title);
    if (config.display.poem) {
      const poem = document.createElement('div');
      poem.className = 'artwork-calligraphy-poem';
      for (const line of config.content.poem) {
        const column = document.createElement('p'); column.textContent = line; poem.appendChild(column);
      }
      element.appendChild(poem);
    }
    if (config.display.intro) {
      const intro = document.createElement('p');
      intro.className = 'artwork-calligraphy-intro'; intro.textContent = config.content.intro;
      element.appendChild(intro);
    }
    const seal = document.createElement('span');
    seal.className = 'artwork-calligraphy-seal';
    // A neutral contemporary exhibition mark; never presented as a historical seal.
    seal.setAttribute('aria-label', '牡丹，数字展陈装饰印章');
    Object.assign(seal.style, {
      left: `${config.seal.x}px`, top: `${config.seal.y}px`,
      width: `${config.seal.width}px`, height: `${config.seal.height}px`,
      fontSize: `${config.seal.fontSize}px`, color: config.seal.color,
    });
    if (config.seal.assetUrl) {
      const image = document.createElement('img'); image.src = config.seal.assetUrl; image.alt = ''; seal.appendChild(image);
    } else { seal.textContent = config.seal.text; }
    element.appendChild(seal);
    return element;
  }

  private createArtTextElement(chapterId: number, config: ArtTextLayer) {
    const element = document.createElement('section');
    element.className = `art-text-layer${config.variant === 'seal' ? ' art-text-layer--seal' : ''}${config.layout === 'vertical' ? ' art-text-layer--vertical' : ''}`;
    element.dataset.artTextId = config.id;
    element.dataset.chapter = String(chapterId);
    element.dataset.narrative = config.narrative;
    element.setAttribute('aria-label', config.name);
    Object.assign(element.style, {
      width: `${config.domWidth}px`, height: `${config.domHeight}px`, color: config.color,
    });
    element.style.setProperty('--art-text-title-size', `${config.domHeight * (config.variant === 'seal' ? 0.38 : 0.16)}px`);
    element.style.setProperty('--art-text-body-size', `${config.domHeight * 0.12}px`);
    element.style.setProperty('--art-text-padding', `${config.domHeight * 0.04}px`);
    if (config.layout === 'vertical') {
      const titleSize = config.titleSize ?? config.domHeight * .13;
      const bodySize = config.bodySize ?? config.domHeight * .09;
      element.style.setProperty('--art-text-title-size', `${titleSize}px`);
      element.style.setProperty('--art-text-body-size', `${bodySize}px`);
      element.style.setProperty('--art-text-column-gap', `${bodySize * .65}px`);
      element.style.setProperty('--art-text-body-ink', config.bodyColor ?? config.color);
      element.dataset.domBodySize = String(bodySize);
      element.dataset.domTitleSize = String(titleSize);
    }
    const band = config.layout === 'vertical' ? document.createElement('div') : element;
    if (band !== element) { band.className = 'art-text-layer__vertical-band'; element.appendChild(band); }
    const title = document.createElement('h2');
    title.className = 'art-text-layer__title';
    title.textContent = config.title;
    if (config.layout === 'vertical') {
      const size = Number(element.dataset.domTitleSize);
      title.style.width = `${size * 1.12}px`;
      title.style.height = `${Array.from(config.title).length * size * 1.08}px`;
    }
    band.appendChild(title);
    const lines = document.createElement('div');
    lines.className = 'art-text-layer__lines';
    for (const line of config.lines) {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      if (config.layout === 'vertical') {
        const size = Number(element.dataset.domBodySize);
        paragraph.style.width = `${size * 1.2}px`;
        paragraph.style.height = `${Array.from(line).length * size * 1.04}px`;
      }
      lines.appendChild(paragraph);
    }
    if (config.lines.length) band.appendChild(lines);
    if (config.layout === 'vertical' && config.seal) {
      const seal = document.createElement('span');
      seal.className = 'art-text-layer__inline-seal';
      seal.textContent = config.seal;
      const size = Number(element.dataset.domBodySize);
      const sealFont = size * .72;
      seal.style.width = `${size * .95}px`;
      seal.style.height = `${Math.max(sealFont * 1.3, Array.from(config.seal).length * sealFont * 1.08 + sealFont * .44)}px`;
      seal.setAttribute('aria-label', `${config.seal}，当代数字展陈印记`);
      band.appendChild(seal);
    }
    return element;
  }
}
