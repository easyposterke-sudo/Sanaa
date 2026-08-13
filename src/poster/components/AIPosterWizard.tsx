import { useMemo, useState } from 'react';
import {
  PosterBriefSchema,
  type PosterBrief,
  type PosterPlanSource,
} from '../../../shared/ai/posterPlan';
import {
  compilePosterPlan,
  type CompiledPosterPlan,
  type PreparedPortraitAsset,
} from '../ai/compilePosterPlan';
import {
  preparePortrait,
  prepareReferencePoster,
  type PreparedPosterImage,
} from '../ai/preparePosterImage';
import { PosterPlannerError, requestPosterPlan } from '../services/aiPosterApi';

interface AIPosterWizardProps {
  open: boolean;
  onClose: () => void;
  onApply: (
    compiled: CompiledPosterPlan,
    meta: { source: PosterPlanSource; model: string | null },
  ) => void;
}

type Quality = 'economy' | 'quality';

const INITIAL_BRIEF: PosterBrief = {
  organization: 'CHRISTIAN OUTREACH MINISTRIES WORLDWIDE - KAKAMEGA DIOCESE',
  presenterLine: 'Presents',
  year: '2026',
  eventTitle: "MEN'S\nCONFERENCE",
  themeLabel: 'THEME',
  theme: 'ARISE & BUILD AGAIN.',
  scripture: '“Let us rise up and build.” — Nehemiah 2:17–18',
  date: '14th–15th August',
  time: '9am–5pm',
  venue: 'CHRISTIAN OUTREACH MINISTRIES WORLDWIDE - LUMAKANDA CHURCH',
  people: [
    { key: 'guest_left', name: 'PST AMRAM WASIKE', role: "Diocese men's leader" },
    { key: 'guest_middle', name: 'PST PATRICK KEKENA', role: 'Guest' },
    { key: 'host', name: 'BSHP GEORGE OPIYO', role: 'Host' },
    { key: 'guest_right', name: 'BSHP JONAH SHIRUTSI', role: 'Guest' },
  ],
};

export function AIPosterWizard({ open, onClose, onApply }: AIPosterWizardProps) {
  const [brief, setBrief] = useState<PosterBrief>(INITIAL_BRIEF);
  const [reference, setReference] = useState<PreparedPosterImage | null>(null);
  const [portraits, setPortraits] = useState<Record<string, PreparedPosterImage>>({});
  const [quality, setQuality] = useState<Quality>('economy');
  const [preparing, setPreparing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    source: PosterPlanSource;
    model: string | null;
    warnings: string[];
  } | null>(null);

  const portraitCount = useMemo(
    () => brief.people.filter((person) => Boolean(portraits[person.key])).length,
    [brief.people, portraits],
  );

  if (!open) return null;

  const updateBrief = <K extends keyof Omit<PosterBrief, 'people'>>(key: K, value: PosterBrief[K]) => {
    setBrief((current) => ({ ...current, [key]: value }));
    setResult(null);
  };

  const updatePerson = (index: number, field: 'name' | 'role', value: string) => {
    setBrief((current) => ({
      ...current,
      people: current.people.map((person, personIndex) =>
        personIndex === index ? { ...person, [field]: value } : person,
      ),
    }));
    setResult(null);
  };

  const handleReference = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setPreparing('reference');
    try {
      setReference(await prepareReferencePoster(file));
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setPreparing(null);
    }
  };

  const handlePortrait = async (personKey: string, file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setPreparing(personKey);
    try {
      const prepared = await preparePortrait(file);
      setPortraits((current) => ({ ...current, [personKey]: prepared }));
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setPreparing(null);
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setResult(null);
    if (!reference) {
      setError('Upload the reference poster first.');
      return;
    }
    const parsedBrief = PosterBriefSchema.safeParse(brief);
    if (!parsedBrief.success) {
      setError('Complete the organization, event title, and every speaker name and role.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await requestPosterPlan({
        reference: {
          dataUrl: reference.dataUrl,
          width: reference.width,
          height: reference.height,
        },
        brief: parsedBrief.data,
        quality,
      });
      const portraitAssets: PreparedPortraitAsset[] = parsedBrief.data.people.flatMap((person) => {
        const asset = portraits[person.key];
        return asset
          ? [
              {
                personKey: person.key,
                src: asset.dataUrl,
                width: asset.width,
                height: asset.height,
              },
            ]
          : [];
      });
      const compiled = compilePosterPlan({
        plan: response.plan,
        brief: parsedBrief.data,
        portraits: portraitAssets,
      });
      onApply(compiled, { source: response.source, model: response.model });
      setResult({
        source: response.source,
        model: response.model,
        warnings: compiled.warnings,
      });
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/65 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-poster-title"
    >
      <div className="my-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h2 id="ai-poster-title" className="text-xl font-semibold text-zinc-900 dark:text-white">
              Create an editable poster from a reference
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
              AI analyzes layout and style once. EasyPoster then builds the text, shapes, 3D title,
              portrait slots, and footer with deterministic recipes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[0.9fr_1.35fr]">
          <section className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">1. Reference poster</h3>
              <label className="mt-2 block cursor-pointer rounded-xl border border-dashed border-emerald-400 bg-emerald-50/60 p-3 text-sm text-emerald-900 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                <span className="font-medium">
                  {preparing === 'reference'
                    ? 'Preparing image…'
                    : reference
                      ? `Reference: ${reference.fileName}`
                      : 'Choose reference PNG, JPEG, or WebP'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={Boolean(preparing) || submitting}
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
                  alt="Prepared poster reference"
                  className="mt-3 max-h-72 w-full rounded-lg bg-zinc-100 object-contain dark:bg-zinc-950"
                />
              )}
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                A planning copy is resized to 1024 px. It is analyzed, not reused as the final
                background, so old text and people do not leak into the new poster.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">2. Analysis cost</h3>
              <select
                value={quality}
                onChange={(event) => setQuality(event.target.value as Quality)}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="economy">Economy — low-detail vision</option>
                <option value="quality">Quality — high-detail vision</option>
              </select>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Exact reference repeats use the cached plan and cost no additional model call.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                3. Portrait cutouts ({portraitCount}/{brief.people.length})
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Transparent PNG/WebP cutouts give the best result. Photos stay in your browser and
                are not sent to the vision planner.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {brief.people.map((person) => {
                  const portrait = portraits[person.key];
                  return (
                    <label
                      key={person.key}
                      className="cursor-pointer rounded-lg border border-zinc-200 p-2 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {portrait ? (
                        <img
                          src={portrait.dataUrl}
                          alt={`${person.name} portrait`}
                          className="mb-2 h-20 w-full rounded bg-zinc-100 object-contain dark:bg-zinc-950"
                        />
                      ) : (
                        <div className="mb-2 flex h-20 items-center justify-center rounded bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                          No photo
                        </div>
                      )}
                      <span className="line-clamp-2 font-medium">
                        {preparing === person.key ? 'Preparing…' : person.name}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={Boolean(preparing) || submitting}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          void handlePortrait(person.key, file);
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">4. Exact poster content</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              These values override any wording the AI sees in the reference.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Organization" className="sm:col-span-2">
                <input value={brief.organization} onChange={(event) => updateBrief('organization', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Presenter line">
                <input value={brief.presenterLine} onChange={(event) => updateBrief('presenterLine', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Year">
                <input value={brief.year} onChange={(event) => updateBrief('year', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Event title (line break allowed)" className="sm:col-span-2">
                <textarea value={brief.eventTitle} onChange={(event) => updateBrief('eventTitle', event.target.value)} rows={2} className={inputClass} />
              </Field>
              <Field label="Theme label">
                <input value={brief.themeLabel} onChange={(event) => updateBrief('themeLabel', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Theme">
                <input value={brief.theme} onChange={(event) => updateBrief('theme', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Scripture / supporting line" className="sm:col-span-2">
                <textarea value={brief.scripture} onChange={(event) => updateBrief('scripture', event.target.value)} rows={2} className={inputClass} />
              </Field>
              <Field label="Date">
                <input value={brief.date} onChange={(event) => updateBrief('date', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Time">
                <input value={brief.time} onChange={(event) => updateBrief('time', event.target.value)} className={inputClass} />
              </Field>
              <Field label="Venue" className="sm:col-span-2">
                <input value={brief.venue} onChange={(event) => updateBrief('venue', event.target.value)} className={inputClass} />
              </Field>
            </div>

            <div className="mt-5 space-y-3">
              {brief.people.map((person, index) => (
                <div key={person.key} className="grid gap-2 rounded-xl border border-zinc-200 p-3 sm:grid-cols-2 dark:border-zinc-700">
                  <Field label={`Person ${index + 1} name`}>
                    <input value={person.name} onChange={(event) => updatePerson(index, 'name', event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Role">
                    <input value={person.role} onChange={(event) => updatePerson(index, 'role', event.target.value)} className={inputClass} />
                  </Field>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-700">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          {result && (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Poster loaded into the editor using {sourceLabel(result.source)}
              {result.model ? ` (${result.model})` : ''}. {result.warnings.length > 0 ? `${result.warnings.length} review note(s) remain.` : 'All local checks passed.'}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {result ? 'Open editor' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={submitting || Boolean(preparing)}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Analyzing and building…' : result ? 'Generate again' : 'Generate editable poster'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white';

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-xs font-medium text-zinc-600 dark:text-zinc-300 ${className}`}>
      {label}
      {children}
    </label>
  );
}

function messageFromError(error: unknown): string {
  if (error instanceof PosterPlannerError) return error.message;
  if (error instanceof Error) return error.message;
  return 'The poster could not be generated.';
}

function sourceLabel(source: PosterPlanSource): string {
  if (source === 'cache') return 'a cached reference analysis';
  if (source === 'fallback') return 'the free built-in conference recipe';
  return 'one OpenAI reference analysis';
}
