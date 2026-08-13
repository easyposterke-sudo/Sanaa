import { parsePosterDocument, type PosterDocument } from '../domain/document';
import type { RecordingSession } from '../domain/recording';

export function downloadJson(value: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });
  downloadBlob(blob, fileName);
}
export async function readProjectJson(file: File): Promise<PosterDocument> {
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('This project file is larger than the 50 MB import safety limit.');
  }
  const text = await file.text();
  return parsePosterDocument(JSON.parse(text));
}

export function downloadProject(document: PosterDocument): void {
  downloadJson(document, `${safeFileName(document.title)}.easyposter.json`);
}

export function downloadRecording(session: RecordingSession): void {
  downloadJson(session, `${safeFileName(session.name)}.session.json`);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'poster'
  );
}
