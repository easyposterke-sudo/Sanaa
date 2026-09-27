import type { PosterReconstructionPlan } from '../../../shared/ai/posterReconstruction';

export function ReferenceTextInventory({ plan, disabled, onChange }: {
  plan: PosterReconstructionPlan; disabled: boolean; onChange: (plan: PosterReconstructionPlan) => void;
}) {
  const wording = plan.elements.filter(item => item.kind === 'text' && item.textEffect === 'flat')
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  if (!wording.length) return null;
  return <details className="mb-4 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
    <summary className="cursor-pointer text-sm font-semibold">Check wording ({wording.length} text blocks)</summary>
    <p className="my-2 text-xs text-zinc-500">Compare names, dates, punctuation and line breaks with the reference. Your corrections are preserved during automatic layout review.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {wording.map(item => <label key={item.key} className="text-xs">
        <span className="mb-1 block font-medium">{item.label}</span>
        {item.fidelity?.uncertainText && <span className="mb-1 block text-amber-700 dark:text-amber-300">Check: {item.fidelity.uncertainText}</span>}
        <textarea aria-label={`Wording: ${item.label}`} disabled={disabled} maxLength={500} rows={Math.min(5, Math.max(2, item.text.split('\n').length))}
          className="w-full rounded border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
          value={item.text} onChange={event => {
            const text = event.target.value;
            onChange({ ...plan, elements: plan.elements.map(layer => layer.key === item.key ? {
              ...layer, text, visibleLineCount: Math.min(20, text.split('\n').length),
              ...(layer.fidelity ? { fidelity: { ...layer.fidelity, uncertainText: '' } } : {}),
            } : layer) });
          }} />
      </label>)}
    </div>
  </details>;
}
