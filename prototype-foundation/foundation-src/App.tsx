import { useRef, useState } from 'react';
import { commandMeta } from './domain/commands';
import { EditorCanvas } from './components/EditorCanvas';
import { LayersPanel } from './components/LayersPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { RecordingPanel } from './components/RecordingPanel';
import { Toolbar } from './components/Toolbar';
import {
  listCloudProjects,
  loadCloudProject,
  saveCloudProject,
} from './editor/cloudApi';
import {
  downloadProject,
  readProjectJson,
} from './editor/files';
import {
  exportPosterPng,
  exportPosterSvg,
  planBrowserExport,
} from './editor/export';
import { editorStore, useEditor } from './editor/editorStore';

type CloudProject = Awaited<ReturnType<typeof listCloudProjects>>[number];

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const document = useEditor((state) => state.document);
  const saveState = useEditor((state) => state.saveState);
  const dirty = useEditor((state) => state.dirty);
  const [notice, setNotice] = useState<string | null>(null);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const save = async () => {
    editorStore.setSaveState('saving');
    setNotice(null);
    try {
      await saveCloudProject(document);
      editorStore.setSaveState('saved');
      setNotice('Project saved to Cloudflare D1 + R2.');
    } catch (error) {
      editorStore.setSaveState('error');
      setNotice(error instanceof Error ? error.message : 'Cloud save failed.');
    }
  };

  const openCloud = async () => {
    setNotice('Loading cloud projects…');
    try {
      setCloudProjects(await listCloudProjects());
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load projects.');
    }
  };

  const loadProject = async (project: CloudProject) => {
    setNotice(`Opening ${project.title}…`);
    try {
      const loaded = await loadCloudProject(project.id);
      editorStore.importDocument(loaded);
      editorStore.setSaveState('saved');
      setCloudProjects(null);
      setNotice('Cloud project opened.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open project.');
    }
  };

  const runExport = async (kind: 'svg' | 1 | 2 | 4 | 8) => {
    const svg = window.document.querySelector<SVGSVGElement>('.poster-canvas');
    if (!svg) return;
    setExportOpen(false);
    const baseName = `${slug(document.title)}-${Date.now()}`;
    try {
      if (kind === 'svg') {
        exportPosterSvg(svg, `${baseName}.svg`);
      } else {
        setNotice(`Rendering ${kind}× PNG…`);
        await exportPosterPng(svg, {
          width: document.canvas.width,
          height: document.canvas.height,
          scale: kind,
          fileName: `${baseName}-${kind}x.png`,
        });
      }
      setNotice('Export downloaded.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Export failed.');
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <strong>EasyPoster</strong>
            <span>Cloud Studio</span>
          </div>
        </div>
        <div className="document-title">
          <input
            key={document.title}
            defaultValue={document.title}
            aria-label="Project title"
            onBlur={(event) => {
              if (event.target.value !== document.title) {
                editorStore.dispatch({
                  type: 'document.rename',
                  title: event.target.value,
                  meta: commandMeta('property-panel', 'Rename project'),
                });
              }
            }}
          />
          <span className={`save-indicator ${saveState}`}>
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'error'
                ? 'Save failed'
                : dirty
                  ? 'Unsaved'
                  : 'Saved'}
          </span>
        </div>
        <nav className="topbar-actions" aria-label="Project actions">
          <button type="button" onClick={() => editorStore.newDocument()}>
            New
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
          <button type="button" onClick={() => downloadProject(document)}>
            Download JSON
          </button>
          <button type="button" onClick={() => void openCloud()}>
            Open cloud
          </button>
          <button type="button" className="primary-button" onClick={() => void save()}>
            Save cloud
          </button>
          <div className="menu-wrap">
            <button
              type="button"
              className="accent-button"
              onClick={() => setExportOpen((open) => !open)}
            >
              Export
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button type="button" onClick={() => void runExport('svg')}>SVG vector</button>
                {[1, 2, 4, 8].map((scale) => {
                  const plan = planBrowserExport(
                    document.canvas.width,
                    document.canvas.height,
                    scale,
                  );
                  return (
                    <button
                      type="button"
                      key={scale}
                      disabled={!plan.allowed}
                      title={plan.reason}
                      onClick={() => void runExport(scale as 1 | 2 | 4 | 8)}
                    >
                      PNG {scale}×
                      {!plan.allowed && <small>Cloud renderer required</small>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void readProjectJson(file)
                .then((project) => {
                  editorStore.importDocument(project);
                  setNotice('Project imported exactly from JSON.');
                })
                .catch((error: unknown) =>
                  setNotice(error instanceof Error ? error.message : 'Import failed.'),
                );
            }
            event.target.value = '';
          }}
        />
      </header>
      <div className="editor-layout">
        <Toolbar />
        <div className="left-column">
          <LayersPanel />
          <RecordingPanel />
        </div>
        <EditorCanvas />
        <PropertiesPanel />
      </div>
      {notice && (
        <button type="button" className="notice" onClick={() => setNotice(null)}>
          {notice}
        </button>
      )}
      {cloudProjects && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCloudProjects(null)}>
          <section className="cloud-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">Cloudflare R2</p>
                <h2>Open a project</h2>
              </div>
              <button type="button" onClick={() => setCloudProjects(null)}>×</button>
            </div>
            <div className="cloud-project-list">
              {cloudProjects.map((project) => (
                <button type="button" key={project.id} onClick={() => void loadProject(project)}>
                  <strong>{project.title}</strong>
                  <span>{project.width} × {project.height} · {project.elementCount} layers</span>
                  <time>{new Date(project.updatedAt).toLocaleString()}</time>
                </button>
              ))}
              {cloudProjects.length === 0 && <div className="empty-state">No cloud projects yet.</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'poster';
}
