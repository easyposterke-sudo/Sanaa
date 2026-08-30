import { useState } from 'react';
import { applyTemplateTheme } from '../ai/applyTemplateTheme';
import { applyTypographyMood } from '../ai/applyTypographyMood';
import type { AIPosterSession } from '../ai/aiPosterSession';
import { findPosterTemplateById, getAllPosterTemplates } from '../posterTemplateList';
import { fetchPosterTemplateById } from '../services/posterTemplatesApi';
import { requestPosterAssistant } from '../services/posterAssistantApi';
import { requestTemplatePoster } from '../services/templatePosterApi';
import { usePosterStore } from '../store/posterStore';
import { instantiateTemplate } from '../templateMerge';
import type { PosterTemplateFieldBinding } from '../templateTypes';
import type { PosterProject } from '../types';
import { buildTemplatePosterCatalogFields } from '../ai/templateFieldCatalog';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface AIPosterAssistantProps {
  open: boolean;
  session: AIPosterSession;
  onClose: () => void;
  onApply: (
    generated: { project: PosterProject; fieldBindings: PosterTemplateFieldBinding[] },
    session: AIPosterSession,
  ) => void;
}

export function AIPosterAssistant({ open, session, onClose, onApply }: AIPosterAssistantProps) {
  useModalScrollLock(open);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    const prompt = instruction.trim();
    if (prompt.length < 3) {
      setError('Describe the change you want me to make.');
      return;
    }
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const action = await requestPosterAssistant({
        instruction: prompt,
        brief: session.brief,
        currentThemeColor: session.themeColor,
      });
      const nextTheme = action.themeColor ?? session.themeColor;
      const nextMood = action.typographyMood ?? session.typographyMood;
      let nextSession: AIPosterSession = {
        ...session,
        themeColor: nextTheme,
        typographyMood: nextMood,
      };
      let generated: { project: PosterProject; fieldBindings: PosterTemplateFieldBinding[] };

      if (action.chooseAnotherDesign) {
        const templates = getAllPosterTemplates().filter(
          (template) =>
            (template.fields?.length ?? 0) > 0 &&
            (!session.categoryId || template.category === session.categoryId),
        );
        if (templates.length === 0) throw new Error('No fillable templates are available.');
        const excludedTemplateIds = Array.from(
          new Set([...session.excludedTemplateIds, session.currentTemplateId]),
        );
        const revisedBrief = `${session.brief}\nDesign revision: ${prompt}`.slice(0, 4_000);
        const response = await requestTemplatePoster({
          brief: revisedBrief,
          themeColor: nextTheme,
          images: session.images.map((image, index) => ({
            index,
            name: image.name,
            role: image.role,
          })),
          templates: templates.slice(0, 100).map((template) => ({
            id: template.id,
            name: template.name,
            category: template.category,
            description: template.description ?? '',
            fields: buildTemplatePosterCatalogFields(template),
          })),
          excludedTemplateIds,
        });
        const selectedTemplate =
          findPosterTemplateById(response.selection.templateId) ??
          (await fetchPosterTemplateById(response.selection.templateId));
        const values: Record<string, string> = {};
        for (const field of selectedTemplate.fields ?? []) {
          if ((field.kind ?? 'text') === 'text') values[field.key] = '';
        }
        for (const field of response.selection.fields) {
          if (field.imageIndex !== null) {
            const image = session.images[field.imageIndex];
            if (image) values[field.key] = image.dataUrl;
          } else if (field.value !== null) {
            values[field.key] = field.value;
          }
        }
        generated = await instantiateTemplate(selectedTemplate, values, {
          clearMissingTextFields: true,
        });
        nextSession = {
          ...nextSession,
          brief: revisedBrief,
          currentTemplateId: response.selection.templateId,
          excludedTemplateIds: Array.from(
            new Set([...excludedTemplateIds, response.selection.templateId]),
          ),
        };
      } else {
        generated = {
          project: usePosterStore.getState().getProject(),
          fieldBindings: usePosterStore.getState().getFieldBindings() ?? [],
        };
      }

      let project = generated.project;
      if (action.themeColor) project = applyTemplateTheme(project, action.themeColor);
      else if (action.chooseAnotherDesign && nextTheme) project = applyTemplateTheme(project, nextTheme);
      if (nextMood && (action.typographyMood || action.chooseAnotherDesign)) {
        project = applyTypographyMood(project, nextMood);
      }
      onApply({ ...generated, project }, nextSession);
      setReply(action.reply);
      setInstruction('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The assistant could not make that change.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center overflow-hidden overscroll-none bg-black/45 p-2 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-assistant-title"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl dark:border-emerald-900 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 dark:border-zinc-700">
          <div className="min-w-0">
            <h2 id="poster-assistant-title" className="text-lg font-semibold text-zinc-900 dark:text-white">
              AI design assistant
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Ask for a theme color, a typography mood, or a completely different design.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 sm:px-3 sm:py-2 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {['Make the theme blue', 'Use playful fonts', 'Make it official and crisp', 'Find another design'].map((example) => (
              <button
                key={example}
                type="button"
                disabled={busy}
                onClick={() => setInstruction(example)}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-zinc-600 hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                {example}
              </button>
            ))}
          </div>
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={4}
            maxLength={1_000}
            placeholder="Example: Make the theme deep blue and use a more official font style."
            className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
          {reply && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              {reply}
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
        </div>
        <div className="grid shrink-0 gap-2 border-t border-zinc-200 p-3 sm:flex sm:justify-end sm:px-5 sm:py-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || instruction.trim().length < 3}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-5"
          >
            {busy ? 'Working on your poster…' : 'Make this change'}
          </button>
        </div>
      </div>
    </div>
  );
}
