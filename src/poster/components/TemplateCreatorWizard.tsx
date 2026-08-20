import { useState } from 'react';
import type { PosterReconstructionSource } from '../../../shared/ai/posterReconstruction';
import { compilePosterReconstruction, type CompiledPosterReconstruction } from '../ai/compilePosterReconstruction';
import { prepareTemplateReference, type PreparedPosterImage } from '../ai/preparePosterImage';
import {
  PosterReconstructionError,
  requestPosterReconstruction,
} from '../services/posterReconstructionApi';

interface TemplateCreatorWizardProps {
  open: boolean;
  onClose: () => void;
  onApply: (
    compiled: CompiledPosterReconstruction,
    meta: { source: PosterReconstructionSource; model: string | null },
  ) => void;
}

export function TemplateCreatorWizard({ open, onClose, onApply }: TemplateCreatorWizardProps) {
  const [reference, setReference] = useState<PreparedPosterImage | null>(null);
  const [guideOpacity, setGuideOpacity] = useState(0.22);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleReference = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      setReference(await prepareTemplateReference(file));
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setPreparing(false);
    }
  };

  const handleCreate = async () => {
    if (!reference) {
      setError('Upload a flat poster first.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await requestPosterReconstruction({
        reference: {
          dataUrl: reference.dataUrl,
          width: reference.width,
          height: reference.height,
        },
        quality: 'quality',
      });
      const compiled = await compilePosterReconstruction({
        plan: response.plan,
        reference,
        referenceGuideOpacity: guideOpacity,
      });
      onApply(compiled, { source: response.source, model: response.model });
      onClose();
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/65 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-creator-title"
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h2 id="template-creator-title" className="text-xl font-semibold text-zinc-900 dark:text-white">
              Create a template from a flat poster
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
              AI reconstructs editable text, basic shapes, and image regions. You polish the draft,
              confirm the fillable fields, then save it to your template library.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="ml-4 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[1.1fr_0.9fr]">
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">1. Upload the reference</h3>
            <label className="mt-2 block cursor-pointer rounded-xl border border-dashed border-violet-400 bg-violet-50/60 p-3 text-sm text-violet-900 hover:bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-200">
              <span className="font-medium">
                {preparing
                  ? 'Preparing poster…'
                  : reference
                    ? `Reference: ${reference.fileName}`
                    : 'Choose a PNG, JPEG, or WebP poster'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={preparing || submitting}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void handleReference(file);
                }}
              />
            </label>
            {reference && (
              <img
                src={reference.dataUrl}
                alt="Template reconstruction reference"
                className="mt-3 max-h-[55vh] w-full rounded-xl bg-zinc-100 object-contain dark:bg-zinc-950"
              />
            )}
          </section>

          <section className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">2. Tracing guide</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                The original poster is placed behind the reconstructed layers as a locked guide.
                Replace or delete it before publishing so old names and photographs do not remain.
              </p>
              <label className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Guide opacity: {Math.round(guideOpacity * 100)}%
                <input
                  type="range"
                  min="0"
                  max="0.6"
                  step="0.02"
                  value={guideOpacity}
                  onChange={(event) => setGuideOpacity(Number(event.target.value))}
                  className="mt-2 w-full accent-violet-600"
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
              <p className="font-semibold text-zinc-800 dark:text-zinc-100">What happens next</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>The editable draft opens in the canvas.</li>
                <li>Likely titles, dates, names, and photos are labeled automatically.</li>
                <li>Correct fonts, crops, backgrounds, and any missed decoration.</li>
                <li>Click text or image layers to add or correct template fields.</li>
                <li>Save the finished template to the cloud library.</li>
              </ol>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              This first version makes a strong starting draft, not a pixel-perfect layered source.
              Complex backgrounds and overlapping artwork still need manual correction.
            </div>
          </section>
        </div>

        <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-700">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!reference || preparing || submitting}
              className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Analyzing and reconstructing…' : 'Create editable template draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function messageFromError(error: unknown): string {
  if (error instanceof PosterReconstructionError) return error.message;
  if (error instanceof Error) return error.message;
  return 'The template draft could not be created.';
}
