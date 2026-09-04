import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface LoadedModelInstance {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class ModelManager {
  private static catPromise: Promise<GLTF> | null = null;
  private static ratPromise: Promise<GLTF> | null = null;
  private static loader: GLTFLoader | null = null;

  private static getLoader(): GLTFLoader {
    if (!this.loader) {
      this.loader = new GLTFLoader();
    }
    return this.loader;
  }

  /**
   * Preload models at startup so no asynchronous loading pauses occur mid-gameplay
   */
  public static preloadAll(): Promise<void> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      return Promise.resolve();
    }
    return Promise.all([
      this.loadCatModel().catch(() => null),
      this.loadRatModel().catch(() => null)
    ]).then(() => {});
  }

  /**
   * Get an independent cloned instance of the 3D Cat Model with cloned bone hierarchy
   */
  public static loadCatModel(): Promise<LoadedModelInstance> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      return Promise.reject(new Error('Non-browser environment'));
    }

    if (!this.catPromise) {
      this.catPromise = new Promise<GLTF>((resolve, reject) => {
        this.getLoader().load(
          '/models/cat.glb',
          (gltf) => resolve(gltf),
          undefined,
          (err) => reject(err)
        );
      });
    }

    return this.catPromise.then((gltf) => {
      const clonedScene = SkeletonUtils.clone(gltf.scene) as THREE.Group;
      return {
        scene: clonedScene,
        animations: gltf.animations || []
      };
    });
  }

  /**
   * Get an independent cloned instance of the 3D Rat Model with cloned bone hierarchy
   */
  public static loadRatModel(): Promise<LoadedModelInstance> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      return Promise.reject(new Error('Non-browser environment'));
    }

    if (!this.ratPromise) {
      this.ratPromise = new Promise<GLTF>((resolve, reject) => {
        this.getLoader().load(
          '/models/rat.glb',
          (gltf) => resolve(gltf),
          undefined,
          (err) => reject(err)
        );
      });
    }

    return this.ratPromise.then((gltf) => {
      const clonedScene = SkeletonUtils.clone(gltf.scene) as THREE.Group;
      return {
        scene: clonedScene,
        animations: gltf.animations || []
      };
    });
  }
}
