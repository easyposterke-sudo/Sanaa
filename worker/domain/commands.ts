import type {
  CanvasDefinition,
  ElementTransform,
  Point,
  PosterDocument,
  PosterElement,
} from './document';

export type CommandSource = 'pointer' | 'keyboard' | 'toolbar' | 'property-panel' | 'import';

export type CommandMeta = {
  commandId: string;
  timestamp: string;
  source: CommandSource;
  label?: string;
};

type WithMeta<T> = T & { meta: CommandMeta };

export type EditorCommand =
  | WithMeta<{ type: 'document.replace'; document: PosterDocument }>
  | WithMeta<{ type: 'document.rename'; title: string }>
  | WithMeta<{ type: 'canvas.update'; patch: Partial<CanvasDefinition> }>
  | WithMeta<{ type: 'element.add'; element: PosterElement; index?: number }>
  | WithMeta<{ type: 'element.update'; id: string; patch: Partial<PosterElement> }>
  | WithMeta<{ type: 'element.transform'; id: string; transform: Partial<ElementTransform> }>
  | WithMeta<{ type: 'element.remove'; ids: string[] }>
  | WithMeta<{ type: 'element.duplicate'; copies: PosterElement[] }>
  | WithMeta<{ type: 'layer.reorder'; orderedIds: string[] }>
  | WithMeta<{ type: 'path.replace-points'; id: string; points: Point[]; closed: boolean }>
  | WithMeta<{ type: 'selection.set'; ids: string[] }>
  | WithMeta<{ type: 'tool.set'; tool: EditorTool }>
  | WithMeta<{ type: 'history.undo' }>
  | WithMeta<{ type: 'history.redo' }>;

export type DocumentCommand = Exclude<
  EditorCommand,
  { type: 'selection.set' | 'tool.set' | 'history.undo' | 'history.redo' }
>;

export type EditorTool = 'select' | 'text' | 'shape' | 'path' | 'image' | 'three-text' | 'hand';

export function commandMeta(
  source: CommandSource,
  label?: string,
): CommandMeta {
  return {
    commandId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    label,
  };
}

export function isDocumentCommand(command: EditorCommand): command is DocumentCommand {
  return ![
    'selection.set',
    'tool.set',
    'history.undo',
    'history.redo',
  ].includes(command.type);
}
