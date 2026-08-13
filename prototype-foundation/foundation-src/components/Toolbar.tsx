import { useRef } from 'react';
import { commandMeta } from '../domain/commands';
import {
  createImageElement,
  createShapeElement,
  createStarPath,
  createTextElement,
  createThreeTextElement,
} from '../domain/factories';
import type { PosterElement } from '../domain/document';
import { uploadCloudAsset } from '../editor/cloudApi';
import { editorStore, useEditor } from '../editor/editorStore';

export function Toolbar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canUndo = useEditor((state) => state.past.length > 0);
  const canRedo = useEditor((state) => state.future.length > 0);

  const add = (element: PosterElement, label: string) => {
    editorStore.dispatch({
      type: 'element.add',
      element,
      meta: commandMeta('toolbar', label),
    });
    editorStore.dispatch({
      type: 'selection.set',
      ids: [element.id],
      meta: commandMeta('toolbar'),
    });
  };

  const importImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Choose an image file.');
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error('Images must be 15 MB or smaller in this foundation build.');
    }
    try {
      const asset = await uploadCloudAsset(file);
      const element = createImageElement(asset.url, asset.fileName);
      element.assetId = asset.id;
      add(element, 'Upload image to R2');
    } catch {
      const src = await readFileAsDataUrl(file);
      add(createImageElement(src, file.name), 'Add local image fallback');
    }
  };

  return (
    <aside className="tool-rail" aria-label="Creation tools">
      <ToolButton icon="↖" label="Select" active />
      <div className="tool-divider" />
      <ToolButton icon="T" label="Text" onClick={() => add(createTextElement(), 'Add text')} />
      <ToolButton icon="□" label="Rectangle" onClick={() => add(createShapeElement('rect'), 'Add rectangle')} />
      <ToolButton icon="○" label="Ellipse" onClick={() => add(createShapeElement('ellipse'), 'Add ellipse')} />
      <ToolButton icon="★" label="Star path" onClick={() => add(createStarPath(), 'Add star path')} />
      <ToolButton icon="▧" label="Image" onClick={() => inputRef.current?.click()} />
      <ToolButton icon="3D" label="3D text" onClick={() => add(createThreeTextElement(), 'Add 3D text')} />
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importImage(file);
          event.target.value = '';
        }}
      />
      <div className="tool-spacer" />
      <ToolButton
        icon="↶"
        label="Undo"
        disabled={!canUndo}
        onClick={() =>
          editorStore.dispatch({ type: 'history.undo', meta: commandMeta('toolbar') })
        }
      />
      <ToolButton
        icon="↷"
        label="Redo"
        disabled={!canRedo}
        onClick={() =>
          editorStore.dispatch({ type: 'history.redo', meta: commandMeta('toolbar') })
        }
      />
    </aside>
  );
}

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`tool-button${active ? ' is-active' : ''}`}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="tool-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}
