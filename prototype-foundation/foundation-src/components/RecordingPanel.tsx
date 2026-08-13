import { useState } from 'react';
import { downloadRecording } from '../editor/files';
import {
  listCloudRecordings,
  loadCloudRecording,
  saveRecordingSession,
  type RecordingSummary,
} from '../editor/cloudApi';
import { editorStore, useEditor } from '../editor/editorStore';

export function RecordingPanel() {
  const recording = useEditor((state) => state.recording);
  const lastRecording = useEditor((state) => state.lastRecording);
  const projectId = useEditor((state) => state.document.id);
  const [message, setMessage] = useState<string | null>(null);
  const [cloudRecordings, setCloudRecordings] = useState<
    RecordingSummary[] | null
  >(null);

  const stop = () => {
    const completed = editorStore.stopRecording();
    if (completed) setMessage(`Captured ${completed.commands.length} semantic actions.`);
  };

  const saveToCloud = async () => {
    if (!lastRecording) return;
    setMessage('Saving recording…');
    try {
      await saveRecordingSession(lastRecording);
      setMessage('Recording saved to R2.');
      setCloudRecordings(await listCloudRecordings(projectId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save recording.');
    }
  };

  const loadCloudSessions = async () => {
    setMessage('Loading recordings…');
    try {
      setCloudRecordings(await listCloudRecordings(projectId));
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load recordings.');
    }
  };

  const downloadCloudSession = async (summary: RecordingSummary) => {
    setMessage(`Downloading ${summary.name}…`);
    try {
      downloadRecording(await loadCloudRecording(projectId, summary.id));
      setMessage('Recording downloaded.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not download recording.');
    }
  };

  return (
    <section className="panel recording-panel">
      <div className="recording-heading">
        <div>
          <p className="eyebrow">Training data</p>
          <h2>Session recorder</h2>
        </div>
        <span className={`recording-light${recording ? ' is-live' : ''}`} />
      </div>
      <p className="muted-copy">
        Captures replayable design commands, not noisy mouse coordinates.
      </p>
      {recording ? (
        <>
          <div className="recording-counter">
            <strong>{recording.commands.length}</strong>
            <span>actions captured</span>
          </div>
          <button type="button" className="danger-button full-width" onClick={stop}>
            Stop recording
          </button>
        </>
      ) : (
        <button
          type="button"
          className="record-button full-width"
          onClick={() => {
            editorStore.startRecording();
            setMessage('Recording started.');
          }}
        >
          <span>●</span> Start recording
        </button>
      )}
      {lastRecording && !recording && (
        <div className="recording-actions">
          <button type="button" onClick={() => downloadRecording(lastRecording)}>
            Download JSON
          </button>
          <button type="button" onClick={() => void saveToCloud()}>
            Save to cloud
          </button>
        </div>
      )}
      {!recording && (
        <button
          type="button"
          className="cloud-recordings-toggle"
          onClick={() => void loadCloudSessions()}
        >
          Cloud recordings
        </button>
      )}
      {cloudRecordings && cloudRecordings.length > 0 && (
        <div className="cloud-recording-list">
          {cloudRecordings.map((summary) => (
            <button
              type="button"
              key={summary.id}
              onClick={() => void downloadCloudSession(summary)}
            >
              <span>{summary.name}</span>
              <small>{summary.commandCount} actions</small>
            </button>
          ))}
        </div>
      )}
      {message && <p className="panel-message">{message}</p>}
    </section>
  );
}
