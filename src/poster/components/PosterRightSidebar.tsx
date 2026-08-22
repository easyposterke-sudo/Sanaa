import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ColorPickerPopover } from '../../components/ColorPickerPopover';
import { usePosterStore } from '../store/posterStore';
import { useIntentionalSliderDrag } from '../../hooks/useIntentionalSliderDrag';
import type {
  PosterElement,
  PosterTextElement,
  Poster3DTextElement,
  PosterShapeElement,
  PosterShapeFill,
  PosterImageElement,
  PosterImageMask,
  PosterImageEdge,
  PosterImageFadeDirection,
  PosterTextAlign,
  PosterShadow,
  ImageAdjustments,
  CanvasBackground,
  GradientStop,
  PosterPathElement,
  PosterPathPoint,
} from '../types';
import { isSolidBackground, DEFAULT_GRADIENT_STOPS } from '../types';
import { normalizePosterShapeFill } from '../shapeFillFabric';
import { getPosterShapeLocalSize, shapeFillFallbackForType } from '../posterShapeGeometry';
import { rectHasPerCornerRadii } from '../roundedRectPath';
import { pathPointsToSvgPathElement } from '../path/penToolMath';
import { usePosterFontOptions } from '../usePosterFontOptions';
import { ensureFontPreviewFromUrl } from '../../core/font/customFontCache';
import {
  inspectFontFile,
  notifyFontLibraryChanged,
  uploadFontFile,
  type FontLibraryEntry,
} from '../services/fontLibraryApi';
import { MaskEditorModal } from './MaskEditorModal';
import { BUILT_IN_TEXTURES } from '../posterTextures';
import { removeImageBackgroundLocally } from '../services/localBackgroundRemoval';

interface PosterRightSidebarProps {
  readOnly?: boolean;
  onOpenEdit3D?: (id: string) => void;
}

function PosterSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  className = 'w-full',
}: {
  label?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  className?: string;
}) {
  const { sliderRef, handleInputChange } = useIntentionalSliderDrag(onChange);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          {label}
        </label>
      )}
      <input
        ref={sliderRef}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleInputChange}
        className={`${className} touch-pan-y`}
      />
    </div>
  );
}

function GradientStopsEditor({
  stops,
  onChange,
}: {
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-zinc-500">Color stops</label>
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-2">
          <ColorPickerPopover
            color={/^#[0-9A-Fa-f]{6}$/.test(stop.color) ? stop.color : '#ffffff'}
            onChange={(c) => {
              const next = [...stops];
              next[i] = { ...next[i], color: c };
              onChange(next);
            }}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(stop.offset * 100)}
            onChange={(e) => {
              const next = [...stops];
              next[i] = { ...next[i], offset: (parseFloat(e.target.value) || 0) / 100 };
              onChange(next);
            }}
            className="w-14 rounded border border-zinc-200 px-1 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
          <span className="text-xs text-zinc-500">%</span>
        </div>
      ))}
    </div>
  );
}

function LineCurveControls({
  shape,
  updateElement,
}: {
  shape: PosterShapeElement;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Curve
      </label>
      {shape.curveControl ? (
        <>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Adjust X/Y to bend the line. Drag on canvas to move the whole shape.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500">X</label>
              <input
                type="number"
                value={Math.round(shape.curveControl.x)}
                onChange={(e) =>
                  updateElement(shape.id, {
                    curveControl: {
                      ...shape.curveControl!,
                      x: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500">Y</label>
              <input
                type="number"
                value={Math.round(shape.curveControl.y)}
                onChange={(e) =>
                  updateElement(shape.id, {
                    curveControl: {
                      ...shape.curveControl!,
                      y: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateElement(shape.id, { curveControl: undefined })}
            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            Remove curve
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            const x1 = shape.x1 ?? 0;
            const y1 = shape.y1 ?? 0;
            const x2 = shape.x2 ?? 120;
            const y2 = shape.y2 ?? 80;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const offset = 25;
            const cx = mx + (-dy / len) * offset;
            const cy = my + (dx / len) * offset;
            updateElement(shape.id, { curveControl: { x: cx, y: cy } });
          }}
          className="rounded border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Add curve
        </button>
      )}
    </div>
  );
}

function PathEditingControls({
  element,
  pathEditActive,
  setPathEditActive,
  updateElement,
}: {
  element: PosterShapeElement | PosterPathElement;
  pathEditActive: boolean;
  setPathEditActive: (active: boolean) => void;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const [selectedNode, setSelectedNode] = useState(0);
  const [selectedIsland, setSelectedIsland] = useState<number | undefined>(undefined);
  const storeSelectedPathNode = usePosterStore((s) => s.selectedPathNode);
  const setSelectedPathNode = usePosterStore((s) => s.setSelectedPathNode);
  const pathToolMode = usePosterStore((s) => s.pathToolMode);
  const setPathToolMode = usePosterStore((s) => s.setPathToolMode);
  const pathPointSize = usePosterStore((s) => s.pathPointSize);
  const setPathPointSize = usePosterStore((s) => s.setPathPointSize);
  const setActiveTool = usePosterStore((s) => s.setActiveTool);
  const setActivePathId = usePosterStore((s) => s.setActivePathId);
  const setActiveIslandIndex = usePosterStore((s) => s.setActiveIslandIndex);
  const isPath = element.type === 'path';
  const points: PosterPathPoint[] = isPath
    ? (element as PosterPathElement).pathPoints
    : element.type === 'polygon'
      ? (element.polygonPoints ?? []).map((p) => ({ x: p.x, y: p.y }))
      : element.type === 'line'
        ? [
            { x: element.x1 ?? 0, y: element.y1 ?? 0 },
            {
              x: element.x2 ?? 120,
              y: element.y2 ?? 80,
            },
          ]
        : [];

  const canEdit = element.type === 'polygon' || element.type === 'line' || element.type === 'path';

  // Sync store selection to local state when canvas node is clicked
  useEffect(() => {
    if (
      storeSelectedPathNode &&
      storeSelectedPathNode.elementId === element.id &&
      storeSelectedPathNode.nodeIndex >= 0
    ) {
      setSelectedNode(storeSelectedPathNode.nodeIndex);
      setSelectedIsland(storeSelectedPathNode.islandIndex);
    }
  }, [storeSelectedPathNode, element.id]);

  if (!canEdit) return null;

  const islands = (element as PosterPathElement).islands ?? [];
  const currentPoints = selectedIsland === undefined ? points : (islands[selectedIsland] ?? []);
  const currentNode = currentPoints[selectedNode];

  const updateCurrentNode = (updates: Partial<PosterPathPoint>) => {
    if (selectedIsland === undefined) {
      const next = [...points];
      next[selectedNode] = { ...next[selectedNode], ...updates };
      if (element.type === 'path') {
        updateElement(element.id, { pathPoints: next });
      } else if (element.type === 'polygon') {
        updateElement(element.id, { polygonPoints: next.map((p) => ({ x: p.x, y: p.y })) });
      } else if (element.type === 'line') {
        const start = next[0] ?? { x: element.x1 ?? 0, y: element.y1 ?? 0 };
        const end = next[1] ?? { x: element.x2 ?? 120, y: element.y2 ?? 80 };
        updateElement(element.id, { x1: start.x, y1: start.y, x2: end.x, y2: end.y });
      }
    } else {
      const nextIslands = [...islands];
      const nextPts = [...nextIslands[selectedIsland]];
      nextPts[selectedNode] = { ...nextPts[selectedNode], ...updates };
      nextIslands[selectedIsland] = nextPts;
      updateElement(element.id, { islands: nextIslands });
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
        <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Path tools</p>
        <div className="grid grid-cols-2 gap-1">
          {([
            ['pen-straight', 'Pen Straight'],
            ['pen-curve', 'Pen Curve'],
            ['direct', 'Direct'],
            ['convert', 'Convert'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPathToolMode(mode)}
              className={`rounded px-2 py-1 text-xs ${
                pathToolMode === mode
                  ? 'bg-amber-500 text-white'
                  : 'border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Path edit</p>
        <button
          type="button"
          onClick={() => setPathEditActive(!pathEditActive)}
          className={`${toggleBtn} ${pathEditActive ? toggleBtnOn : toggleBtnOff}`}
        >
          {pathEditActive ? 'On' : 'Off'}
        </button>
      </div>
      {pathEditActive && (
        <>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Drag anchors/handles on canvas. Direct (A): click a segment to add a point. Press Esc to exit.
          </p>
          <div className="flex flex-col gap-1 border-y border-zinc-100 py-2 dark:border-zinc-800">
            <PosterSlider
              label={`Anchor size (${pathPointSize}px)`}
              min={4}
              max={40}
              step={1}
              value={pathPointSize}
              onChange={(v) => setPathPointSize(v)}
            />
          </div>
          {(points.length > 0 || islands.some(isl => isl.length > 0)) && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-600 dark:text-zinc-400">Node</label>
                <select
                  value={selectedIsland === undefined ? `m-${selectedNode}` : `i-${selectedIsland}-${selectedNode}`}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith('m-')) {
                      const idx = parseInt(val.replace('m-', ''), 10);
                      setSelectedNode(idx);
                      setSelectedIsland(undefined);
                      setSelectedPathNode({ elementId: element.id, nodeIndex: idx, islandIndex: undefined });
                    } else {
                      const parts = val.replace('i-', '').split('-');
                      const iIdx = parseInt(parts[0], 10);
                      const nIdx = parseInt(parts[1], 10);
                      setSelectedNode(nIdx);
                      setSelectedIsland(iIdx);
                      setSelectedPathNode({ elementId: element.id, nodeIndex: nIdx, islandIndex: iIdx });
                    }
                  }}
                  className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <optgroup label="Main Path">
                    {points.map((_, idx) => (
                      <option key={`m-${idx}`} value={`m-${idx}`}>
                        {`Node ${idx + 1}`}
                      </option>
                    ))}
                  </optgroup>
                  {islands.map((isl, iIdx) => (
                    <optgroup key={`isl-${iIdx}`} label={`Hole ${iIdx + 1}`}>
                      {isl.map((_, idx) => (
                        <option key={`i-${iIdx}-${idx}`} value={`i-${iIdx}-${idx}`}>
                          {`Node ${idx + 1}`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {currentNode && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500">X</label>
                    <input
                      type="number"
                      value={Math.round(currentNode.x)}
                      onChange={(e) => {
                        updateCurrentNode({ x: parseFloat(e.target.value) || 0 });
                      }}
                      className="w-full rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Y</label>
                    <input
                      type="number"
                      value={Math.round(currentNode.y)}
                      onChange={(e) => {
                        updateCurrentNode({ y: parseFloat(e.target.value) || 0 });
                      }}
                      className="w-full rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                </div>
              )}
            </>
          )}
          {element.type === 'path' && (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const p = currentNode ?? { x: 50, y: 50 };
                    const newNode = { x: p.x + 20, y: p.y + 20 };
                    if (selectedIsland === undefined) {
                      const next = [...points];
                      next.splice(selectedNode + 1, 0, newNode);
                      updateElement(element.id, { pathPoints: next });
                    } else {
                      const nextIslands = [...islands];
                      const nextPts = [...nextIslands[selectedIsland]];
                      nextPts.splice(selectedNode + 1, 0, newNode);
                      nextIslands[selectedIsland] = nextPts;
                      updateElement(element.id, { islands: nextIslands });
                    }
                    setSelectedNode(selectedNode + 1);
                  }}
                  className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  Insert node
                </button>
                <button
                  type="button"
                  disabled={currentPoints.length <= 2}
                  onClick={() => {
                    if (currentPoints.length <= 2) return;
                    const nextPts = currentPoints.filter((_, idx) => idx !== selectedNode);
                    if (selectedIsland === undefined) {
                      updateElement(element.id, { pathPoints: nextPts });
                    } else {
                      const nextIslands = [...islands];
                      nextIslands[selectedIsland] = nextPts;
                      updateElement(element.id, { islands: nextIslands });
                    }
                    setSelectedNode((prev) => Math.max(0, Math.min(prev, nextPts.length - 1)));
                  }}
                  className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  Delete node
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateElement(element.id, { closed: !(element as PosterPathElement).closed })
                  }
                  className={`${toggleBtn} ${((element as PosterPathElement).closed ?? false) ? toggleBtnOn : toggleBtnOff}`}
                >
                  {(element as PosterPathElement).closed ? 'Closed' : 'Open'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = currentNode;
                    if (!p) return;
                    const hasHandle = p.inX != null || p.outX != null;
                    const updates = hasHandle
                      ? { x: p.x, y: p.y, inX: undefined, inY: undefined, outX: undefined, outY: undefined }
                      : {
                          inX: p.x - 20,
                          inY: p.y,
                          outX: p.x + 20,
                          outY: p.y,
                        };
                    updateCurrentNode(updates);
                  }}
                  className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  Toggle handles
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = element as PosterPathElement;
                    const nextIslands = [...(p.islands ?? [])];
                    const newIdx = nextIslands.length;
                    nextIslands.push([]); // Start empty island
                    updateElement(p.id, {
                      islands: nextIslands,
                      fillRule: 'evenodd',
                    });
                    // Set path first, then island index to avoid race/reset
                    setActivePathId(p.id);
                    setActiveIslandIndex(newIdx);
                    setActiveTool('pen');
                    setPathToolMode('pen-straight');
                    setSelectedPathNode(null);
                  }}
                  className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  Add hole
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function PathStyleControls({
  path,
  updateElement,
}: {
  path: PosterPathElement;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const fillNorm = normalizePosterShapeFill(path.fill, '#14b8a6');
  const fillColor = fillNorm.type === 'solid' ? fillNorm.color : '#14b8a6';
  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Path style</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Fill</span>
        <ColorPickerPopover
          color={/^#[0-9A-Fa-f]{6}$/i.test(fillColor) ? fillColor : '#14b8a6'}
          onChange={(c) => updateElement(path.id, { fill: { type: 'solid', color: c } })}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Stroke</span>
        <ColorPickerPopover
          color={/^#[0-9A-Fa-f]{6}$/i.test(path.stroke ?? '') ? (path.stroke as string) : '#0f172a'}
          onChange={(c) => updateElement(path.id, { stroke: c, strokeWidth: path.strokeWidth ?? 2 })}
        />
      </div>
      <PosterSlider
        label={`Stroke width (${path.strokeWidth ?? 0}px)`}
        min={0}
        max={24}
        step={1}
        value={path.strokeWidth ?? 0}
        onChange={(v) => {
          updateElement(path.id, {
            strokeWidth: v,
            stroke: v > 0 ? (path.stroke || '#0f172a') : undefined,
          });
        }}
      />
      <PosterSlider
        label={`Fill opacity (${Math.round((path.fillOpacity ?? 1) * 100)}%)`}
        min={0}
        max={100}
        step={5}
        value={Math.round((path.fillOpacity ?? 1) * 100)}
        onChange={(v) =>
          updateElement(path.id, {
            fillOpacity: Math.max(0, Math.min(1, v / 100)),
          })
        }
      />
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => {
            const stroke =
              path.stroke && (path.strokeWidth ?? 0) > 0 ? (path.stroke as string) : 'none';
            const svg = pathPointsToSvgPathElement(path.pathPoints, path.closed ?? false, {
              fill: fillColor,
              stroke,
              strokeWidth: path.strokeWidth ?? 0,
              islands: path.islands,
              fillRule: path.fillRule,
              fillOpacity: path.fillOpacity,
            });
            void navigator.clipboard?.writeText(svg);
          }}
          className="w-fit rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
        >
          Copy SVG snippet
        </button>
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          For the 3D app: paste into an SVG-friendly tool or use as a decal bitmap source.
        </p>
      </div>
    </div>
  );
}

function ShapeFillAndRoundnessControls({
  shape,
  updateElement,
}: {
  shape: PosterShapeElement;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const fillNorm = normalizePosterShapeFill(shape.fill, shapeFillFallbackForType(shape.type));

  const setFill = (fill: PosterShapeFill) => updateElement(shape.id, { fill });

  const updateStops = (next: GradientStop[]) => {
    if (fillNorm.type === 'linear') {
      setFill({ type: 'linear', angle: fillNorm.angle, stops: next });
    } else if (fillNorm.type === 'radial') {
      setFill({
        type: 'radial',
        cx: fillNorm.cx,
        cy: fillNorm.cy,
        r: fillNorm.r,
        stops: next,
      });
    }
  };

  const stops =
    fillNorm.type === 'linear' || fillNorm.type === 'radial'
      ? (fillNorm.stops.length ? fillNorm.stops : DEFAULT_GRADIENT_STOPS)
      : [];

  const { w, h } = getPosterShapeLocalSize(shape);
  const maxRound = shape.type === 'rect' ? Math.max(0, Math.floor(Math.min(w, h) / 2)) : 0;
  const rx = Math.min(shape.rx ?? 0, maxRound);

  return (
    <div className="flex flex-col gap-3">
      {shape.type === 'rect' && rectHasPerCornerRadii(shape) && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          This rectangle uses a fixed mixed corner style (top rounded, bottom square). Change fill and
          shadow below; resize and rotate on the canvas.
        </p>
      )}

      {shape.type === 'rect' && !rectHasPerCornerRadii(shape) && (
        <PosterSlider
          label={`Corner roundness (${rx}px)`}
          min={0}
          max={maxRound}
          step={1}
          value={rx}
          onChange={(v) => updateElement(shape.id, { rx: v })}
        />
      )}

      {shape.type === 'line' && (
        <PosterSlider
          label={`Stroke width (${shape.strokeWidth ?? 4}px)`}
          min={1}
          max={48}
          step={1}
          value={shape.strokeWidth ?? 4}
          onChange={(v) => updateElement(shape.id, { strokeWidth: v })}
        />
      )}

      {(shape.type === 'rect' ||
        shape.type === 'circle' ||
        shape.type === 'triangle' ||
        shape.type === 'ellipse' ||
        shape.type === 'polygon') && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Outline
          </label>
          <div className="flex items-center gap-2">
            <ColorPickerPopover
              color={
                shape.stroke && (shape.strokeWidth ?? 0) > 0 && /^#[0-9A-Fa-f]{6}$/i.test(shape.stroke)
                  ? shape.stroke
                  : '#000000'
              }
              onChange={(c) =>
                updateElement(shape.id, {
                  stroke: c,
                  strokeWidth: shape.strokeWidth && shape.stroke ? shape.strokeWidth : 2,
                })
              }
            />
            <div className="flex-1">
              <PosterSlider
                label={`Width (${(shape.strokeWidth ?? 0) || 0}px)`}
                min={0}
                max={24}
                step={1}
                value={(shape.strokeWidth ?? 0) || 0}
                onChange={(v) => {
                  updateElement(shape.id, {
                    strokeWidth: v,
                    stroke: v > 0 ? (shape.stroke && /^#[0-9A-Fa-f]{6}$/i.test(shape.stroke) ? shape.stroke : '#000000') : undefined,
                  });
                }}
              />
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Set width to 0 to hide outline.
          </p>
        </div>
      )}

      {(shape.type === 'rect' ||
        shape.type === 'circle' ||
        shape.type === 'triangle' ||
        shape.type === 'ellipse' ||
        shape.type === 'polygon') && (
        <PosterSlider
          label={`Fill opacity (${Math.round((shape.fillOpacity ?? 1) * 100)}%)`}
          min={0}
          max={100}
          step={5}
          value={Math.round((shape.fillOpacity ?? 1) * 100)}
          onChange={(v) =>
            updateElement(shape.id, {
              fillOpacity: Math.max(0, Math.min(1, v / 100)),
            })
          }
        />
      )}

      <div className="flex flex-col gap-2">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          {shape.type === 'line' ? 'Color' : 'Fill'}
        </label>
        <select
          value={fillNorm.type}
          onChange={(e) => {
            const t = e.target.value;
            if (t === 'solid') {
              const c =
                fillNorm.type === 'solid'
                  ? fillNorm.color
                  : fillNorm.type === 'linear' || fillNorm.type === 'radial'
                    ? (fillNorm.stops[0]?.color ?? '#3b82f6')
                    : '#3b82f6';
              setFill({ type: 'solid', color: c });
            } else if (t === 'linear') {
              setFill({ type: 'linear', angle: 90, stops: [...DEFAULT_GRADIENT_STOPS] });
            } else if (t === 'radial') {
              setFill({
                type: 'radial',
                cx: 0.5,
                cy: 0.5,
                r: 0.5,
                stops: [...DEFAULT_GRADIENT_STOPS],
              });
            } else if (t === 'pattern') {
              setFill({ type: 'pattern', textureId: 'dots', repeat: 'repeat', scale: 1 });
            }
          }}
          className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="solid">Solid</option>
          <option value="linear">Linear gradient</option>
          <option value="radial">Radial gradient</option>
          <option value="pattern">Texture</option>
        </select>

        {fillNorm.type === 'pattern' && (
          <>
            <label className="text-xs text-zinc-500">Texture</label>
            <div className="grid grid-cols-4 gap-1.5">
              {BUILT_IN_TEXTURES.map((tex) => (
                <button
                  key={tex.id}
                  type="button"
                  title={tex.name}
                  onClick={() => setFill({ ...fillNorm, textureId: tex.id })}
                  className={`aspect-square rounded border-2 p-0.5 transition-colors ${
                    fillNorm.textureId === tex.id
                      ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-600'
                  }`}
                  style={{
                    backgroundImage: `url(${tex.url})`,
                    backgroundSize: 'cover',
                  }}
                />
              ))}
            </div>
            <PosterSlider
              label={`Scale (${((fillNorm.scale ?? 1) * 100).toFixed(0)}%)`}
              min={25}
              max={200}
              step={5}
              value={((fillNorm.scale ?? 1) * 100)}
              onChange={(v) =>
                setFill({ ...fillNorm, scale: v / 100 })
              }
            />
          </>
        )}

        {fillNorm.type === 'solid' && (
          <ColorPickerPopover
            color={/^#[0-9A-Fa-f]{6}$/.test(fillNorm.color) ? fillNorm.color : '#3b82f6'}
            onChange={(c) => setFill({ type: 'solid', color: c })}
          />
        )}

        {fillNorm.type === 'linear' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Angle (°)</label>
              <input
                type="number"
                value={Math.round(fillNorm.angle)}
                onChange={(e) =>
                  setFill({
                    type: 'linear',
                    angle: parseFloat(e.target.value) || 0,
                    stops: fillNorm.stops,
                  })
                }
                className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <GradientStopsEditor stops={stops} onChange={updateStops} />
          </>
        )}

        {fillNorm.type === 'radial' && (
          <>
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Center X %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(fillNorm.cx * 100)}
                  onChange={(e) =>
                    setFill({
                      type: 'radial',
                      cx: (parseFloat(e.target.value) || 50) / 100,
                      cy: fillNorm.cy,
                      r: fillNorm.r,
                      stops: fillNorm.stops,
                    })
                  }
                  className="w-16 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Center Y %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(fillNorm.cy * 100)}
                  onChange={(e) =>
                    setFill({
                      type: 'radial',
                      cx: fillNorm.cx,
                      cy: (parseFloat(e.target.value) || 50) / 100,
                      r: fillNorm.r,
                      stops: fillNorm.stops,
                    })
                  }
                  className="w-16 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Radius</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(fillNorm.r * 100)}
                  onChange={(e) =>
                    setFill({
                      type: 'radial',
                      cx: fillNorm.cx,
                      cy: fillNorm.cy,
                      r: (parseFloat(e.target.value) || 50) / 100,
                      stops: fillNorm.stops,
                    })
                  }
                  className="w-16 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>
            <GradientStopsEditor stops={stops} onChange={updateStops} />
          </>
        )}
      </div>
    </div>
  );
}

function ImageAdjustmentControls({
  elementId,
  adj,
  updateElement,
}: {
  elementId: string;
  adj: ImageAdjustments;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const brightness = adj.adjustBrightness ?? 0;
  const contrast = adj.adjustContrast ?? 0;
  const saturation = adj.adjustSaturation ?? 0;
  const sharpness = adj.adjustSharpness ?? 0;
  const blur = adj.adjustBlur ?? 0;
  const hue = adj.adjustHue ?? 0;
  const tintAmount = adj.adjustTintAmount ?? 0;
  const tintColor = adj.adjustTintColor ?? '#ffffff';
  const isDefault =
    brightness === 0 &&
    contrast === 0 &&
    saturation === 0 &&
    sharpness === 0 &&
    blur === 0 &&
    hue === 0 &&
    tintAmount === 0;

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Color &amp; lighting</p>
        {!isDefault && (
          <button
            type="button"
            onClick={() =>
              updateElement(elementId, {
                adjustBrightness: 0,
                adjustContrast: 0,
                adjustSaturation: 0,
                adjustSharpness: 0,
                adjustBlur: 0,
                adjustHue: 0,
                adjustTintAmount: 0,
                adjustTintColor: undefined,
              })
            }
            className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Reset
          </button>
        )}
      </div>
      <PosterSlider
        label={`Brightness (${brightness})`}
        min={-100}
        max={100}
        step={1}
        value={brightness}
        onChange={(v) => updateElement(elementId, { adjustBrightness: v })}
      />
      <PosterSlider
        label={`Contrast (${contrast})`}
        min={-100}
        max={100}
        step={1}
        value={contrast}
        onChange={(v) => updateElement(elementId, { adjustContrast: v })}
      />
      <PosterSlider
        label={`Hue (${hue}°)`}
        min={-180}
        max={180}
        step={1}
        value={hue}
        onChange={(v) => updateElement(elementId, { adjustHue: v })}
      />
      <PosterSlider
        label={`Saturation (${saturation})`}
        min={-100}
        max={100}
        step={1}
        value={saturation}
        onChange={(v) => updateElement(elementId, { adjustSaturation: v })}
      />
      <PosterSlider
        label={`Sharpness (${sharpness})`}
        min={0}
        max={100}
        step={1}
        value={sharpness}
        onChange={(v) => updateElement(elementId, { adjustSharpness: v })}
      />
      <PosterSlider
        label={`Blur (${blur})`}
        min={0}
        max={100}
        step={1}
        value={blur}
        onChange={(v) => updateElement(elementId, { adjustBlur: v })}
      />
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Tint</span>
        <div className="flex flex-wrap items-center gap-2">
          <ColorPickerPopover
            color={tintColor}
            onChange={(hex) => updateElement(elementId, { adjustTintColor: hex })}
            aria-label="Tint color"
          />
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Color</span>
        </div>
        <PosterSlider
          label={`Tint amount (${tintAmount})`}
          min={0}
          max={100}
          step={1}
          value={tintAmount}
          onChange={(v) => updateElement(elementId, { adjustTintAmount: v })}
        />
      </div>
    </div>
  );
}

function PosterImageAppearanceControls({
  raster,
  updateElement,
  pushHistory,
  readOnly,
}: {
  raster: PosterImageElement | Poster3DTextElement;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
  pushHistory: () => void;
  readOnly?: boolean;
}) {
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [removingBackground, setRemovingBackground] = useState(false);
  const [backgroundRemovalMessage, setBackgroundRemovalMessage] = useState<string | null>(null);
  const imageCropTargetId = usePosterStore((s) => s.imageCropTargetId);
  const setImageCropTargetId = usePosterStore((s) => s.setImageCropTargetId);

  const mask: PosterImageMask = raster.mask ?? 'none';
  const edge: PosterImageEdge = raster.edge ?? 'none';
  const shapeMask = mask !== 'none';
  const tearDisabled = shapeMask;
  const fadeAmount = raster.edgeFadeAmount ?? 0.4;
  const fadeMinOpacity = raster.edgeFadeMinOpacity ?? 0;
  const fadeDirection: PosterImageFadeDirection = raster.edgeFadeDirection ?? 'radial';
  const edgeUsesTear = edge === 'paper-tear' || edge === 'fade-paper-tear';
  const edgeUsesFade = edge === 'fade' || edge === 'fade-paper-tear';

  const edgeSelectValue =
    tearDisabled && edgeUsesTear
      ? edge === 'fade-paper-tear'
        ? 'fade'
        : 'none'
      : edge;

  useEffect(() => {
    setRemovingBackground(false);
    setBackgroundRemovalMessage(null);
  }, [raster.id]);

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Image appearance</p>

      {(raster.type === 'image' || raster.type === '3d-text') && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-800/50">
          <button
            type="button"
            onClick={() => setImageCropTargetId(raster.id)}
            disabled={readOnly || !!raster.locked || imageCropTargetId != null}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {imageCropTargetId === raster.id
              ? 'Cropping on canvas…'
              : imageCropTargetId != null
                ? 'Finish other crop first'
                : 'Crop on canvas'}
          </button>
        </div>
      )}

      {raster.type === 'image' && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-800/50">
          <button
            type="button"
            onClick={async () => {
              setRemovingBackground(true);
              setBackgroundRemovalMessage('Preparing background remover…');
              try {
                const result = await removeImageBackgroundLocally(
                  raster.src,
                  setBackgroundRemovalMessage,
                );
                usePosterStore.getState().pushHistory();
                updateElement(raster.id, {
                  src: result.dataUrl,
                  originalSrc: undefined,
                });
                const seconds = (result.elapsedMs / 1000).toFixed(1);
                setBackgroundRemovalMessage(
                  `Background removed in ${seconds}s${result.firstLoad ? ' including first model load' : ''}. Use Undo to restore the original.`,
                );
              } catch (error) {
                setBackgroundRemovalMessage(
                  error instanceof Error ? error.message : 'Background removal failed.',
                );
              } finally {
                setRemovingBackground(false);
              }
            }}
            disabled={readOnly || !!raster.locked || removingBackground}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {removingBackground ? 'Removing background…' : 'Remove background'}
          </button>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Runs free on this device using the objects-and-products model. The first use
            downloads and caches the model.
          </p>
          {backgroundRemovalMessage && (
            <p
              className="text-[11px] text-zinc-600 dark:text-zinc-300"
              role="status"
            >
              {backgroundRemovalMessage}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-800/50">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Shape, position, and size are edited in the mask editor.
        </p>
        <button
          type="button"
          onClick={() => setMaskEditorOpen(true)}
          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          Mask
        </button>
        {shapeMask && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Current: {mask} — image {Math.round((raster.maskImageScale ?? 1) * 100)}%, mask {Math.round((raster.maskScale ?? 1) * 100)}%
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label="Flip image">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Flip</span>
        <div className="flex gap-2">
          <button
            type="button"
            title="Mirror left/right; click again to restore"
            onClick={() =>
              updateElement(raster.id, { flipHorizontal: !(raster.flipHorizontal ?? false) })
            }
            className={`rounded border px-3 py-2 text-xs font-medium transition-colors ${
              raster.flipHorizontal
                ? 'border-accent-600 bg-accent-600 text-white dark:border-gold-500 dark:bg-gold-500 dark:text-zinc-950'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Horizontal
          </button>
          <button
            type="button"
            title="Mirror top/bottom; click again to restore"
            onClick={() =>
              updateElement(raster.id, { flipVertical: !(raster.flipVertical ?? false) })
            }
            className={`rounded border px-3 py-2 text-xs font-medium transition-colors ${
              raster.flipVertical
                ? 'border-accent-600 bg-accent-600 text-white dark:border-gold-500 dark:bg-gold-500 dark:text-zinc-950'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Vertical
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label="Texture overlay">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Texture overlay</span>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            title="None"
            onClick={(e) => {
              e.stopPropagation();
              updateElement(raster.id, { textureOverlay: undefined });
            }}
            className={`flex aspect-square items-center justify-center rounded border-2 text-[10px] ${
              !raster.textureOverlay
                ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                : 'border-zinc-200 dark:border-zinc-600'
            }`}
          >
            —
          </button>
          {BUILT_IN_TEXTURES.map((tex) => (
            <button
              key={tex.id}
              type="button"
              title={tex.name}
              onClick={(e) => {
                e.stopPropagation();
                updateElement(raster.id, {
                  textureOverlay: {
                    textureId: tex.id,
                    opacity: raster.textureOverlay?.opacity ?? 0.5,
                  },
                });
              }}
              className={`aspect-square rounded border-2 p-0.5 ${
                raster.textureOverlay?.textureId === tex.id
                  ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                  : 'border-zinc-200 dark:border-zinc-600'
              }`}
              style={{
                backgroundImage: `url(${tex.url})`,
                backgroundSize: 'cover',
              }}
            />
          ))}
        </div>
        {raster.textureOverlay && (
          <PosterSlider
            label={`Opacity (${Math.round((raster.textureOverlay.opacity ?? 0.5) * 100)}%)`}
            min={5}
            max={95}
            step={5}
            value={(raster.textureOverlay.opacity ?? 0.5) * 100}
            onChange={(v) =>
              updateElement(raster.id, {
                textureOverlay: {
                  ...raster.textureOverlay!,
                  opacity: v / 100,
                },
              })
            }
          />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Edge</label>
        <select
          value={edgeSelectValue}
          onChange={(e) => {
            const ed = e.target.value as PosterImageEdge;
            const updates: Partial<PosterElement> = { edge: ed };
            if ((ed === 'paper-tear' || ed === 'fade-paper-tear') && shapeMask) {
              updates.mask = 'none';
            }
            updateElement(raster.id, updates);
          }}
          className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="none">None</option>
          <option value="fade">Soft fade (vignette)</option>
          <option value="paper-tear" disabled={tearDisabled}>
            Paper tear
          </option>
          <option value="fade-paper-tear" disabled={tearDisabled}>
            Paper tear + soft fade
          </option>
        </select>
        {tearDisabled && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Turn off shape mask to use paper tear (or tear + fade).
          </p>
        )}
        {edgeUsesFade && (
          <div className="mt-1 flex flex-col gap-1">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Fade area</label>
            <select
              value={fadeDirection}
              onChange={(e) =>
                updateElement(raster.id, {
                  edgeFadeDirection: e.target.value as PosterImageFadeDirection,
                })
              }
              className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="radial">All around (vignette)</option>
              <option value="bottom">Bottom only</option>
            </select>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Bottom only fades upward from the lower edge; all around uses a circular vignette.
            </p>
          </div>
        )}
      </div>

      {edgeUsesFade && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <PosterSlider
              label={`Fade reach (${Math.round(fadeAmount * 100)}%)`}
              min={0.05}
              max={0.95}
              step={0.05}
              value={fadeAmount}
              onChange={(v) =>
                updateElement(raster.id, { edgeFadeAmount: v })
              }
            />
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Higher = fade reaches further inward from the edge or bottom band.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <PosterSlider
              label={`Outer edge opacity (${Math.round(fadeMinOpacity * 100)}%)`}
              min={0}
              max={1}
              step={0.05}
              value={fadeMinOpacity}
              onChange={(v) =>
                updateElement(raster.id, { edgeFadeMinOpacity: v })
              }
            />
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              How opaque the outer faded region stays. Raise this to avoid harsh, fully transparent
              rims; lower keeps a stronger soft-edge cutout.
            </p>
          </div>
        </div>
      )}

      {edgeUsesTear && !tearDisabled && (
        <button
          type="button"
          onClick={() =>
            updateElement(raster.id, {
              edgeTearSeed: Math.floor(Math.random() * 1_000_000_000),
            })
          }
          className="rounded border border-zinc-200 px-2 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Regenerate tear pattern
        </button>
      )}

      <MaskEditorModal
        open={maskEditorOpen}
        target={raster}
        onClose={() => setMaskEditorOpen(false)}
        onApply={(updates) => {
          updateElement(raster.id, updates);
          pushHistory();
        }}
      />
    </div>
  );
}

const toggleBtn =
  'rounded border border-zinc-200 px-2.5 py-1.5 text-xs font-medium transition-colors dark:border-zinc-600';
const toggleBtnOn =
  'bg-accent-600 text-white dark:bg-gold-500 dark:text-zinc-950';
const toggleBtnOff =
  'bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700';

function PosterTextControls({
  text,
  updateElement,
}: {
  text: PosterTextElement;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const fontUploadRef = useRef<HTMLInputElement>(null);
  const [fontUploadStatus, setFontUploadStatus] = useState<string | null>(null);
  const [fontUploading, setFontUploading] = useState(false);
  const fontOptions = usePosterFontOptions();

  const uploadFonts = async (files: File[]) => {
    if (files.length === 0 || fontUploading) return;
    setFontUploading(true);
    setFontUploadStatus(`Preparing ${files.length} font${files.length === 1 ? '' : 's'}…`);
    const uploaded: FontLibraryEntry[] = [];
    const errors: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]!;
      setFontUploadStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      try {
        const { label } = await inspectFontFile(file);
        uploaded.push(await uploadFontFile(file, label));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${file.name}: upload failed.`);
      }
    }

    if (uploaded.length > 0) {
      notifyFontLibraryChanged();
      const first = uploaded[0]!;
      try {
        const family = await ensureFontPreviewFromUrl(`cloud-font-${first.id}`, first.fontUrl);
        updateElement(text.id, { fontFamily: family });
      } catch {
        // The refreshed library will retry the preview; the upload itself still succeeded.
      }
    }

    if (errors.length === 0) {
      setFontUploadStatus(
        `${uploaded.length} font${uploaded.length === 1 ? '' : 's'} added to the shared library.`,
      );
    } else if (uploaded.length > 0) {
      setFontUploadStatus(`${uploaded.length} uploaded. ${errors[0]}`);
    } else {
      setFontUploadStatus(errors[0] || 'No fonts were uploaded.');
    }
    setFontUploading(false);
  };

  useEffect(() => {
    if (!fontMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = fontMenuRef.current;
      if (el && !el.contains(e.target as Node)) setFontMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [fontMenuOpen]);

  const isBold =
    text.fontWeight === 'bold' ||
    text.fontWeight === 700 ||
    text.fontWeight === '700';
  const isItalic = text.fontStyle === 'italic';
  const hasUnderline = text.underline === true;
  const hasStrike = text.linethrough === true;
  const fillGradient = text.fillGradient;
  const fillPattern = text.fillPattern;
  const knownMatch = fontOptions.find((o) => o.value === text.fontFamily);
  const displayLabel = knownMatch
    ? knownMatch.label
    : text.fontFamily.length > 40
      ? `${text.fontFamily.slice(0, 40)}…`
      : text.fontFamily;

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Text</p>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400" id="poster-font-label">
          Font
        </label>
        <div className="relative" ref={fontMenuRef}>
          <button
            type="button"
            id="poster-font-trigger"
            aria-haspopup="listbox"
            aria-expanded={fontMenuOpen}
            aria-labelledby="poster-font-label poster-font-trigger"
            onClick={() => setFontMenuOpen((o) => !o)}
            className="flex w-full max-w-full items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-2 text-left text-sm dark:border-zinc-700 dark:bg-zinc-800"
            style={{ fontFamily: text.fontFamily }}
          >
            <span className="min-w-0 truncate">{displayLabel}</span>
            <span className="shrink-0 text-zinc-400" aria-hidden>
              ▾
            </span>
          </button>
          {fontMenuOpen && (
            <ul
              className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
              role="listbox"
              aria-label="Choose font"
            >
              {!knownMatch && (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected
                    className="w-full px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    style={{ fontFamily: text.fontFamily }}
                    onClick={() => setFontMenuOpen(false)}
                  >
                    {displayLabel} (current)
                  </button>
                </li>
              )}
              {fontOptions.map((o) => {
                const selected = o.value === text.fontFamily;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                        selected ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                      }`}
                      style={{ fontFamily: o.value }}
                      onClick={() => {
                        setFontMenuOpen(false);
                        if (o.previewKey && o.fontUrl) {
                          void ensureFontPreviewFromUrl(o.previewKey, o.fontUrl)
                            .then((family) => updateElement(text.id, { fontFamily: family }))
                            .catch(() => setFontUploadStatus(`Could not load ${o.label}.`));
                          return;
                        }
                        updateElement(text.id, { fontFamily: o.value });
                      }}
                    >
                      {o.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <input
          ref={fontUploadRef}
          type="file"
          accept=".ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-opentype"
          multiple
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void uploadFonts(files);
          }}
        />
        <button
          type="button"
          disabled={fontUploading}
          onClick={() => fontUploadRef.current?.click()}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-accent-500 hover:text-accent-700 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:border-gold-500 dark:hover:text-gold-400"
        >
          <span aria-hidden>{fontUploading ? '↻' : '+'}</span>
          {fontUploading ? 'Uploading fonts…' : 'Upload TTF / OTF fonts'}
        </button>
        {fontUploadStatus && (
          <p
            className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400"
            role="status"
            aria-live="polite"
          >
            {fontUploadStatus}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Style</label>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            title="Bold"
            onClick={() =>
              updateElement(text.id, { fontWeight: isBold ? 'normal' : 'bold' })
            }
            className={`${toggleBtn} ${isBold ? toggleBtnOn : toggleBtnOff}`}
          >
            B
          </button>
          <button
            type="button"
            title="Italic"
            onClick={() =>
              updateElement(text.id, { fontStyle: isItalic ? 'normal' : 'italic' })
            }
            className={`${toggleBtn} italic ${isItalic ? toggleBtnOn : toggleBtnOff}`}
          >
            I
          </button>
          <button
            type="button"
            title="Underline"
            onClick={() => updateElement(text.id, { underline: !hasUnderline })}
            className={`${toggleBtn} underline ${hasUnderline ? toggleBtnOn : toggleBtnOff}`}
          >
            U
          </button>
          <button
            type="button"
            title="Strikethrough"
            onClick={() => updateElement(text.id, { linethrough: !hasStrike })}
            className={`${toggleBtn} line-through ${hasStrike ? toggleBtnOn : toggleBtnOff}`}
          >
            S
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Alignment</label>
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as PosterTextAlign[]).map((a) => (
            <button
              key={a}
              type="button"
              title={`Align ${a}`}
              onClick={() => updateElement(text.id, { textAlign: a })}
              className={`${toggleBtn} ${(text.textAlign ?? 'left') === a ? toggleBtnOn : toggleBtnOff}`}
            >
              {a === 'left' && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx=".5" />
                  <rect x="1" y="7" width="10" height="2" rx=".5" />
                  <rect x="1" y="12" width="14" height="2" rx=".5" />
                </svg>
              )}
              {a === 'center' && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx=".5" />
                  <rect x="3" y="7" width="10" height="2" rx=".5" />
                  <rect x="1" y="12" width="14" height="2" rx=".5" />
                </svg>
              )}
              {a === 'right' && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx=".5" />
                  <rect x="5" y="7" width="10" height="2" rx=".5" />
                  <rect x="1" y="12" width="14" height="2" rx=".5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Font size</label>
        <input
          type="number"
          value={text.fontSize}
          onChange={(e) =>
            updateElement(text.id, {
              fontSize: parseInt(e.target.value, 10) || 24,
            })
          }
          className="w-24 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div className="flex flex-col gap-1">
        <PosterSlider
          label={
            <>
              Letter spacing{' '}
              <span className="font-normal text-zinc-400">
                ({((text.charSpacing ?? 0) / 1000).toFixed(2)} em)
              </span>
            </>
          }
          min={-150}
          max={400}
          step={5}
          value={text.charSpacing ?? 0}
          onChange={(v) => updateElement(text.id, { charSpacing: v })}
        />
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
          Tighter ← → wider. Scales with font size (same as CSS letter-spacing in em).
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <PosterSlider
          label={
            <>
              Row spacing{' '}
              <span className="font-normal text-zinc-400">
                ({(text.lineHeight ?? 1.16).toFixed(2)}x)
              </span>
            </>
          }
          min={0.8}
          max={2}
          step={0.01}
          value={text.lineHeight ?? 1.16}
          onChange={(v) => updateElement(text.id, { lineHeight: v })}
        />
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
          Controls spacing between lines in multi-line text.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">Fill</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() =>
              updateElement(text.id, {
                fill: text.fill || '#000000',
                fillGradient: undefined,
                fillPattern: undefined,
              })
            }
            className={`rounded border px-2 py-1 text-xs ${
              !text.fillGradient && !text.fillPattern
                ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                : 'border-zinc-200 dark:border-zinc-600'
            }`}
          >
            Solid
          </button>
          <button
            type="button"
            onClick={() =>
              updateElement(text.id, {
                fillGradient: text.fillGradient ?? {
                  type: 'linear',
                  angle: 90,
                  stops: [
                    { offset: 0, color: '#3b82f6' },
                    { offset: 1, color: '#8b5cf6' },
                  ],
                },
                fillPattern: undefined,
              })
            }
            className={`rounded border px-2 py-1 text-xs ${
              fillGradient
                ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                : 'border-zinc-200 dark:border-zinc-600'
            }`}
          >
            Gradient
          </button>
          <button
            type="button"
            onClick={() =>
              updateElement(text.id, {
                fillGradient: undefined,
                fillPattern: {
                  textureId: text.fillPattern?.textureId ?? 'dots',
                  repeat: 'repeat',
                  scale: text.fillPattern?.scale ?? 1,
                },
              })
            }
            className={`rounded border px-2 py-1 text-xs ${
              fillPattern
                ? 'border-amber-500 bg-amber-50 dark:bg-zinc-700'
                : 'border-zinc-200 dark:border-zinc-600'
            }`}
          >
            Texture
          </button>
        </div>
        {fillGradient ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Type</label>
              <select
                value={fillGradient.type}
                onChange={(e) => {
                  const t = e.target.value as 'linear' | 'radial';
                  updateElement(text.id, {
                    fillGradient:
                      t === 'linear'
                        ? {
                             type: 'linear',
                             angle: fillGradient.type === 'linear' ? fillGradient.angle : 90,
                             stops: fillGradient.stops,
                           }
                        : {
                            type: 'radial',
                            cx: 0.5,
                            cy: 0.5,
                            r: 0.5,
                            stops: fillGradient.stops,
                          },
                  });
                }}
                className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
              </select>
            </div>
            {fillGradient.type === 'linear' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Angle (°)</label>
                <input
                  type="number"
                  value={Math.round(fillGradient.angle)}
                  onChange={(e) =>
                    updateElement(text.id, {
                      fillGradient: {
                        type: 'linear',
                        stops: fillGradient.stops,
                        angle: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            )}
            {fillGradient.type === 'radial' && (
              <div className="flex flex-wrap gap-2">
                {(['cx', 'cy', 'r'] as const).map((key) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">
                      {key === 'cx' ? 'Center X' : key === 'cy' ? 'Center Y' : 'Radius'} %
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round(fillGradient[key] * 100)}
                      onChange={(e) =>
                        updateElement(text.id, {
                          fillGradient: {
                            type: 'radial',
                            cx: key === 'cx' ? (parseFloat(e.target.value) || 50) / 100 : fillGradient.cx,
                            cy: key === 'cy' ? (parseFloat(e.target.value) || 50) / 100 : fillGradient.cy,
                            r: key === 'r' ? (parseFloat(e.target.value) || 50) / 100 : fillGradient.r,
                            stops: fillGradient.stops,
                          },
                        })
                      }
                      className="w-16 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                ))}
              </div>
            )}
            <GradientStopsEditor
              stops={fillGradient.stops}
              onChange={(stops) =>
                updateElement(text.id, {
                  fillGradient:
                    fillGradient.type === 'linear'
                      ? { type: 'linear', angle: fillGradient.angle, stops }
                      : {
                          type: 'radial',
                          cx: fillGradient.cx,
                          cy: fillGradient.cy,
                          r: fillGradient.r,
                          stops,
                        },
                })
              }
            />
          </>
        ) : !fillPattern ? (
          <ColorPickerPopover
            color={text.fill}
            onChange={(c) => updateElement(text.id, { fill: c })}
          />
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {BUILT_IN_TEXTURES.map((tex) => (
                <button
                  key={tex.id}
                  type="button"
                  title={tex.name}
                  onClick={() =>
                    updateElement(text.id, {
                      fillPattern: { ...fillPattern, textureId: tex.id },
                    })
                  }
                  className={`aspect-square rounded border-2 p-0.5 ${
                    fillPattern.textureId === tex.id
                      ? 'border-amber-500'
                      : 'border-zinc-200 dark:border-zinc-600'
                  }`}
                  style={{
                    backgroundImage: `url(${tex.url})`,
                    backgroundSize: 'cover',
                  }}
                />
              ))}
            </div>
            <PosterSlider
              label="Scale (%)"
              min={25}
              max={200}
              step={5}
              value={(fillPattern.scale ?? 1) * 100}
              onChange={(v) =>
                updateElement(text.id, {
                  fillPattern: {
                    ...fillPattern,
                    scale: v / 100,
                  },
                })
              }
            />
          </>
        )}

        <div className="flex flex-col gap-1 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <PosterSlider
            label={`Fill opacity (${Math.round((text.fillOpacity ?? 1) * 100)}%)`}
            min={0}
            max={100}
            step={5}
            value={Math.round((text.fillOpacity ?? 1) * 100)}
            onChange={(v) =>
              updateElement(text.id, {
                fillOpacity: v / 100,
              })
            }
          />
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            0% = outline only.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Outline</label>
            <button
              type="button"
              onClick={() =>
                updateElement(text.id, {
                  stroke: (text.strokeWidth ?? 0) > 0 ? undefined : '#000000',
                  strokeWidth: (text.strokeWidth ?? 0) > 0 ? 0 : 2,
                })
              }
              className={`text-[10px] ${(text.strokeWidth ?? 0) > 0 ? 'text-amber-600' : 'text-zinc-500'}`}
            >
              {(text.strokeWidth ?? 0) > 0 ? 'On' : 'Off'}
            </button>
          </div>
          {(text.strokeWidth ?? 0) > 0 && (
            <>
              <div className="flex items-center gap-2">
                <ColorPickerPopover
                  color={
                    text.stroke && /^#[0-9A-Fa-f]{6}$/i.test(text.stroke)
                      ? text.stroke
                      : '#000000'
                  }
                  onChange={(c) =>
                    updateElement(text.id, {
                      stroke: c,
                      strokeWidth: text.strokeWidth ?? 2,
                    })
                  }
                />
                <div className="flex-1">
                  <PosterSlider
                    label={
                      <span className="text-[10px] text-zinc-500">
                        Width ({(() => {
                          const w = text.strokeWidth ?? 2;
                          return w === Math.round(w) ? String(w) : w.toFixed(2);
                        })()}px)
                      </span>
                    }
                    min={0.25}
                    max={24}
                    step={0.25}
                    value={text.strokeWidth ?? 2}
                    onChange={(v) =>
                      updateElement(text.id, {
                        strokeWidth: Math.max(0.25, v),
                        stroke: (text.stroke && /^#[0-9A-Fa-f]{6}$/i.test(text.stroke)) ? text.stroke : '#000000',
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ShadowControls({
  elementId,
  shadow,
  updateElement,
}: {
  elementId: string;
  shadow?: PosterShadow;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
}) {
  const enabled = !!shadow;
  const s = shadow ?? { color: 'rgba(0,0,0,0.35)', blur: 8, offsetX: 4, offsetY: 4 };

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Shadow</p>
        <button
          type="button"
          onClick={() =>
            updateElement(
              elementId,
              enabled
                ? { shadow: undefined }
                : { shadow: { color: 'rgba(0,0,0,0.35)', blur: 8, offsetX: 4, offsetY: 4 } }
            )
          }
          className={`${toggleBtn} text-[10px] ${enabled ? toggleBtnOn : toggleBtnOff}`}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
      {enabled && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Color</label>
            <ColorPickerPopover
              color={s.color.startsWith('#') ? s.color : '#000000'}
              onChange={(c) =>
                updateElement(elementId, { shadow: { ...s, color: c } })
              }
            />
          </div>
          <PosterSlider
            label={`Blur (${s.blur})`}
            min={0}
            max={60}
            step={1}
            value={s.blur}
            onChange={(v) =>
              updateElement(elementId, { shadow: { ...s, blur: v } })
            }
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <PosterSlider
                label={`X (${s.offsetX})`}
                min={-40}
                max={40}
                step={1}
                value={s.offsetX}
                onChange={(v) =>
                  updateElement(elementId, { shadow: { ...s, offsetX: v } })
                }
              />
            </div>
            <div className="flex-1">
              <PosterSlider
                label={`Y (${s.offsetY})`}
                min={-40}
                max={40}
                step={1}
                value={s.offsetY}
                onChange={(v) =>
                  updateElement(elementId, { shadow: { ...s, offsetY: v } })
                }
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PosterRightSidebar({ readOnly = false, onOpenEdit3D }: PosterRightSidebarProps) {
  const navigate = useNavigate();
  const elements = usePosterStore((s) => s.elements);
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const canvasBackground = usePosterStore((s) => s.canvasBackground);
  const setCanvasBackground = usePosterStore((s) => s.setCanvasBackground);
  const updateElement = usePosterStore((s) => s.updateElement);
  const removeElements = usePosterStore((s) => s.removeElements);
  const duplicateElements = usePosterStore((s) => s.duplicateElements);
  const bringForward = usePosterStore((s) => s.bringForward);
  const sendBackward = usePosterStore((s) => s.sendBackward);
  const pushHistory = usePosterStore((s) => s.pushHistory);
  const pathEditTargetId = usePosterStore((s) => s.pathEditTargetId);
  const setPathEditTargetId = usePosterStore((s) => s.setPathEditTargetId);
  const pathToolMode = usePosterStore((s) => s.pathToolMode);
  const setPathToolMode = usePosterStore((s) => s.setPathToolMode);

  const selected = elements.filter((e) => selectedIds.includes(e.id));
  const single = selected.length === 1 ? selected[0] : null;

  useEffect(() => {
    if (!single) {
      setPathEditTargetId(null);
      return;
    }
    if (pathEditTargetId && pathEditTargetId !== single.id) {
      setPathEditTargetId(null);
    }
  }, [single, pathEditTargetId, setPathEditTargetId]);

  const updateGradientStops = (stops: GradientStop[]) => {
    if (!isSolidBackground(canvasBackground)) {
      setCanvasBackground({ ...canvasBackground, stops } as CanvasBackground);
    }
  };

  if (selected.length === 0) {
    return (
      <div className="relative flex flex-col gap-4 p-4">
        {readOnly && (
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={() => navigate('/login')}
            title="Login to edit"
            aria-label="Login to edit properties"
          />
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Canvas
        </h3>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">Background</label>
          <select
            value={canvasBackground.type}
            onChange={(e) => {
              const t = e.target.value as CanvasBackground['type'];
              if (t === 'solid') setCanvasBackground({ type: 'solid', color: '#ffffff' });
              else if (t === 'linear') setCanvasBackground({ type: 'linear', angle: 90, stops: DEFAULT_GRADIENT_STOPS });
              else if (t === 'radial') setCanvasBackground({ type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: DEFAULT_GRADIENT_STOPS });
              else setCanvasBackground({ type: 'conic', angle: 0, cx: 0.5, cy: 0.5, stops: DEFAULT_GRADIENT_STOPS });
            }}
            className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="solid">Solid</option>
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
            <option value="conic">Conic</option>
          </select>

          {isSolidBackground(canvasBackground) ? (
            <div className="flex items-center gap-2">
              <ColorPickerPopover
                color={/^#[0-9A-Fa-f]{6}$/.test(canvasBackground.color) ? canvasBackground.color : '#ffffff'}
                onChange={(c) => setCanvasBackground({ type: 'solid', color: c })}
              />
              <input
                type="text"
                value={canvasBackground.color}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setCanvasBackground({ type: 'solid', color: v || '#' });
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) setCanvasBackground({ type: 'solid', color: '#ffffff' });
                }}
                className="flex-1 rounded border border-zinc-200 px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800"
                placeholder="#ffffff"
              />
            </div>
          ) : (
            <>
              {canvasBackground.type === 'linear' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-500">Angle (degrees)</label>
                  <input
                    type="number"
                    value={Math.round(canvasBackground.angle)}
                    onChange={(e) => setCanvasBackground({ ...canvasBackground, angle: parseFloat(e.target.value) || 0 })}
                    className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              )}
              {(canvasBackground.type === 'radial' || canvasBackground.type === 'conic') && (
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">Center X %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(canvasBackground.cx * 100)}
                      onChange={(e) => setCanvasBackground({ ...canvasBackground, cx: (parseFloat(e.target.value) || 50) / 100 })}
                      className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">Center Y %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(canvasBackground.cy * 100)}
                      onChange={(e) => setCanvasBackground({ ...canvasBackground, cy: (parseFloat(e.target.value) || 50) / 100 })}
                      className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  {canvasBackground.type === 'radial' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500">Radius</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={Math.round(canvasBackground.r * 100)}
                        onChange={(e) => setCanvasBackground({ ...canvasBackground, r: (parseFloat(e.target.value) || 50) / 100 })}
                        className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </div>
                  )}
                  {canvasBackground.type === 'conic' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500">Angle</label>
                      <input
                        type="number"
                        value={Math.round(canvasBackground.angle)}
                        onChange={(e) => setCanvasBackground({ ...canvasBackground, angle: parseFloat(e.target.value) || 0 })}
                        className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-500">Color stops</label>
                {(canvasBackground.stops ?? DEFAULT_GRADIENT_STOPS).map((stop, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <ColorPickerPopover
                      color={/^#[0-9A-Fa-f]{6}$/.test(stop.color) ? stop.color : '#ffffff'}
                      onChange={(c) => {
                        const next = [...(canvasBackground.stops ?? DEFAULT_GRADIENT_STOPS)];
                        next[i] = { ...next[i], color: c };
                        updateGradientStops(next);
                      }}
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(stop.offset * 100)}
                      onChange={(e) => {
                        const next = [...(canvasBackground.stops ?? DEFAULT_GRADIENT_STOPS)];
                        next[i] = { ...next[i], offset: (parseFloat(e.target.value) || 0) / 100 };
                        updateGradientStops(next);
                      }}
                      className="w-14 rounded border border-zinc-200 px-1 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <span className="text-xs text-zinc-500">%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Select an element to edit its properties
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-4 p-4">
      {readOnly && (
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          onClick={() => navigate('/login')}
          title="Login to edit"
          aria-label="Login to edit properties"
        />
      )}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Properties
      </h3>

      {single && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Lock</p>
            <button
              type="button"
              onClick={() => updateElement(single.id, { locked: !single.locked })}
              title={single.locked ? 'Unlock (allow movement)' : 'Lock (prevent movement)'}
              className={`rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                single.locked
                  ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              {single.locked ? 'Unlock' : 'Lock'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Position</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={Math.round(single.left)}
                onChange={(e) =>
                  updateElement(single.id, { left: parseFloat(e.target.value) || 0 })
                }
                className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <input
                type="number"
                value={Math.round(single.top)}
                onChange={(e) =>
                  updateElement(single.id, { top: parseFloat(e.target.value) || 0 })
                }
                className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Scale</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                value={single.scaleX}
                onChange={(e) =>
                  updateElement(single.id, {
                    scaleX: parseFloat(e.target.value) || 1,
                    scaleY: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Rotation</label>
            <input
              type="number"
              value={Math.round(single.angle)}
              onChange={(e) =>
                updateElement(single.id, { angle: parseFloat(e.target.value) || 0 })
              }
              className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <PosterSlider
            label="Opacity"
            min={0}
            max={1}
            step={0.01}
            value={single.opacity}
            onChange={(v) => updateElement(single.id, { opacity: v })}
          />

          {(single.type === 'image' || single.type === '3d-text') && (
            <PosterImageAppearanceControls
              raster={single as PosterImageElement | Poster3DTextElement}
              updateElement={updateElement}
              pushHistory={pushHistory}
              readOnly={readOnly}
            />
          )}

          {(single.type === 'image' || single.type === '3d-text') && (
            <ImageAdjustmentControls
              elementId={single.id}
              adj={single as ImageAdjustments}
              updateElement={updateElement}
            />
          )}

          {single.type === 'text' && (
            <PosterTextControls
              text={single as PosterTextElement}
              updateElement={updateElement}
            />
          )}

          {single.type === '3d-text' && onOpenEdit3D && (
            <button
              onClick={() => onOpenEdit3D(single.id)}
              className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
            >
              Edit in 3D Editor
            </button>
          )}

          {single.type === 'line' && (
            <LineCurveControls
              shape={single as PosterShapeElement}
              updateElement={updateElement}
            />
          )}

          {(single.type === 'rect' ||
            single.type === 'circle' ||
            single.type === 'triangle' ||
            single.type === 'ellipse' ||
            single.type === 'line' ||
            single.type === 'polygon') && (
            <ShapeFillAndRoundnessControls
              shape={single as PosterShapeElement}
              updateElement={updateElement}
            />
          )}

          {(single.type === 'line' || single.type === 'polygon' || single.type === 'path') && (
            <PathEditingControls
              element={single as PosterShapeElement | PosterPathElement}
              pathEditActive={pathEditTargetId === single.id}
              setPathEditActive={(active) => setPathEditTargetId(active ? single.id : null)}
              updateElement={updateElement}
            />
          )}

          {single.type === 'path' && (
            <PathStyleControls
              path={single as PosterPathElement}
              updateElement={updateElement}
            />
          )}

          <ShadowControls
            elementId={single.id}
            shadow={single.shadow}
            updateElement={updateElement}
          />
        </>
      )}

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <p className="mb-2 text-xs text-zinc-500">Layers</p>
        <div className="flex gap-1">
          <button
            onClick={() => bringForward(selectedIds)}
            className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Forward
          </button>
          <button
            onClick={() => sendBackward(selectedIds)}
            className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Backward
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => duplicateElements(selectedIds)}
          className="flex-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Duplicate
        </button>
        <button
          onClick={() => removeElements(selectedIds)}
          className="flex-1 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
