import { fetchWithTimeout } from '../../lib/api';

const MAX_SOURCE_BYTES = 22 * 1024 * 1024;
const SUPPORTED_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface LocalBackgroundRemovalResult {
  dataUrl: string;
  elapsedMs: number;
  firstLoad: boolean;
}

type PendingJob = {
  resolve: (result: LocalBackgroundRemovalResult) => void;
  reject: (error: Error) => void;
  onProgress?: (message: string) => void;
};

type WorkerResponse =
  | { type: 'progress'; id: string; message: string }
  | {
      type: 'result';
      id: string;
      mediaType: string;
      elapsedMs: number;
      firstLoad: boolean;
      output: ArrayBuffer;
    }
  | { type: 'error'; id: string; message: string };

let worker: Worker | null = null;
let nextJobId = 0;
const pendingJobs = new Map<string, PendingJob>();

export async function removeImageBackgroundLocally(
  source: string,
  onProgress?: (message: string) => void,
): Promise<LocalBackgroundRemovalResult> {
  const sourceResponse = await fetchWithTimeout(source, {}, 30_000).catch(() => {
    throw new Error('The selected image could not be read. Re-upload it and try again.');
  });
  if (!sourceResponse.ok) {
    throw new Error('The selected image could not be downloaded. Re-upload it and try again.');
  }

  const sourceBlob = await sourceResponse.blob();
  if (!SUPPORTED_SOURCE_TYPES.has(sourceBlob.type)) {
    throw new Error('Local background removal supports PNG, JPEG, and WebP images.');
  }
  if (sourceBlob.size <= 0 || sourceBlob.size > MAX_SOURCE_BYTES) {
    throw new Error('Use an image between 1 byte and 22 MB.');
  }

  const sourceBuffer = await sourceBlob.arrayBuffer();
  const id = `local-background-${Date.now()}-${nextJobId++}`;
  return new Promise<LocalBackgroundRemovalResult>((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject, onProgress });
    getWorker().postMessage(
      { type: 'remove', id, mediaType: sourceBlob.type, source: sourceBuffer },
      [sourceBuffer],
    );
  });
}

export function disposeLocalBackgroundRemovalWorker(): void {
  worker?.terminate();
  worker = null;
  for (const job of pendingJobs.values()) {
    job.reject(new Error('Local background removal was stopped.'));
  }
  pendingJobs.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/localBackgroundRemoval.worker.ts', import.meta.url), {
    type: 'module',
    name: 'easyposter-local-background-removal',
  });
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const job = pendingJobs.get(response.id);
    if (!job) return;
    if (response.type === 'progress') {
      job.onProgress?.(response.message);
      return;
    }
    pendingJobs.delete(response.id);
    if (response.type === 'error') {
      job.reject(new Error(response.message));
      return;
    }
    void blobToDataUrl(new Blob([response.output], { type: response.mediaType }))
      .then((dataUrl) =>
        job.resolve({
          dataUrl,
          elapsedMs: response.elapsedMs,
          firstLoad: response.firstLoad,
        }),
      )
      .catch((error) =>
        job.reject(error instanceof Error ? error : new Error('The local result could not be read.')),
      );
  });
  worker.addEventListener('error', () => {
    const failedJobs = [...pendingJobs.values()];
    pendingJobs.clear();
    worker?.terminate();
    worker = null;
    for (const job of failedJobs) {
      job.reject(new Error('The local background-removal engine could not start.'));
    }
  });
  return worker;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The local result could not be read.'));
    reader.readAsDataURL(blob);
  });
}
