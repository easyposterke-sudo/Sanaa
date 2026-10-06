import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './PosterReveal.css';

function SamplePoster({ editable = false }: { editable?: boolean }) {
  return (
    <div className={`reveal-poster ${editable ? 'reveal-poster-editable' : ''}`}>
      <div className="reveal-poster-orbit" />
      <span className="reveal-poster-eyebrow">THE NAIROBI SESSIONS / VOL. 04</span>
      <div className="reveal-poster-title"><span>GOOD</span><span>THINGS</span><em>take shape.</em>{editable && <><i /><i /><i /><i /><small>Text · Headline</small></>}</div>
      <div className="reveal-poster-flower" aria-hidden="true">✳</div>
      <div className="reveal-poster-details"><strong>ART. MUSIC. PEOPLE.</strong><span>24 OCTOBER · 4 PM TILL LATE</span><span>THE GARDEN, NAIROBI</span></div>
      <div className="reveal-poster-ticket">COME AS YOU ARE</div>
    </div>
  );
}

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
    <figure className="poster-reveal" aria-label="Example of a poster rebuilt as editable layers">
      <div className="reveal-window-bar"><span><span className="reveal-window-dots" aria-hidden="true">● ● ●</span> Sanaa Studio</span><span className="reveal-demo-label">INTERACTIVE DEMO</span></div>
      <div className="reveal-stage" style={{ '--reveal': `${position}%` } as CSSProperties}>
        <div className="reveal-scene reveal-editor-scene" aria-hidden="true">
          <div className="reveal-scene-label">Editable layers</div>
          <div className="reveal-tool-rail"><b>↖</b><span>T</span><span>◇</span><span>▧</span><span>◯</span></div>
          <SamplePoster editable />
          <div className="reveal-layers"><div className="reveal-panel-heading">Layers <span>6</span></div>
            {[['T', 'Headline'], ['T', 'Event details'], ['T', 'Ticket label'], ['✳', 'Flower'], ['◯', 'Orbit'], ['▧', 'Background']].map(([icon, label], index) => <div key={label} className={`reveal-layer ${index === 0 ? 'reveal-layer-selected' : ''}`}><span>{icon}</span><span>{label}</span><span className="reveal-layer-eye">◉</span></div>)}
            <div className="reveal-properties"><span>TEXT</span><strong>Good things</strong><div>Bold <span>96 px</span></div><div><i /> #F5EACF</div></div>
          </div>
          <span className="reveal-canvas-caption">Select a layer. Change every detail.</span>
        </div>
        <div className="reveal-scene reveal-upload-scene" aria-hidden="true"><div className="reveal-scene-label">↥ Original poster</div><SamplePoster /><div className="reveal-upload-note"><span>▧</span><strong>good-things.png</strong><span>One image.<br />So many possibilities.</span></div><span className="reveal-canvas-caption">Your upload · AI-generated or any poster</span></div>
        <div className="reveal-divider" aria-hidden="true"><span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m8 8-4 4 4 4m8-8 4 4-4 4" /></svg></span></div>
        <input className="reveal-slider" type="range" min="0" max="100" step="1" value={Math.round(position)} aria-label="Reveal editable poster layers" aria-valuetext={`${Math.round(position)}% editable layers revealed`} onPointerDown={() => setPlaying(false)} onKeyDown={() => setPlaying(false)} onChange={(event) => { setPlaying(false); const next = Number(event.target.value); positionRef.current = next; setPosition(next); }} />
      </div>
      <figcaption className="reveal-caption"><span><span className="reveal-caption-desktop">One poster. </span>Every layer, yours to edit.<span className="reveal-caption-hint"> Drag to explore</span></span><button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause poster animation' : 'Play poster animation'}><span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span> {playing ? 'Pause' : 'Play'}</button></figcaption>
    </figure>
  );
}
