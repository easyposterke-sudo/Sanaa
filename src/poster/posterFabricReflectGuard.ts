/**
 * Suppress Fabric → Zustand reflection while we programmatically update objects
 * (store→Fabric sync, setSrc, filters). Without this, `object:modified` can run
 * after the React sync effect finished and corrupt scale/position from transient state.
 */
let fabricReflectSuppressDepth = 0;

export function enterFabricReflectSuppress(): void {
  fabricReflectSuppressDepth += 1;
}

export function exitFabricReflectSuppress(): void {
  fabricReflectSuppressDepth = Math.max(0, fabricReflectSuppressDepth - 1);
}

export function isFabricReflectSuppressed(): boolean {
  return fabricReflectSuppressDepth > 0;
}
