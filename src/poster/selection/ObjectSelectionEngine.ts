import { Canvas, Rect, Path, ActiveSelection } from 'fabric';

export interface Point {
  x: number;
  y: number;
}

export class ObjectSelectionEngine {
  private canvas: Canvas;
  private isDragging: boolean = false;
  private startPoint: Point | null = null;
  private currentPath: Point[] = [];
  private onMarqueeUpdate: (path: Point[] | null) => void;
  private onSelectionComplete: (path: Point[], mode: string) => void;

  constructor(
    canvas: Canvas,
    onMarqueeUpdate: (path: Point[] | null) => void,
    onSelectionComplete: (path: Point[], mode: string) => void
  ) {
    this.canvas = canvas;
    this.onMarqueeUpdate = onMarqueeUpdate;
    this.onSelectionComplete = onSelectionComplete;
    this.bindEvents();
  }

  private bindEvents() {
    this.canvas.on('mouse:down', this.handleMouseDown);
    this.canvas.on('mouse:move', this.handleMouseMove);
    this.canvas.on('mouse:up', this.handleMouseUp);
  }

  public unbindEvents() {
    this.canvas.off('mouse:down', this.handleMouseDown);
    this.canvas.off('mouse:move', this.handleMouseMove);
    this.canvas.off('mouse:up', this.handleMouseUp);
  }

  private handleMouseDown = (opt: any) => {
    const { activeTool, marqueeLocalPath: marqueePath } = (this.canvas as any).posterStore?.getState() || {};
    if (activeTool !== 'object-selection') return;

    const pointer = this.canvas.getScenePoint(opt.e);

    // If clicking inside existing marquee, maybe move it?
    // For now, let's just start a new selection.

    this.isDragging = true;
    this.startPoint = { x: pointer.x, y: pointer.y };
    this.currentPath = [this.startPoint];
    this.onMarqueeUpdate(this.currentPath);
  };

  private handleMouseMove = (opt: any) => {
    if (!this.isDragging || !this.startPoint) return;

    const pointer = this.canvas.getScenePoint(opt.e);
    const { objectSelectionMode } = (this.canvas as any).posterStore?.getState() || {};

    if (objectSelectionMode === 'rectangle' || objectSelectionMode === 'ai') {
      this.currentPath = [
        { x: this.startPoint.x, y: this.startPoint.y },
        { x: pointer.x, y: this.startPoint.y },
        { x: pointer.x, y: pointer.y },
        { x: this.startPoint.x, y: pointer.y },
      ];
    } else if (objectSelectionMode === 'lasso') {
      this.currentPath.push({ x: pointer.x, y: pointer.y });
    } else if (objectSelectionMode === 'magnetic') {
      const snappedPoint = (this.canvas as any).detectionEngine?.findNearestEdge(pointer) || pointer;
      this.currentPath.push(snappedPoint);
    }

    this.onMarqueeUpdate(this.currentPath);
  };

  private handleMouseUp = (opt: any) => {
    if (!this.isDragging) return;
    this.isDragging = false;

    const { objectSelectionMode } = (this.canvas as any).posterStore?.getState() || {};
    const finalPath = [...this.currentPath];

    if (finalPath.length > 2) {
      this.onSelectionComplete(finalPath, objectSelectionMode);
    } else {
      this.onMarqueeUpdate(null);
    }

    this.startPoint = null;
    this.currentPath = [];
  };
}
