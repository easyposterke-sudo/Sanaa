import { memo, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { EditorStatePatch } from '../../core/types';
import { MAX_TEXT_LAYERS, isShapeLayer } from '../../core/types';
import { getCustomFont } from '../../core/font/customFontCache';
import { BUILT_IN_3D_FONT_OPTIONS } from '../../core/font/builtIn3DFonts';
import { useEditorStore } from '../../store/editorStore';
import { PRESETS } from '../../data/presets';
import {
  TWO_LAYER_3D_TEXT_RECIPE_ID,
  compileTwoLayer3DTextState,
} from '../../poster/ai/twoLayer3DTextSkill';
import { ThemeToggle } from '../ThemeToggle';

export const LeftSidebar = memo(function LeftSidebar({
  force3dLayerUI = false,
  onPosterEditorClick,
}: {
  force3dLayerUI?: boolean;
  onPosterEditorClick?: () => void;
}) {
  const location = useLocation();
  const is3dRoute = force3dLayerUI || location.pathname === '/3d';
  const renderEngine = useEditorStore((s) => s.renderEngine);
  const textLayers = useEditorStore((s) => s.textLayers ?? []);
  const activeTextLayerId = useEditorStore((s) => s.activeTextLayerId);
  const selectedCustomFontId = useEditorStore((s) => s.selectedCustomFontId);
  const addTextLayer = useEditorStore((s) => s.addTextLayer);
  const addShapeLayer = useEditorStore((s) => s.addShapeLayer);
  const duplicateTextLayer = useEditorStore((s) => s.duplicateTextLayer);
  const removeTextLayer = useEditorStore((s) => s.removeTextLayer);
  const setActiveTextLayerId = useEditorStore((s) => s.setActiveTextLayerId);
  const setState = useEditorStore((s) => s.setState);
  const currentText = useEditorStore((s) => s.text);
  const [learnedStyleText, setLearnedStyleText] = useState(
    () => useEditorStore.getState().text.content || '3D Text'
  );
  const [learnedStyleFont, setLearnedStyleFont] = useState('Times New Roman, serif');
  const [useSelectedCustomFont, setUseSelectedCustomFont] = useState(false);
  const [learnedFaceColor, setLearnedFaceColor] = useState('#ffffff');
  const [learnedExtrusionColor, setLearnedExtrusionColor] = useState('#000000');
  const [learnedStyleError, setLearnedStyleError] = useState<string | null>(null);

  useEffect(() => {
    const rear = textLayers.find(
      (layer) =>
        !isShapeLayer(layer) && layer.id === `${TWO_LAYER_3D_TEXT_RECIPE_ID}:rear-shell`
    );
    const front = textLayers.find(
      (layer) =>
        !isShapeLayer(layer) && layer.id === `${TWO_LAYER_3D_TEXT_RECIPE_ID}:front-face`
    );
    if (!rear || !front || isShapeLayer(rear) || isShapeLayer(front)) return;
    setLearnedStyleText(front.text.content);
    setLearnedStyleFont(front.text.fontFamily);
    setLearnedFaceColor(front.frontColor ?? '#ffffff');
    setLearnedExtrusionColor(rear.extrusionColor ?? '#000000');
    setUseSelectedCustomFont(Boolean(front.selectedCustomFontId));
  }, [textLayers]);

  useEffect(() => {
    if (!selectedCustomFontId) setUseSelectedCustomFont(false);
  }, [selectedCustomFontId]);

  const handlePresetClick = (presetState: EditorStatePatch) => {
    setState(presetState);
  };

  const handleLearnedStyleApply = () => {
    try {
      if (
        useSelectedCustomFont &&
        (!selectedCustomFontId || !getCustomFont(selectedCustomFontId))
      ) {
        throw new Error('The selected uploaded font is not loaded yet. Choose or reload it first.');
      }
      const state = compileTwoLayer3DTextState({
        text: learnedStyleText.trim() || '3D Text',
        fontFamily: learnedStyleFont,
        customFontId: useSelectedCustomFont ? (selectedCustomFontId ?? null) : null,
        faceColor: learnedFaceColor,
        extrusionColor: learnedExtrusionColor,
      });
      setState(state);
      setLearnedStyleError(null);
    } catch (error) {
      setLearnedStyleError(
        error instanceof Error ? error.message : 'The learned style could not be applied.'
      );
    }
  };

  const loadCurrentTypography = () => {
    setLearnedStyleText(currentText.content || '3D Text');
    setLearnedStyleFont(currentText.fontFamily);
    setUseSelectedCustomFont(Boolean(selectedCustomFontId));
    setLearnedStyleError(null);
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Go to Home"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Link>
        {onPosterEditorClick ? (
          <button
            type="button"
            onClick={onPosterEditorClick}
            className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
          >
            Poster Editor →
          </button>
        ) : (
          <Link
            to="/poster"
            className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
          >
            Poster Editor →
          </Link>
        )}
      </div>
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Presets
        </h2>
        <select
          value=""
          onChange={(e) => {
            const name = e.target.value;
            if (!name) return;
            const preset = PRESETS.find((p) => p.name === name);
            if (preset) handlePresetClick(preset.state);
            e.target.value = '';
          }}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium transition-colors hover:border-zinc-300 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
        >
          <option value="">Choose a preset…</option>
          {PRESETS.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>
      </section>

      {is3dRoute && renderEngine === 'webgl' && (
        <section aria-labelledby="learned-two-layer-style-heading">
          <h2
            id="learned-two-layer-style-heading"
            className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            Learned 3D style
          </h2>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Build one title from an aligned face layer and a deep contrasting shell. Applying
            replaces the current 3D scene with the linked two-layer recipe.
          </p>
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200">
              Text
              <input
                type="text"
                value={learnedStyleText}
                maxLength={120}
                onChange={(event) => setLearnedStyleText(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <button
              type="button"
              onClick={loadCurrentTypography}
              className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Use current text and font
            </button>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200">
              Font
              <select
                value={learnedStyleFont}
                onChange={(event) => setLearnedStyleFont(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-800"
              >
                {BUILT_IN_3D_FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedCustomFontId && (
              <label className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={useSelectedCustomFont}
                  onChange={(event) => setUseSelectedCustomFont(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  Use selected uploaded font
                  <span className="block text-zinc-500 dark:text-zinc-400">
                    {getCustomFont(selectedCustomFontId)?.name ?? selectedCustomFontId}
                  </span>
                </span>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                Face
                <input
                  type="color"
                  value={learnedFaceColor}
                  onChange={(event) => setLearnedFaceColor(event.target.value)}
                  className="mt-1 h-9 w-full cursor-pointer rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </label>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                Shell
                <input
                  type="color"
                  value={learnedExtrusionColor}
                  onChange={(event) => setLearnedExtrusionColor(event.target.value)}
                  className="mt-1 h-9 w-full cursor-pointer rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-800"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleLearnedStyleApply}
              className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
            >
              Apply two-layer style
            </button>
            {learnedStyleError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {learnedStyleError}
              </p>
            )}
          </div>
        </section>
      )}

      {is3dRoute && renderEngine === 'webgl' && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            3D layers
          </h2>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            Stack text and extruded shapes in one scene (position in the right sidebar).
          </p>
          <ul className="mb-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900/50">
            {textLayers.map((layer) => (
              <li key={layer.id}>
                <button
                  type="button"
                  onClick={() => setActiveTextLayerId(layer.id)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                    layer.id === activeTextLayerId
                      ? 'bg-amber-100 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100'
                      : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  {isShapeLayer(layer) ? (
                    <span className="line-clamp-1 capitalize text-zinc-700 dark:text-zinc-200">
                      {layer.shape.kind} {layer.shape.width.toFixed(1)}×{layer.shape.height.toFixed(1)}
                    </span>
                  ) : (
                    <span className="line-clamp-1">{layer.text.content || '(empty)'}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={textLayers.length >= MAX_TEXT_LAYERS}
              onClick={() => addTextLayer()}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              Add text
            </button>
            <button
              type="button"
              disabled={textLayers.length >= MAX_TEXT_LAYERS}
              onClick={() => addShapeLayer()}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              Add shape
            </button>
            <button
              type="button"
              disabled={textLayers.length >= MAX_TEXT_LAYERS}
              onClick={() => duplicateTextLayer()}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              Duplicate
            </button>
            <button
              type="button"
              disabled={textLayers.length <= 1}
              onClick={() => {
                const cur = activeTextLayerId ?? textLayers[0]?.id;
                if (cur) removeTextLayer(cur);
              }}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/50"
            >
              Remove
            </button>
          </div>
          <p className="mt-1 text-[10px] text-zinc-400">
            Max {MAX_TEXT_LAYERS} layers
          </p>
        </section>
      )}

    </div>
  );
});
