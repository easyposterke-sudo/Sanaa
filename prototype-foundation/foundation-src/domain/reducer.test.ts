import { describe, expect, it } from 'vitest';
import { commandMeta } from './commands';
import {
  createBlankDocument,
  parsePosterDocument,
  type PosterDocument,
} from './document';
import { createTextElement, duplicateElement } from './factories';
import { applyCommandSequence, applyDocumentCommand } from './reducer';
import {
  completeRecordingSession,
  replayRecordingSession,
  startRecordingSession,
} from './recording';

describe('poster document commands', () => {
  it('round-trips an exact portable JSON document', () => {
    const document = createBlankDocument('Round trip');
    document.elements.push(createTextElement());
    const json = JSON.stringify(document);
    expect(parsePosterDocument(JSON.parse(json))).toEqual(document);
  });

  it('replays deterministic element IDs', () => {
    const initial = createBlankDocument();
    const source = createTextElement();
    const copy = duplicateElement(source);
    const commands = [
      {
        type: 'element.add' as const,
        element: source,
        meta: commandMeta('toolbar'),
      },
      {
        type: 'element.duplicate' as const,
        copies: [copy],
        meta: commandMeta('toolbar'),
      },
    ];

    const first = applyCommandSequence(initial, commands);
    const second = applyCommandSequence(initial, commands);
    expect(second).toEqual(first);
    expect(second.elements.map((element) => element.id)).toEqual([source.id, copy.id]);
  });

  it('records undo and redo as replayable actions', () => {
    const initial = createBlankDocument('Recording');
    const element = createTextElement();
    const add = {
      type: 'element.add' as const,
      element,
      meta: commandMeta('toolbar', 'Add heading'),
    };
    const update = {
      type: 'element.update' as const,
      id: element.id,
      patch: { fontSize: 96 },
      meta: commandMeta('property-panel', 'Set font size'),
    };
    const undo = { type: 'history.undo' as const, meta: commandMeta('keyboard') };
    const redo = { type: 'history.redo' as const, meta: commandMeta('keyboard') };
    const expected = applyCommandSequence(initial, [add, update, undo, redo]);

    const recording = completeRecordingSession(
      {
        ...startRecordingSession(initial),
        commands: [add, update, undo, redo],
      },
      expected,
    );

    expect(replayRecordingSession(recording)).toEqual(expected);
  });

  it('rejects incomplete layer orders instead of corrupting z-order', () => {
    const initial = createBlankDocument();
    const element = createTextElement();
    const document = applyDocumentCommand(initial, {
      type: 'element.add',
      element,
      meta: commandMeta('toolbar'),
    });

    expect(() =>
      applyDocumentCommand(document, {
        type: 'layer.reorder',
        orderedIds: [],
        meta: commandMeta('property-panel'),
      }),
    ).toThrow(/every element/);
  });

  it('does not mutate the previous document snapshot', () => {
    const initial = createBlankDocument();
    const frozen = structuredClone(initial) as PosterDocument;
    applyDocumentCommand(initial, {
      type: 'canvas.update',
      patch: { background: '#123456' },
      meta: commandMeta('property-panel'),
    });
    expect(initial).toEqual(frozen);
  });
});
