import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Canvas, FabricImage } from 'fabric';
import { usePosterStore } from '../store/posterStore';
import type { PosterImageElement } from '../types';
import {
  bakeLocalizedBlurStroke,
  brushRadiiInImagePixels,
  pointTouchesImage,
  scenePointToImagePixel,
  type BlurBrushPoint,
  type FabricTransform,
} from '../localizedBlurBrush';

type PosterBlurBrushOverlayProps = {
  canvasRef: RefObject<Canvas | null>;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  readOnly: boolean;
};

type ActiveStroke = {
  targetId: string;
  source: string;
  points: BlurBrushPoint[];
  scenePoints: BlurBrushPoint[];
  radiusX: number;
  radiusY: number;
  pointerId: number;
};

function strokePath(points: BlurBrushPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

export function PosterBlurBrushOverlay({
  canvasRef,
  canvasWidth,
  canvasHeight,
  scale,
  readOnly,
}: PosterBlurBrushOverlayProps) {
  const activeTool = usePosterStore((state) => state.activeTool);
  const selectedIds = usePosterStore((state) => state.selectedIds);
  const elements = usePosterStore((state) => state.elements);
  const brushSize = usePosterStore((state) => state.blurBrushSize);
  const brushStrength = usePosterStore((state) => state.blurBrushStrength);
  const [cursor, setCursor] = useState<BlurBrushPoint | null>(null);
  const [previewPoints, setPreviewPoints] = useState<BlurBrushPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeStrokeRef = useRef<ActiveStroke | null>(null);

  const selectedElement =
    selectedIds.length === 1
      ? elements.find((element) => element.id === selectedIds[0])
      : null;
  const target =
    selectedElement?.type === 'image'
      ? (selectedElement as PosterImageElement)
      : null;
  const enabled = activeTool === 'blur-brush' && !readOnly;

  const scenePointFromEvent = (
    event: ReactPointerEvent<HTMLDivElement>
  ): BlurBrushPoint | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvasWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * canvasHeight,
    };
  };

  const resolveFabricImage = (targetId: string): FabricImage | null => {
    const object = canvasRef.current
      ?.getObjects()
      .find(
        (candidate) =>
          (candidate as { data?: { posterId?: string } }).data?.posterId === targetId
      );
    return object instanceof FabricImage ? object : null;
  };

  const startStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || !target || busy || event.button !== 0) return;
    const scenePoint = scenePointFromEvent(event);
    const image = resolveFabricImage(target.id);
    if (!scenePoint || !image) return;
    const width = image.width ?? 0;
    const height = image.height ?? 0;
    const matrix = image.calcTransformMatrix() as FabricTransform;
    const imagePoint = scenePointToImagePixel(
      scenePoint,
      matrix,
      width,
      height
    );
    if (!imagePoint) return;
    const radii = brushRadiiInImagePixels(matrix, brushSize);
    if (
      !pointTouchesImage(
        imagePoint,
        width,
        height,
        radii.radiusX,
        radii.radiusY
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setError(null);
    activeStrokeRef.current = {
      targetId: target.id,
      source: target.src,
      points: [imagePoint],
      scenePoints: [scenePoint],
      radiusX: radii.radiusX,
      radiusY: radii.radiusY,
      pointerId: event.pointerId,
    };
    setPreviewPoints([scenePoint]);
    setCursor(scenePoint);
  };

  const continueStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scenePoint = scenePointFromEvent(event);
    if (scenePoint) setCursor(scenePoint);
    const stroke = activeStrokeRef.current;
    if (!stroke || !scenePoint || stroke.pointerId !== event.pointerId) return;
    const image = resolveFabricImage(stroke.targetId);
    if (!image) return;
    const imagePoint = scenePointToImagePixel(
      scenePoint,
      image.calcTransformMatrix() as FabricTransform,
      image.width ?? 0,
      image.height ?? 0
    );
    if (!imagePoint) return;

    const previousScene = stroke.scenePoints[stroke.scenePoints.length - 1];
    if (Math.hypot(scenePoint.x - previousScene.x, scenePoint.y - previousScene.y) < 1.5) {
      return;
    }
    stroke.points.push(imagePoint);
    stroke.scenePoints.push(scenePoint);
    setPreviewPoints([...stroke.scenePoints]);
  };

  const applyStroke = async (stroke: ActiveStroke) => {
    setBusy(true);
    try {
      const dataUrl = await bakeLocalizedBlurStroke(stroke.source, {
        points: stroke.points,
        radiusX: stroke.radiusX,
        radiusY: stroke.radiusY,
        strength: brushStrength,
      });
      const store = usePosterStore.getState();
      const current = store.elements.find(
        (element) => element.id === stroke.targetId
      );
      if (current?.type !== 'image' || current.src !== stroke.source) return;
      store.updateElement(stroke.targetId, { src: dataUrl });
      store.pushHistory();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The localized blur could not be applied.'
      );
    } finally {
      setBusy(false);
    }
  };

  const finishStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    activeStrokeRef.current = null;
    setPreviewPoints([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    void applyStroke(stroke);
  };

  const cancelStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    activeStrokeRef.current = null;
    setPreviewPoints([]);
  };

  if (!enabled) return null;

  const status = !target
    ? 'Select one image to use the blur brush.'
    : busy
      ? 'Applying localized blur…'
      : error;

  return (
    <div
      className="absolute inset-0 z-[55]"
      style={{
        width: canvasWidth,
        height: canvasHeight,
        cursor: target && !busy ? 'none' : 'default',
        pointerEvents: target && !busy ? 'auto' : 'none',
        touchAction: 'none',
      }}
      onPointerDown={startStroke}
      onPointerMove={continueStroke}
      onPointerUp={finishStroke}
      onPointerCancel={cancelStroke}
      onPointerLeave={() => {
        if (!activeStrokeRef.current) setCursor(null);
      }}
    >
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={canvasWidth}
        height={canvasHeight}
      >
        {previewPoints.length > 0 && (
          <>
            <path
              d={strokePath(previewPoints)}
              fill="none"
              stroke="rgba(14, 165, 233, 0.28)"
              strokeWidth={brushSize}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {previewPoints.length === 1 && (
              <circle
                cx={previewPoints[0].x}
                cy={previewPoints[0].y}
                r={brushSize / 2}
                fill="rgba(14, 165, 233, 0.28)"
              />
            )}
          </>
        )}
        {cursor && target && !busy && (
          <circle
            cx={cursor.x}
            cy={cursor.y}
            r={brushSize / 2}
            fill="rgba(255,255,255,0.08)"
            stroke="#0ea5e9"
            strokeWidth={Math.max(1, 1.5 / Math.max(scale, 0.01))}
            strokeDasharray={`${5 / Math.max(scale, 0.01)} ${3 / Math.max(scale, 0.01)}`}
          />
        )}
      </svg>
      {status && (
        <div
          className={`pointer-events-none absolute left-1/2 top-3 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-lg ${
            error ? 'bg-red-600' : 'bg-zinc-900/85'
          }`}
          style={{
            transform: `translateX(-50%) scale(${1 / Math.max(scale, 0.01)})`,
            transformOrigin: 'top center',
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
