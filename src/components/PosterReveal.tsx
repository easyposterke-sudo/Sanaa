import { useEffect, useRef, useState, type CSSProperties } from 'react';
import editablePoster from '../assets/business-forum-editable.png';
import referencePoster from '../assets/business-forum-reference.png';
import './PosterReveal.css';

export function PosterReveal() {
  const [position, setPosition] = useState(50);
  const [playing, setPlaying] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const positionRef = useRef(position);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const stopForReducedMotion = () => { if (preference?.matches) setPlaying(false); };
    preference?.addEventListener('change', stopForReducedMotion);
    return () => preference?.removeEventListener('change', stopForReducedMotion);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = 0;
    let direction = 1;
    const animate = (now: number) => {
      if (last && !document.hidden) {
        const next = Math.max(3, Math.min(97, positionRef.current + direction * Math.min(now - last, 40) * 0.012));
        if (next === 97 || next === 3) direction *= -1;
        positionRef.current = next;
        setPosition(next);
      }
      last = now;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return (
    <figure className="poster-reveal" aria-label="Business Forum 2026: original reference compared with the AI-rebuilt poster and its outlined editable layers">
      <div className="reveal-window-bar"><span><span className="reveal-window-dots" aria-hidden="true">● ● ●</span> Sanaa Studio</span><span className="reveal-demo-label">INTERACTIVE DEMO</span></div>
      <div className="reveal-stage" style={{ '--reveal': `${position}%` } as CSSProperties}>
        <div className="reveal-scene reveal-editor-scene" aria-hidden="true">
          <div className="reveal-scene-label">AI result · Editable layers</div>
          <img className="reveal-poster" src={editablePoster} alt="" width={631} height={785} draggable={false} />
          <span className="reveal-canvas-caption">AI-rebuilt draft · Layer outlines shown</span>
        </div>
        <div className="reveal-scene reveal-upload-scene" aria-hidden="true">
          <div className="reveal-scene-label">↥ Original poster</div>
          <img className="reveal-poster" src={referencePoster} alt="" width={1122} height={1402} draggable={false} />
          <span className="reveal-canvas-caption">Business Forum 2026 · Original reference</span>
        </div>
        <div className="reveal-divider" aria-hidden="true"><span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m8 8-4 4 4 4m8-8 4 4-4 4" /></svg></span></div>
        <input className="reveal-slider" type="range" min="0" max="100" step="1" value={Math.round(position)} aria-label="Reveal editable poster layers" aria-valuetext={`${Math.round(position)}% editable layers revealed`} onPointerDown={() => setPlaying(false)} onKeyDown={() => setPlaying(false)} onChange={(event) => { setPlaying(false); const next = Number(event.target.value); positionRef.current = next; setPosition(next); }} />
      </div>
      <figcaption className="reveal-caption"><span><span className="reveal-caption-desktop">One poster. </span>Every layer, yours to edit.<span className="reveal-caption-hint"> Drag to explore</span></span><button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause poster animation' : 'Play poster animation'}><span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span> {playing ? 'Pause' : 'Play'}</button></figcaption>
    </figure>
  );
}
