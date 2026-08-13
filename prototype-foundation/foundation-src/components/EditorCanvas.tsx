import { useEffect, useMemo, useRef, useState } from 'react';
import { commandMeta } from '../domain/commands';
import type {
  ElementTransform,
  Point,
  PathElement,
  PosterElement,
} from '../domain/document';
import { editorStore, useEditor } from '../editor/editorStore';

type Gesture = {
  pointerId: number;
  id: string;
  mode: 'move' | 'resize';
  origin: { x: number; y: number };
  start: ElementTransform;
};

type PathGesture = {
  pointerId: number;
  id: string;
  nodeIndex: number;
  origin: { x: number; y: number };
  startPoints: Point[];
  transform: ElementTransform;
  viewBox: PathViewBox;
};

type PathViewBox = { x: number; y: number; width: number; height: number };

export function EditorCanvas() {
  const document = useEditor((state) => state.document);
  const selectedIds = useEditor((state) => state.selectedIds);
  const svgRef = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [preview, setPreview] = useState<Partial<ElementTransform> | null>(null);
  const [pathGesture, setPathGesture] = useState<PathGesture | null>(null);
  const [pathPreview, setPathPreview] = useState<Point[] | null>(null);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : undefined;

  const selectedElement = useMemo(
    () => document.elements.find((element) => element.id === selectedId),
    [document.elements, selectedId],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        editorStore.dispatch({
          type: event.shiftKey ? 'history.redo' : 'history.undo',
          meta: commandMeta('keyboard'),
        });
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        editorStore.dispatch({ type: 'history.redo', meta: commandMeta('keyboard') });
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        event.preventDefault();
        editorStore.dispatch({
          type: 'element.remove',
          ids: selectedIds,
          meta: commandMeta('keyboard', 'Delete selected elements'),
        });
        editorStore.dispatch({
          type: 'selection.set',
          ids: [],
          meta: commandMeta('keyboard'),
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds]);

  const toCanvasPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svg.getScreenCTM()?.inverse());
  };

  const beginGesture = (
    event: React.PointerEvent<SVGElement>,
    element: PosterElement,
    mode: Gesture['mode'],
  ) => {
    if (element.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    editorStore.dispatch({
      type: 'selection.set',
      ids: [element.id],
      meta: commandMeta('pointer'),
    });
    setGesture({
      pointerId: event.pointerId,
      id: element.id,
      mode,
      origin: toCanvasPoint(event.clientX, event.clientY),
      start: pickTransform(element),
    });
    setPreview(null);
  };

  const beginPathGesture = (
    event: React.PointerEvent<SVGElement>,
    element: PathElement,
    nodeIndex: number,
  ) => {
    if (element.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPathGesture({
      pointerId: event.pointerId,
      id: element.id,
      nodeIndex,
      origin: toCanvasPoint(event.clientX, event.clientY),
      startPoints: structuredClone(element.points),
      transform: pickTransform(element),
      viewBox: pathViewBox(element),
    });
    setPathPreview(structuredClone(element.points));
  };

  const moveGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pathGesture && event.pointerId === pathGesture.pointerId) {
      const point = toCanvasPoint(event.clientX, event.clientY);
      const dx = point.x - pathGesture.origin.x;
      const dy = point.y - pathGesture.origin.y;
      const radians = (-pathGesture.transform.rotation * Math.PI) / 180;
      const rotatedX = dx * Math.cos(radians) - dy * Math.sin(radians);
      const rotatedY = dx * Math.sin(radians) + dy * Math.cos(radians);
      const scaleX = pathGesture.transform.width / pathGesture.viewBox.width;
      const scaleY = pathGesture.transform.height / pathGesture.viewBox.height;
      const points = structuredClone(pathGesture.startPoints);
      const node = points[pathGesture.nodeIndex];
      const startNode = pathGesture.startPoints[pathGesture.nodeIndex];
      if (node && startNode) {
        node.x = Math.round((startNode.x + rotatedX / scaleX) * 100) / 100;
        node.y = Math.round((startNode.y + rotatedY / scaleY) * 100) / 100;
        setPathPreview(points);
      }
      return;
    }
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const point = toCanvasPoint(event.clientX, event.clientY);
    const dx = point.x - gesture.origin.x;
    const dy = point.y - gesture.origin.y;
    if (gesture.mode === 'move') {
      setPreview({
        x: Math.round(gesture.start.x + dx),
        y: Math.round(gesture.start.y + dy),
      });
    } else {
      setPreview({
        width: Math.max(20, Math.round(gesture.start.width + dx)),
        height: Math.max(20, Math.round(gesture.start.height + dy)),
      });
    }
  };

  const endGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pathGesture && event.pointerId === pathGesture.pointerId) {
      if (pathPreview) {
        const target = document.elements.find(
          (element): element is PathElement =>
            element.id === pathGesture.id && element.type === 'path',
        );
        if (target) {
          editorStore.dispatch({
            type: 'path.replace-points',
            id: target.id,
            points: pathPreview,
            closed: target.closed,
            meta: commandMeta('pointer', 'Move path node'),
          });
        }
      }
      setPathGesture(null);
      setPathPreview(null);
      return;
    }
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (preview) {
      editorStore.dispatch({
        type: 'element.transform',
        id: gesture.id,
        transform: preview,
        meta: commandMeta('pointer', gesture.mode === 'move' ? 'Move element' : 'Resize element'),
      });
    }
    setGesture(null);
    setPreview(null);
  };

  return (
    <main className="canvas-workspace" aria-label="Poster workspace">
      <div
        className="canvas-frame"
        style={{ aspectRatio: `${document.canvas.width} / ${document.canvas.height}` }}
      >
        <svg
          ref={svgRef}
          className="poster-canvas"
          viewBox={`0 0 ${document.canvas.width} ${document.canvas.height}`}
          role="img"
          aria-label={`${document.title} poster canvas`}
          onPointerMove={moveGesture}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              editorStore.dispatch({
                type: 'selection.set',
                ids: [],
                meta: commandMeta('pointer'),
              });
            }
          }}
        >
          <defs>
            <filter id="three-text-shadow" x="-30%" y="-30%" width="180%" height="180%">
              <feDropShadow dx="8" dy="12" stdDeviation="5" floodColor="#000" floodOpacity=".45" />
            </filter>
          </defs>
          <rect
            width={document.canvas.width}
            height={document.canvas.height}
            fill={document.canvas.background}
            pointerEvents="none"
          />
          {document.elements.map((element) => {
            if (element.hidden) return null;
            const transform =
              gesture?.id === element.id && preview
                ? { ...pickTransform(element), ...preview }
                : pickTransform(element);
            return (
              <ElementView
                key={element.id}
                element={element}
                transform={transform}
                selected={selectedIds.includes(element.id)}
                pathPoints={
                  element.type === 'path' &&
                  pathGesture?.id === element.id &&
                  pathPreview
                    ? pathPreview
                    : undefined
                }
                onPointerDown={(event) => beginGesture(event, element, 'move')}
              />
            );
          })}
          {selectedElement && !selectedElement.hidden && (
            <SelectionBox
              element={selectedElement}
              transform={
                gesture?.id === selectedElement.id && preview
                  ? { ...pickTransform(selectedElement), ...preview }
                  : pickTransform(selectedElement)
              }
              onResizePointerDown={(event) => beginGesture(event, selectedElement, 'resize')}
              onPathNodePointerDown={
                selectedElement.type === 'path'
                  ? (event, nodeIndex) =>
                      beginPathGesture(event, selectedElement, nodeIndex)
                  : undefined
              }
              pathPoints={
                selectedElement.type === 'path' &&
                pathGesture?.id === selectedElement.id &&
                pathPreview
                  ? pathPreview
                  : undefined
              }
            />
          )}
        </svg>
      </div>
      <div className="canvas-status">
        {document.canvas.width} × {document.canvas.height}px
      </div>
    </main>
  );
}

function ElementView({
  element,
  transform,
  selected,
  pathPoints,
  onPointerDown,
}: {
  element: PosterElement;
  transform: ElementTransform;
  selected: boolean;
  pathPoints?: Point[];
  onPointerDown: (event: React.PointerEvent<SVGElement>) => void;
}) {
  const common = {
    opacity: transform.opacity,
    transform: `translate(${transform.x} ${transform.y}) rotate(${transform.rotation} ${transform.width / 2} ${transform.height / 2})`,
    onPointerDown,
    className: selected ? 'canvas-element is-selected' : 'canvas-element',
  };

  if (element.type === 'text') {
    const anchor =
      element.textAlign === 'center' ? 'middle' : element.textAlign === 'right' ? 'end' : 'start';
    const x =
      element.textAlign === 'center'
        ? transform.width / 2
        : element.textAlign === 'right'
          ? transform.width
          : 0;
    return (
      <g {...common}>
        <text
          x={x}
          y={0}
          dominantBaseline="hanging"
          textAnchor={anchor}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          fontFamily={element.fontFamily}
          fontSize={element.fontSize}
          fontWeight={element.fontWeight}
          fontStyle={element.fontStyle}
          letterSpacing={element.letterSpacing}
        >
          {element.text}
        </text>
      </g>
    );
  }
  if (element.type === 'rect') {
    return (
      <rect
        {...common}
        width={transform.width}
        height={transform.height}
        rx={element.cornerRadius}
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
      />
    );
  }
  if (element.type === 'ellipse') {
    return (
      <ellipse
        {...common}
        cx={transform.width / 2}
        cy={transform.height / 2}
        rx={transform.width / 2}
        ry={transform.height / 2}
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={element.strokeWidth}
      />
    );
  }
  if (element.type === 'path') {
    const viewBox = pathViewBox(element);
    return (
      <g {...common}>
        <path
          d={pathData(pathPoints ?? element.points, element.closed, viewBox)}
          transform={`scale(${transform.width / viewBox.width} ${transform.height / viewBox.height})`}
          fill={element.closed ? element.fill : 'none'}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  }
  if (element.type === 'image') {
    return (
      <g {...common}>
        <defs>
          <clipPath id={`clip-${element.id}`}>
            <rect width={transform.width} height={transform.height} />
          </clipPath>
        </defs>
        <image
          href={element.src}
          width={transform.width}
          height={transform.height}
          preserveAspectRatio={
            element.fit === 'cover'
              ? 'xMidYMid slice'
              : element.fit === 'contain'
                ? 'xMidYMid meet'
                : 'none'
          }
          clipPath={`url(#clip-${element.id})`}
        />
      </g>
    );
  }

  if (element.type !== 'three-text') return null;
  if (element.previewSrc) {
    return (
      <image
        {...common}
        href={element.previewSrc}
        width={transform.width}
        height={transform.height}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }
  return (
    <g {...common} filter="url(#three-text-shadow)">
      {Array.from({ length: 7 }, (_, index) => (
        <text
          key={index}
          x={index * 2}
          y={transform.height * 0.55 + index * 2}
          dominantBaseline="middle"
          fill={index === 0 ? element.fill : '#5b461d'}
          fontFamily={element.fontFamily}
          fontWeight={900}
          fontSize={Math.min(transform.height * 0.56, transform.width / Math.max(element.text.length * 0.58, 1))}
        >
          {element.text}
        </text>
      ))}
    </g>
  );
}

function SelectionBox({
  element,
  transform,
  onResizePointerDown,
  onPathNodePointerDown,
  pathPoints,
}: {
  element: PosterElement;
  transform: ElementTransform;
  onResizePointerDown: (event: React.PointerEvent<SVGElement>) => void;
  onPathNodePointerDown?: (
    event: React.PointerEvent<SVGElement>,
    nodeIndex: number,
  ) => void;
  pathPoints?: Point[];
}) {
  const viewBox = element.type === 'path' ? pathViewBox(element) : undefined;
  return (
    <g
      pointerEvents="none"
      transform={`translate(${transform.x} ${transform.y}) rotate(${transform.rotation} ${transform.width / 2} ${transform.height / 2})`}
    >
      <rect
        className="selection-outline"
        width={transform.width}
        height={transform.height}
        fill="none"
      />
      {!element.locked && (
        <rect
          className="resize-handle"
          x={transform.width - 10}
          y={transform.height - 10}
          width={20}
          height={20}
          rx={4}
          pointerEvents="all"
          onPointerDown={onResizePointerDown}
        />
      )}
      {element.type === 'path' &&
        viewBox &&
        onPathNodePointerDown &&
        (pathPoints ?? element.points).map((point, nodeIndex) => (
          <circle
            key={`${element.id}-node-${nodeIndex}`}
            className="path-node"
            cx={((point.x - viewBox.x) / viewBox.width) * transform.width}
            cy={((point.y - viewBox.y) / viewBox.height) * transform.height}
            r={9}
            pointerEvents="all"
            onPointerDown={(event) => onPathNodePointerDown(event, nodeIndex)}
          />
        ))}
    </g>
  );
}

function pickTransform(element: PosterElement): ElementTransform {
  const { x, y, width, height, rotation, opacity } = element;
  return { x, y, width, height, rotation, opacity };
}

function pathData(
  points: Point[],
  closed: boolean,
  viewBox: PathViewBox,
): string {
  const [first, ...rest] = points;
  if (!first) return '';
  const local = (point: Point) => ({
    x: point.x - viewBox.x,
    y: point.y - viewBox.y,
  });
  const firstLocal = local(first);
  const parts = [`M ${firstLocal.x} ${firstLocal.y}`];
  rest.forEach((point, index) => {
    const previous = points[index];
    const pointLocal = local(point);
    if (previous?.out || point.in) {
      const out = previous?.out ?? previous ?? point;
      const incoming = point.in ?? point;
      const outLocal = local(out);
      const incomingLocal = local(incoming);
      parts.push(
        `C ${outLocal.x} ${outLocal.y} ${incomingLocal.x} ${incomingLocal.y} ${pointLocal.x} ${pointLocal.y}`,
      );
    } else {
      parts.push(`L ${pointLocal.x} ${pointLocal.y}`);
    }
  });
  if (closed) parts.push('Z');
  return parts.join(' ');
}

function pathViewBox(element: PathElement): PathViewBox {
  if (element.viewBox) return element.viewBox;
  const xs = element.points.map((point) => point.x);
  const ys = element.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y),
  };
}
