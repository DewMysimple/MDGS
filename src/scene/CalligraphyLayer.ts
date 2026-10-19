import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { annotations, type ScrollCalligraphy } from '../data/annotations';
import type { ChapterId } from '../data/chapters';
import type { CameraSample, SceneManifest } from '../types';
import './CalligraphyLayer.css';

interface MountedCalligraphy { object: CSS3DObject; config: ScrollCalligraphy }

/**
 * Real HTML lettering on a fixed plane in the original artwork space.
 * A separate transparent CSS3D pass uses the exact WebGL camera; no camera or
 * Blender asset is changed. The overlay never captures painting interactions.
 */
export class CalligraphyLayer {
  private renderer = new CSS3DRenderer();
  private scene = new THREE.Scene();
  private mounted: MountedCalligraphy[] = [];

  constructor(host: HTMLElement) {
    this.renderer.domElement.className = 'calligraphy-layer';
    this.renderer.domElement.setAttribute('aria-label', '卷内竖排题字');
    Object.assign(this.renderer.domElement.style, { position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none', overflow: 'hidden' });
    host.appendChild(this.renderer.domElement);
  }

  load(chapterId: number, manifest: SceneManifest) {
    this.clear();
    const config = annotations[chapterId as ChapterId];
    if (!config?.display.enabled || !manifest.cameras.length) return;
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
    this.mounted.push({ object, config });
  }

  resize(width: number, height: number) { this.renderer.setSize(width, height); }

  render(camera: THREE.Camera, progress: number) {
    for (const { object, config } of this.mounted) {
      const [start, end] = config.display.range;
      const visible = progress >= start && progress <= end;
      object.visible = visible;
      // Keep opening labels immediately readable; fade only as their scene leaves.
      const opacity = visible ? Math.min(1, (end - progress) / Math.max(0.0001, config.display.fade)) : 0;
      object.element.style.opacity = String(Math.max(0, opacity));
      object.element.setAttribute('aria-hidden', String(!visible || opacity < 0.05));
    }
    this.renderer.render(this.scene, camera);
  }

  dispose() { this.clear(); this.renderer.domElement.remove(); }

  private clear() {
    for (const { object } of this.mounted) { this.scene.remove(object); object.element.remove(); }
    this.mounted = [];
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
}
