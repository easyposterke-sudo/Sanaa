import type { CameraPose } from './types';

export const DEFAULT_CAMERA_POSE: CameraPose = {
  position: { x: 0, y: 0, z: 20 },
  target: { x: 0, y: 0, z: 0 },
  fov: 45,
  zoom: 1,
};

export type CameraPoseInput = Omit<Partial<CameraPose>, 'position' | 'target'> & {
  position?: Partial<CameraPose['position']>;
  target?: Partial<CameraPose['target']>;
};

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stable(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Normalize imported/runtime camera values into a stable, serializable pose. */
export function normalizeCameraPose(value?: CameraPoseInput | null): CameraPose {
  const fallback = DEFAULT_CAMERA_POSE;
  return {
    position: {
      x: stable(finiteOr(value?.position?.x, fallback.position.x)),
      y: stable(finiteOr(value?.position?.y, fallback.position.y)),
      z: stable(finiteOr(value?.position?.z, fallback.position.z)),
    },
    target: {
      x: stable(finiteOr(value?.target?.x, fallback.target.x)),
      y: stable(finiteOr(value?.target?.y, fallback.target.y)),
      z: stable(finiteOr(value?.target?.z, fallback.target.z)),
    },
    fov: stable(Math.max(1, Math.min(179, finiteOr(value?.fov, fallback.fov)))),
    zoom: stable(Math.max(0.01, Math.min(100, finiteOr(value?.zoom, fallback.zoom)))),
  };
}

export function cameraPosesEqual(
  left: CameraPose | undefined,
  right: CameraPose | undefined
): boolean {
  return JSON.stringify(normalizeCameraPose(left)) === JSON.stringify(normalizeCameraPose(right));
}
