import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReferenceTextInventory } from './ReferenceTextInventory';
import { referenceElement, referencePlan } from '../ai/referenceTestFixtures';
import { EMPTY_REFERENCE_FIDELITY } from '../../../shared/ai/referenceFidelity';

afterEach(cleanup);
it('edits literal wording without changing geometry or image choices', () => {
  const text = referenceElement({ kind: 'text', label: 'Date', text: '31ST DEC, 2026', fidelity: { ...EMPTY_REFERENCE_FIDELITY, uncertainText: 'Check the year' } });
  const image = referenceElement({ key: 'speaker', kind: 'image_region', imageRole: 'person' });
  const plan = referencePlan([text, image]); const onChange = vi.fn();
  render(<ReferenceTextInventory plan={plan} disabled={false} onChange={onChange} />);
  fireEvent.click(screen.getByText('Check wording (1 text blocks)'));
  fireEvent.change(screen.getByLabelText('Wording: Date'), { target: { value: '31ST\nDEC, 2027' } });
  expect(onChange).toHaveBeenCalledWith({ ...plan, elements: [{ ...text, text: '31ST\nDEC, 2027', visibleLineCount: 2, fidelity: { ...text.fidelity, uncertainText: '' } }, image] });
});
