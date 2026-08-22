import { useEffect, useRef } from 'react';
import { ensureFontPreviewFromUrl } from '../core/font/customFontCache';

interface LazyFontPreviewLabelProps {
  label: string;
  fontFamily: string;
  previewKey: string;
  fontUrl: string;
  className?: string;
}

export function LazyFontPreviewLabel({
  label,
  fontFamily,
  previewKey,
  fontUrl,
  className,
}: LazyFontPreviewLabelProps) {
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = labelRef.current;
    if (!element) return;

    const loadPreview = () => {
      void ensureFontPreviewFromUrl(previewKey, fontUrl).catch(() => {
        // Keep the readable fallback when an individual font cannot be decoded.
      });
    };

    if (typeof IntersectionObserver === 'undefined') {
      loadPreview();
      return;
    }

    const scrollContainer = element.closest<HTMLElement>('[data-font-preview-scroll]');
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadPreview();
      },
      {
        root: scrollContainer,
        rootMargin: '120px 0px',
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [fontUrl, previewKey]);

  return (
    <span
      ref={labelRef}
      className={className}
      style={{ fontFamily: `${fontFamily}, system-ui, sans-serif` }}
    >
      {label}
    </span>
  );
}
