import { useState } from 'react';
import { missingPosterFacts, posterCreationLayoutIssues, prepareCreatedPoster } from '../../../shared/ai/posterCreationChecks';
import { requestPosterReconstruction } from '../services/posterReconstructionApi';
import { compilePosterReconstruction, type CompiledPosterReconstruction, type ReconstructionImageReplacement } from '../ai/compilePosterReconstruction';
import { prepareTemplateReference, type PreparedPosterImage } from '../ai/preparePosterImage';
import { searchStockPhotos, downloadStockPhoto } from '../services/stockPhotosApi';
import { capturePosterThumbnail, getFabricCanvasRef } from '../canvasRef';
import type { PosterReconstructionPlan, PosterReconstructionRequest } from '../../../shared/ai/posterReconstruction';

type AssetRole = 'person' | 'logo' | 'background_photo';
const styles = ['Warm split layout', 'Blue central speaker', 'Black and gold', 'White and maroon', 'Blue information cards', 'Pink typographic', 'Orange and olive'];
type Props = { onApply: (draft: CompiledPosterReconstruction) => void; onClose: () => void; onImport: () => void };

export function PosterPromptCreator({ onApply, onClose, onImport }: Props) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('auto');
  const [assets, setAssets] = useState<Partial<Record<AssetRole, PreparedPosterImage>>>({});
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<CompiledPosterReconstruction | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastStyle, setLastStyle] = useState<number | null>(null);

  async function upload(role: AssetRole, file?: File) {
    if (!file) return;
    setPreparing(true); setError('');
    try { const image = await prepareTemplateReference(file); setAssets(current => ({ ...current, [role]: image })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Image could not be loaded.'); }
    finally { setPreparing(false); }
  }

  async function generate() {
    setBusy(true); setError(''); setResult(null); setPreview(null);
    let draft: CompiledPosterReconstruction | null = null;
    const warnings: string[] = [];
    try {
      const families = assets.person ? [2, 4, 5] : [1, 3, 6, 7];
      const choices = families.filter(id => id !== lastStyle);
      const referenceId = style === 'auto' ? choices[Math.floor(Math.random() * choices.length)]! : Number(style);
      setLastStyle(referenceId);
      const blank = document.createElement('canvas'); blank.width = 1080; blank.height = 1350;
      const context = blank.getContext('2d')!; context.fillStyle = '#ffffff'; context.fillRect(0, 0, 1080, 1350);
      const reference = { dataUrl: blank.toDataURL('image/png'), width: 1080, height: 1350 };
      const creation: NonNullable<PosterReconstructionRequest['creation']> = {
        prompt, seed: crypto.randomUUID(), referenceId, phase: 'design',
        assets: (Object.entries(assets) as [AssetRole, PreparedPosterImage][]).map(([role, image]) => ({ role, dataUrl: image.dataUrl, width: image.width, height: image.height })),
      };
      const replacements: Record<string, ReconstructionImageReplacement> = {};
      for (const [role, asset] of Object.entries(assets)) replacements[`asset_${role}`] = { src: asset.dataUrl, width: asset.width, height: asset.height };
      setStatus(`Designing with reference ${referenceId}…`);
      let response = await requestPosterReconstruction({ reference, quality: 'quality', creation });
      response.plan = prepareCreatedPoster(response.plan, prompt, !!assets.logo);
      const missing = [...missingPosterFacts(response.plan, prompt), ...posterCreationLayoutIssues(response.plan)];
      if (missing.length) {
        setStatus('Restoring missing service details…');
        response = await requestPosterReconstruction({ reference, quality: 'quality', creation: { ...creation, seed: `${creation.seed}-repair`, prompt: `${prompt}\nMandatory correction: the last draft omitted these supplied facts: ${missing.join('; ')}. Include all of them as visible editable text inside their information cards. Do not add duplicate titles or invitation slogans.` } });
        response.plan = prepareCreatedPoster(response.plan, prompt, !!assets.logo);
      }
      const stillMissing = [...missingPosterFacts(response.plan, prompt), ...posterCreationLayoutIssues(response.plan)];
      if (stillMissing.length) throw new Error(`The draft is missing required details: ${stillMissing.join('; ')}. Your canvas has not been replaced. Please retry.`);
      const compile = async (plan: PosterReconstructionPlan) => {
        plan = prepareCreatedPoster(plan, prompt, !!assets.logo);
        const absent = [...missingPosterFacts(plan, prompt), ...posterCreationLayoutIssues(plan)];
        if (absent.length) throw new Error(`Missing required details: ${absent.join('; ')}`);
        // Never allow the blank canvas or review screenshot to become an image asset.
        const safePlan = { ...plan, elements: plan.elements.filter(item => item.kind !== 'image_region' || replacements[item.key] || (item.imageRole === 'icon' && item.iconName !== 'none')) };
        return compilePosterReconstruction({ plan: safePlan, reference, referenceGuideOpacity: 0, imageReplacements: replacements });
      };
      const stock = response.plan.elements.find(item => item.key === 'stock_background' && item.imageRole === 'background_photo');
      if (stock && !assets.background_photo) {
        setStatus('Finding a background photograph…');
        try {
          const photos = await searchStockPhotos({ query: stock.imageSearchQuery || 'church worship', orientation: 'portrait' });
          if (!photos[0]) throw new Error('No matching background photograph was found.');
          const photo = await downloadStockPhoto(photos[0]);
          replacements.stock_background = { src: photo.dataUrl, width: photo.width, height: photo.height, credit: `${photos[0].photographer} / Pexels — ${photos[0].pexelsUrl}` };
        } catch (caught) { warnings.push(`${caught instanceof Error ? caught.message : 'Photo search failed.'} The draft uses its designed background colours.`); }
      }
      draft = await compile(response.plan);
      if (!draft.project.elements.some(item => item.type === 'text')) throw new Error('AI returned no editable text. Please try again.');
      setStatus('Opening and inspecting the rendered draft…');
      onApply(draft);
      await waitForDraft(draft);
      const snapshot = await capturePosterThumbnail(1080, 1350, draft.project.canvasBackground ?? { type: 'solid', color: '#ffffff' }, 1080);
      setPreview(snapshot);
      if (snapshot) {
        try {
          setStatus('Reviewing the canvas and making one correction pass…');
          const reviewed = await requestPosterReconstruction({ reference: { ...reference, dataUrl: snapshot }, quality: 'quality', creation: { ...creation, phase: 'review', previousPlan: response.plan } });
          const corrected = await compile(reviewed.plan);
          if (!corrected.project.elements.some(item => item.type === 'text')) throw new Error('Review returned no text; original draft retained.');
          draft = corrected; onApply(draft);
          await waitForDraft(draft);
          setPreview(await capturePosterThumbnail(1080, 1350, draft.project.canvasBackground ?? { type: 'solid', color: '#ffffff' }, 1080));
        } catch (caught) { warnings.push(`Review unavailable; the generated draft remains editable. ${caught instanceof Error ? caught.message : ''}`); }
      } else warnings.push('Canvas capture was unavailable; visual review was skipped.');
      setResult({ ...draft, warnings: [...draft.warnings, ...warnings] });
      setStatus('Your editable draft is ready.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Generation failed.');
      if (draft) setResult(draft);
    } finally { setBusy(false); }
  }

  return <div role="dialog" aria-modal="true" aria-labelledby="prompt-poster-title" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4">
    <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-zinc-900 shadow-xl dark:bg-zinc-900 dark:text-white">
      <div className="flex items-center justify-between gap-4"><h2 id="prompt-poster-title" className="text-xl font-semibold">Create with AI</h2><button disabled={busy || preparing} onClick={onClose}>Close</button></div>
      <p className="mt-2 text-sm text-zinc-500">Church and Worship · Church Service · 1080 × 1350</p>
      <label className="mt-5 block font-medium" htmlFor="poster-brief">Describe your Sunday service poster</label>
      <textarea id="poster-brief" value={prompt} disabled={busy} maxLength={4000} onChange={event => setPrompt(event.target.value)} rows={5} placeholder="Church name, theme, date or Every Sunday, time, venue, contacts, and the mood you want. Only supplied details will be included." className="mt-2 w-full rounded-lg border border-zinc-300 bg-transparent p-3" />
      <label className="mt-3 block" htmlFor="poster-style">Design direction</label>
      <select id="poster-style" disabled={busy} value={style} onChange={event => setStyle(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2 text-zinc-900"><option value="auto">Choose a fresh direction</option>{styles.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{(['person', 'logo', 'background_photo'] as const).map(role => <label key={role} className="rounded-lg border p-2 text-sm">{role === 'person' ? 'Speaker photo (optional)' : role === 'logo' ? 'Logo (optional)' : 'Background (optional)'}<input aria-label={role} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || preparing} className="mt-2 w-full text-xs" onChange={event => void upload(role, event.target.files?.[0])} />{assets[role] && <button type="button" disabled={busy} className="mt-2 underline" onClick={() => setAssets(current => { const next = { ...current }; delete next[role]; return next; })}>Remove</button>}</label>)}</div>
      <p className="mt-3 text-xs text-zinc-500">Use a transparent speaker cutout for portrait layouts. Background photo requests use Pexels when configured. This prototype opens a new draft in the current canvas; save your current work first.</p>
      <p role="status" aria-live="polite" className="mt-4 text-sm">{preparing ? 'Preparing image…' : status}</p>
      {error && <p role="alert" className="mt-3 text-red-600">{error}</p>}
      {preview && <img src={preview} alt="Generated poster preview" className="mx-auto mt-4 max-h-80 rounded border" />}
      {result && <div className="mt-3 text-sm"><p>{result.description}</p>{result.warnings.length > 0 && <ul className="mt-2 list-disc pl-5">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}</div>}
      <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy || preparing || prompt.trim().length < 10} onClick={() => void generate()} className="rounded-lg bg-violet-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Creating…' : result ? 'Generate another version' : 'Generate editable poster'}</button>{result && <button disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2">Continue editing</button>}<button disabled={busy || preparing} onClick={onImport} className="px-2 text-sm underline">Recreate an existing poster instead</button></div>
    </div>
  </div>;
}

async function waitForDraft(draft: CompiledPosterReconstruction) {
  await document.fonts.ready;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const canvas = getFabricCanvasRef();
    const objects = canvas?.getObjects() ?? [];
    const ready = draft.project.elements.every(element => objects.some(object => {
      const item = object as typeof object & { data?: { posterId?: string }; text?: string };
      return item.data?.posterId === element.id && (element.type !== 'text' || item.text === element.text);
    }));
    if (canvas && ready) {
      canvas.renderAll();
      await new Promise(resolve => setTimeout(resolve, 500));
      return;
    }
  }
  throw new Error('Canvas rendering did not finish in time. The editable draft is still available.');
}

