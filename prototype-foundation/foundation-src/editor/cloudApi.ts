import {
  parsePosterDocument,
  type PosterDocument,
} from '../domain/document';
import type { RecordingSession } from '../domain/recording';
import { parseRecordingSession } from '../domain/recording';

type ProjectSummary = {
  id: string;
  title: string;
  width: number;
  height: number;
  elementCount: number;
  updatedAt: string;
};

type UploadedAsset = {
  id: string;
  url: string;
  fileName: string;
  mediaType: string;
  byteSize: number;
};

export type RecordingSummary = {
  id: string;
  name: string;
  commandCount: number;
  startedAt: string;
  endedAt: string | null;
};

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      'x-easyposter-owner': 'local-owner',
    },
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error || `Request failed with status ${response.status}.`);
  }
  return response;
}

export async function listCloudProjects(): Promise<ProjectSummary[]> {
  const response = await apiFetch('/api/projects');
  const data = (await response.json()) as { projects: ProjectSummary[] };
  return data.projects;
}

export async function saveCloudProject(document: PosterDocument): Promise<void> {
  await apiFetch(`/api/projects/${encodeURIComponent(document.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(document),
  });
}

export async function loadCloudProject(id: string): Promise<PosterDocument> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(id)}`);
  return parsePosterDocument(await response.json());
}

export async function saveRecordingSession(
  session: RecordingSession,
): Promise<void> {
  await apiFetch(
    `/api/projects/${encodeURIComponent(session.projectId)}/recordings/${encodeURIComponent(session.id)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(session),
    },
  );
}

export async function uploadCloudAsset(file: File): Promise<UploadedAsset> {
  const response = await apiFetch('/api/assets', {
    method: 'POST',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
    },
    body: file,
  });
  return (await response.json()) as UploadedAsset;
}

export async function listCloudRecordings(
  projectId: string,
): Promise<RecordingSummary[]> {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/recordings`,
  );
  const data = (await response.json()) as { recordings: RecordingSummary[] };
  return data.recordings;
}

export async function loadCloudRecording(
  projectId: string,
  recordingId: string,
): Promise<RecordingSession> {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/recordings/${encodeURIComponent(recordingId)}`,
  );
  return parseRecordingSession(await response.json());
}
