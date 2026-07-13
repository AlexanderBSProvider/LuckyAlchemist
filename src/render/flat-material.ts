import { MeshBasicMaterial, SpriteMaterial, type Texture } from "three";

/**
 * Shared material settings for the flat, 2D-in-3D look both scenes use (THREEJS-MIGRATION.md
 * "variant A"): `depthTest: false` so draw order follows `renderOrder`/insertion order like
 * Pixi's painter's-algorithm scene graph did, not camera distance.
 */
export function flatColorMaterial(color: number, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false });
}

export function flatSpriteMaterial(map: Texture): SpriteMaterial {
  return new SpriteMaterial({ map, transparent: true, depthTest: false });
}
