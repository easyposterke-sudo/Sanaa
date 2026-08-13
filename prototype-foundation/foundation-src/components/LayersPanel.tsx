import { commandMeta } from '../domain/commands';
import { duplicateElement } from '../domain/factories';
import { editorStore, useEditor } from '../editor/editorStore';

export function LayersPanel() {
  const elements = useEditor((state) => state.document.elements);
  const selectedIds = useEditor((state) => state.selectedIds);
  const selected = new Set(selectedIds);

  const moveLayer = (id: string, direction: -1 | 1) => {
    const orderedIds = elements.map((element) => element.id);
    const index = orderedIds.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) return;
    [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex]!, orderedIds[index]!];
    editorStore.dispatch({
      type: 'layer.reorder',
      orderedIds,
      meta: commandMeta('property-panel', direction > 0 ? 'Bring layer forward' : 'Send layer backward'),
    });
  };

  const duplicateSelected = () => {
    const copies = elements
      .filter((element) => selected.has(element.id))
      .map(duplicateElement);
    if (copies.length === 0) return;
    editorStore.dispatch({
      type: 'element.duplicate',
      copies,
      meta: commandMeta('toolbar', 'Duplicate selected elements'),
    });
    editorStore.dispatch({
      type: 'selection.set',
      ids: copies.map((copy) => copy.id),
      meta: commandMeta('toolbar'),
    });
  };

  const removeSelected = () => {
    if (selectedIds.length === 0) return;
    editorStore.dispatch({
      type: 'element.remove',
      ids: selectedIds,
      meta: commandMeta('toolbar', 'Delete selected elements'),
    });
    editorStore.dispatch({
      type: 'selection.set',
      ids: [],
      meta: commandMeta('toolbar'),
    });
  };

  return (
    <section className="panel layers-panel" aria-label="Layers">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Composition</p>
          <h2>Layers</h2>
        </div>
        <span className="count-pill">{elements.length}</span>
      </div>
      <div className="layer-list">
        {[...elements].reverse().map((element) => (
          <button
            type="button"
            key={element.id}
            className={`layer-row${selected.has(element.id) ? ' is-selected' : ''}`}
            onClick={(event) => {
              const ids = event.shiftKey
                ? selected.has(element.id)
                  ? selectedIds.filter((id) => id !== element.id)
                  : [...selectedIds, element.id]
                : [element.id];
              editorStore.dispatch({
                type: 'selection.set',
                ids,
                meta: commandMeta('pointer'),
              });
            }}
          >
            <span className="layer-kind">{kindIcon(element.type)}</span>
            <span className="layer-name">{element.name}</span>
            {element.locked && <span aria-label="Locked">⌁</span>}
          </button>
        ))}
        {elements.length === 0 && (
          <div className="empty-state">
            Add text, shapes, paths, images, or 3D text to begin.
          </div>
        )}
      </div>
      <div className="layer-actions">
        <button type="button" onClick={duplicateSelected} disabled={selectedIds.length === 0}>
          Duplicate
        </button>
        <button type="button" onClick={removeSelected} disabled={selectedIds.length === 0}>
          Delete
        </button>
        {selectedIds.length === 1 && (
          <>
            <button type="button" title="Send backward" onClick={() => moveLayer(selectedIds[0]!, -1)}>
              ↓
            </button>
            <button type="button" title="Bring forward" onClick={() => moveLayer(selectedIds[0]!, 1)}>
              ↑
            </button>
          </>
        )}
      </div>
    </section>
  );
}
function kindIcon(type: string): string {
  switch (type) {
    case 'text':
      return 'T';
    case 'three-text':
      return '3D';
    case 'path':
      return '⌁';
    case 'image':
      return '▧';
    case 'ellipse':
      return '○';
    default:
      return '□';
  }
}
