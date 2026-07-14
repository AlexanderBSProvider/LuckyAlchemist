import { DoubleSide, MeshBasicMaterial, SpriteMaterial, type Texture } from "three";

/**
 * Shared material settings for the flat, 2D-in-3D look both scenes use (THREEJS-MIGRATION.md
 * "variant A"): `depthTest: false` so draw order follows `renderOrder`/insertion order like
 * Pixi's painter's-algorithm scene graph did, not camera distance.
 *
 * `side: DoubleSide` is load-bearing, not cosmetic: the scenes are viewed through the y-down
 * orthographic camera in `three-app.ts` (`top: 0, bottom: innerHeight`), whose negative
 * y-scale flips triangle winding. With the default `FrontSide`, every mesh's front face reads
 * as back-facing and gets culled — the whole arena/cauldron renders zero visible pixels while
 * still counting triangles. DoubleSide sidesteps winding entirely, which is free for flat 2D
 * shapes. (Sprites are exempt — they're always camera-facing — so `flatSpriteMaterial` doesn't
 * need it.)
 */
export function flatColorMaterial(color: number, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    side: DoubleSide,
  });
}

export function flatSpriteMaterial(map: Texture): SpriteMaterial {
  return new SpriteMaterial({ map, transparent: true, depthTest: false });
}
