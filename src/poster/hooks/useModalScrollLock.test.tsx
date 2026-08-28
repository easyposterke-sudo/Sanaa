import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useModalScrollLock } from './useModalScrollLock';

describe('useModalScrollLock', () => {
  afterEach(() => {
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
  });

  it('locks the document while active and restores its previous styles', () => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overscrollBehavior = 'contain';

    const { rerender, unmount } = renderHook(
      ({ active }) => useModalScrollLock(active),
      { initialProps: { active: false } },
    );

    rerender({ active: true });
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overscrollBehavior).toBe('none');

    rerender({ active: false });
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.documentElement.style.overscrollBehavior).toBe('contain');

    unmount();
  });

  it('keeps the lock until every nested modal releases it', () => {
    const first = renderHook(() => useModalScrollLock(true));
    const second = renderHook(() => useModalScrollLock(true));

    act(() => first.unmount());
    expect(document.body.style.overflow).toBe('hidden');

    act(() => second.unmount());
    expect(document.body.style.overflow).toBe('');
  });
});
