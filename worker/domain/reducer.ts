import {
  cloneDocument,
  elementById,
  type PosterDocument,
  type PosterElement,
} from './document';
import type { DocumentCommand, EditorCommand } from './commands';

export function applyDocumentCommand(
  current: PosterDocument,
  command: DocumentCommand,
): PosterDocument {
  if (command.type === 'document.replace') {
    return cloneDocument(command.document);
  }

  const document = cloneDocument(current);
  document.updatedAt = command.meta.timestamp;

  switch (command.type) {
    case 'document.rename':
      document.title = command.title.trim() || 'Untitled poster';
      break;
    case 'canvas.update':
      document.canvas = { ...document.canvas, ...command.patch };
      break;
    case 'element.add': {
      const index = Math.min(
        Math.max(command.index ?? document.elements.length, 0),
        document.elements.length,
      );
      document.elements.splice(index, 0, cloneElement(command.element));
      break;
    }
    case 'element.update':
      document.elements = document.elements.map((element) =>
        element.id === command.id
          ? ({ ...element, ...command.patch, id: element.id, type: element.type } as PosterElement)
          : element,
      );
      break;
    case 'element.transform':
      document.elements = document.elements.map((element) =>
        element.id === command.id ? { ...element, ...command.transform } : element,
      );
      break;
    case 'element.remove': {
      const removed = new Set(command.ids);
      document.elements = document.elements.filter((element) => !removed.has(element.id));
      break;
    }
    case 'element.duplicate': {
      document.elements.push(...command.copies.map(cloneElement));
      break;
    }
    case 'layer.reorder': {
      const byId = new Map(document.elements.map((element) => [element.id, element]));
      if (
        command.orderedIds.length !== document.elements.length ||
        new Set(command.orderedIds).size !== command.orderedIds.length ||
        command.orderedIds.some((id) => !byId.has(id))
      ) {
        throw new Error('Layer order must include every element exactly once.');
      }
      document.elements = command.orderedIds.map((id) => byId.get(id)!);
      break;
    }
    case 'path.replace-points': {
      const target = elementById(document, command.id);
      if (!target || target.type !== 'path') {
        throw new Error('Path command target no longer exists.');
      }
      target.points = structuredClone(command.points);
      target.closed = command.closed;
      break;
    }
  }

  return document;
}

export function applyCommandSequence(
  initial: PosterDocument,
  commands: EditorCommand[],
): PosterDocument {
  let document = cloneDocument(initial);
  const past: PosterDocument[] = [];
  const future: PosterDocument[] = [];

  for (const command of commands) {
    if (command.type === 'history.undo') {
      const previous = past.pop();
      if (previous) {
        future.push(document);
        document = previous;
      }
      continue;
    }
    if (command.type === 'history.redo') {
      const next = future.pop();
      if (next) {
        past.push(document);
        document = next;
      }
      continue;
    }
    if (
      command.type === 'selection.set' ||
      command.type === 'tool.set'
    ) {
      continue;
    }
    past.push(document);
    future.length = 0;
    document = applyDocumentCommand(document, command);
  }

  return document;
}

function cloneElement(element: PosterElement): PosterElement {
  return structuredClone(element);
}
