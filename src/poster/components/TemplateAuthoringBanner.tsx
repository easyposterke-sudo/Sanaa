interface TemplateAuthoringBannerProps {
  fieldCount: number;
  onCancel: () => void;
  onSaveTemplate: () => void;
}

export function TemplateAuthoringBanner({ fieldCount, onCancel, onSaveTemplate }: TemplateAuthoringBannerProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/40">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-950 dark:text-amber-100">Template labeling mode</p>
        <p className="text-xs text-amber-900/80 dark:text-amber-200/90">
          Click a <strong>text</strong> or <strong>image</strong> layer to set its label; the field key is
          generated in <strong>snake_case</strong> from the label (you can edit it if needed). Only labeled
          layers become fillable fields. When done, save the template to the library.
        </p>
        <p className="mt-1 text-xs font-medium text-amber-950 dark:text-amber-100">
          {fieldCount === 0
            ? 'No fields yet — select a text or image layer to add one.'
            : `${fieldCount} field${fieldCount === 1 ? '' : 's'} defined.`}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-100 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSaveTemplate}
          className="rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900 dark:bg-amber-700 dark:hover:bg-amber-600"
        >
          Save template…
        </button>
      </div>
    </div>
  );
}
