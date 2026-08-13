import { useState } from 'react';
import { commandMeta } from '../domain/commands';
import type { PosterElement, ThreeTextElement } from '../domain/document';
import { editorStore, useEditor } from '../editor/editorStore';
import { renderThreeTextPreview } from '../three/renderThreeText';

export function PropertiesPanel() {
  const document = useEditor((state) => state.document);
  const selectedIds = useEditor((state) => state.selectedIds);
  const selected =
    selectedIds.length === 1
      ? document.elements.find((element) => element.id === selectedIds[0])
      : undefined;

  if (!selected) {
    return (
      <section className="panel properties-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Inspector</p>
            <h2>Properties</h2>
          </div>
        </div>
        <CanvasProperties />
      </section>
    );
  }

  const update = (patch: Partial<PosterElement>, label: string) => {
    editorStore.dispatch({
      type: 'element.update',
      id: selected.id,
      patch,
      meta: commandMeta('property-panel', label),
    });
  };

  return (
    <section className="panel properties-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Inspector</p>
          <h2>{selected.name}</h2>
        </div>
        <span className="type-pill">{selected.type}</span>
      </div>
      <div className="property-grid two-columns">
        <NumberField label="X" value={selected.x} onCommit={(x) => update({ x }, 'Set X position')} />
        <NumberField label="Y" value={selected.y} onCommit={(y) => update({ y }, 'Set Y position')} />
        <NumberField label="Width" value={selected.width} min={1} onCommit={(width) => update({ width }, 'Set width')} />
        <NumberField label="Height" value={selected.height} min={1} onCommit={(height) => update({ height }, 'Set height')} />
        <NumberField label="Rotation" value={selected.rotation} onCommit={(rotation) => update({ rotation }, 'Rotate element')} />
        <NumberField
          label="Opacity"
          value={Math.round(selected.opacity * 100)}
          min={0}
          max={100}
          onCommit={(opacity) => update({ opacity: opacity / 100 }, 'Set opacity')}
        />
      </div>
      <div className="property-row toggles">
        <label>
          <input
            type="checkbox"
            checked={selected.locked}
            onChange={(event) => update({ locked: event.target.checked }, 'Toggle lock')}
          />
          Locked
        </label>
        <label>
          <input
            type="checkbox"
            checked={selected.hidden}
            onChange={(event) => update({ hidden: event.target.checked }, 'Toggle visibility')}
          />
          Hidden
        </label>
      </div>
      <TypeProperties element={selected} update={update} />
    </section>
  );
}

function CanvasProperties() {
  const canvas = useEditor((state) => state.document.canvas);
  const dispatch = (patch: Partial<typeof canvas>, label: string) =>
    editorStore.dispatch({
      type: 'canvas.update',
      patch,
      meta: commandMeta('property-panel', label),
    });
  return (
    <>
      <p className="muted-copy">No element selected. Editing the poster canvas.</p>
      <div className="property-grid two-columns">
        <NumberField label="Width" value={canvas.width} min={64} onCommit={(width) => dispatch({ width }, 'Set canvas width')} />
        <NumberField label="Height" value={canvas.height} min={64} onCommit={(height) => dispatch({ height }, 'Set canvas height')} />
      </div>
      <ColorField label="Background" value={canvas.background} onCommit={(background) => dispatch({ background }, 'Set canvas background')} />
    </>
  );
}

function TypeProperties({
  element,
  update,
}: {
  element: PosterElement;
  update: (patch: Partial<PosterElement>, label: string) => void;
}) {
  if (element.type === 'text') {
    return (
      <div className="property-section">
        <h3>Typography</h3>
        <TextField label="Text" value={element.text} multiline onCommit={(text) => update({ text }, 'Edit text')} />
        <TextField label="Font family" value={element.fontFamily} onCommit={(fontFamily) => update({ fontFamily }, 'Set font family')} />
        <div className="property-grid two-columns">
          <NumberField label="Font size" value={element.fontSize} min={1} onCommit={(fontSize) => update({ fontSize }, 'Set font size')} />
          <NumberField label="Weight" value={element.fontWeight} min={100} max={900} step={100} onCommit={(fontWeight) => update({ fontWeight }, 'Set font weight')} />
          <NumberField label="Tracking" value={element.letterSpacing} onCommit={(letterSpacing) => update({ letterSpacing }, 'Set letter spacing')} />
          <NumberField label="Line height" value={element.lineHeight} min={0.1} step={0.05} onCommit={(lineHeight) => update({ lineHeight }, 'Set line height')} />
        </div>
        <ColorField label="Text color" value={element.fill} onCommit={(fill) => update({ fill }, 'Set text color')} />
      </div>
    );
  }
  if (element.type === 'rect' || element.type === 'ellipse') {
    return (
      <div className="property-section">
        <h3>Appearance</h3>
        <ColorField label="Fill" value={element.fill} onCommit={(fill) => update({ fill }, 'Set shape fill')} />
        <ColorField label="Stroke" value={element.stroke} onCommit={(stroke) => update({ stroke }, 'Set shape stroke')} />
        <NumberField label="Stroke width" value={element.strokeWidth} min={0} onCommit={(strokeWidth) => update({ strokeWidth }, 'Set stroke width')} />
        {element.type === 'rect' && (
          <NumberField label="Corner radius" value={element.cornerRadius} min={0} onCommit={(cornerRadius) => update({ cornerRadius }, 'Set corner radius')} />
        )}
      </div>
    );
  }
  if (element.type === 'path') {
    return (
      <div className="property-section">
        <h3>Path</h3>
        <p className="muted-copy">
          {element.points.length} nodes · {element.closed ? 'closed' : 'open'}.
          Drag the visible canvas nodes to edit the path.
        </p>
        <ColorField label="Fill" value={element.fill} onCommit={(fill) => update({ fill }, 'Set path fill')} />
        <ColorField label="Stroke" value={element.stroke} onCommit={(stroke) => update({ stroke }, 'Set path stroke')} />
        <NumberField label="Stroke width" value={element.strokeWidth} min={0} onCommit={(strokeWidth) => update({ strokeWidth }, 'Set path stroke width')} />
      </div>
    );
  }
  if (element.type === 'image') {
    return (
      <div className="property-section">
        <h3>Image</h3>
        <label className="field">
          <span>Fit</span>
          <select value={element.fit} onChange={(event) => update({ fit: event.target.value as typeof element.fit }, 'Set image fit')}>
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="fill">Stretch</option>
          </select>
        </label>
      </div>
    );
  }
  if (element.type !== 'three-text') return null;
  return <ThreeTextProperties element={element} update={update} />;
}

function ThreeTextProperties({
  element,
  update,
}: {
  element: ThreeTextElement;
  update: (patch: Partial<PosterElement>, label: string) => void;
}) {
  const [renderState, setRenderState] = useState<'idle' | 'rendering' | 'error'>('idle');
  const renderPreview = async () => {
    setRenderState('rendering');
    try {
      const previewSrc = await renderThreeTextPreview(element);
      update({ previewSrc }, 'Render 3D text preview');
      setRenderState('idle');
    } catch {
      setRenderState('error');
    }
  };

  return (
    <div className="property-section">
      <h3>3D text recipe</h3>
      <TextField label="Text" value={element.text} onCommit={(text) => update({ text }, 'Edit 3D text')} />
      <ColorField label="Material color" value={element.fill} onCommit={(fill) => update({ fill }, 'Set 3D material color')} />
      <div className="property-grid two-columns">
        <NumberField label="Depth" value={element.depth} min={1} onCommit={(depth) => update({ depth }, 'Set 3D depth')} />
        <NumberField label="Bevel" value={element.bevelSize} min={0} onCommit={(bevelSize) => update({ bevelSize }, 'Set 3D bevel')} />
      </div>
      <label className="field">
        <span>Environment</span>
        <select
          value={element.environment}
          onChange={(event) =>
            update(
              { environment: event.target.value as ThreeTextElement['environment'] },
              'Set 3D environment',
            )
          }
        >
          <option value="golden">Golden</option>
          <option value="silver">Silver</option>
          <option value="pink">Pink</option>
          <option value="blue-purple">Blue purple</option>
          <option value="light-blue">Light blue</option>
        </select>
      </label>
      <button
        type="button"
        className="render-three-button"
        disabled={renderState === 'rendering'}
        onClick={() => void renderPreview()}
      >
        {renderState === 'rendering' ? 'Rendering…' : 'Render 3D preview'}
      </button>
      {renderState === 'error' && (
        <p className="field-error">The browser could not initialize the 3D renderer.</p>
      )}
      <p className="muted-copy">
        The editable recipe and rendered transparent preview are both preserved
        in project JSON.
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        key={value}
        type="number"
        defaultValue={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  multiline,
  onCommit,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const props = {
    defaultValue: value,
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.target.value !== value) onCommit(event.target.value);
    },
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea key={value} {...props} rows={3} />
      ) : (
        <input key={value} {...props} />
      )}
    </label>
  );
}

function ColorField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const safeColor = /^#[\da-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <label className="field color-field">
      <span>{label}</span>
      <span className="color-input-row">
        <input type="color" value={safeColor} onChange={(event) => onCommit(event.target.value)} />
        <input
          key={value}
          defaultValue={value}
          onBlur={(event) => {
            if (event.target.value !== value) onCommit(event.target.value);
          }}
        />
      </span>
    </label>
  );
}
