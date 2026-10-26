import { useLayoutEffect, useRef, useState } from 'react';
import { Atom, Coffee, Orbit, Pause, Play } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';
import { marqueeCopies, marqueeDurationSeconds } from './announcement-values.mjs';
import { uiText } from '../lib/ui-copy.js';

// Two identical, gap-free groups are animated by exactly one group width.
// Each group is wider than the viewport, so no empty strip can enter the frame.
export default function AnnouncementBar() {
  const { t, lang } = useLocale();
  const message = t('announcement');
  const [paused, setPaused] = useState(false);
  // The words are unchanged; replace only the decorative separators.
  const phrases = message.split('✦').map(part => part.trim()).filter(Boolean);
  const icons = [Atom, Coffee, Orbit, Coffee];
  const viewportRef = useRef(null);
  const sampleRef = useRef(null);
  const [layout, setLayout] = useState({ copies: 2, duration: 32 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const sample = sampleRef.current;
    if (!viewport || !sample) return undefined;
    const update = () => {
      const unitWidth = sample.getBoundingClientRect().width;
      const copies = marqueeCopies(viewport.clientWidth, unitWidth);
      const duration = marqueeDurationSeconds(copies, unitWidth);
      setLayout(previous => previous.copies === copies && previous.duration === duration ? previous : { copies, duration });
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(sample);
    return () => observer.disconnect();
  }, [message]);

  const group = (duplicate) => <div className="qc-announcement-group" aria-hidden="true">
    {Array.from({ length: layout.copies }, (_, index) =>
      <span key={index} ref={!duplicate && index === 0 ? sampleRef : undefined} className="qc-announcement-unit">
        {phrases.map((phrase, part) => {
          const Icon = icons[(index * phrases.length + part) % icons.length];
          return <span className="qc-announcement-phrase" key={part}>
            <span dir={lang === 'ar' ? 'rtl' : 'ltr'}>{phrase}</span>
            <Icon className="qc-announcement-separator" size={13} strokeWidth={1.3} aria-hidden="true" />
          </span>;
        })}
      </span>)}
  </div>;

  return <div className="announcement" ref={viewportRef}>
    <span className="qc-announcement-sr-only">{phrases.join(' — ')}</span>
    <div className="qc-announcement-track" aria-hidden="true" style={{ '--qc-marquee-duration': `${layout.duration}s`, animationPlayState: paused ? 'paused' : undefined }}>
      {group(false)}{group(true)}
    </div>
    <button type="button" className="qc-announcement-control" aria-pressed={paused} aria-label={uiText(lang, paused ? 'resume' : 'pause')} title={uiText(lang, paused ? 'resume' : 'pause')} onClick={()=>setPaused(value=>!value)}>{paused ? <Play size={12} aria-hidden="true"/> : <Pause size={12} aria-hidden="true"/>}</button>
  </div>;
}
