import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// New pages start at the top; Back/Forward restores each history entry. Query-only
// filter changes keep their depth. One owner prevents native restoration races.
export default function NavigationEffects() {
  const { key, pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map());
  const previous = useRef(null);
  useLayoutEffect(() => {
    const main = document.querySelector('main');
    if (main) { main.id = 'main-content'; main.tabIndex = -1; }
    const saved = positions.current.get(key);
    if (navigationType === 'POP' && saved) {
      window.scrollTo({ ...saved, behavior: 'instant' });
    } else if (hash) {
      let id = hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* Invalid URL encoding: treat hash literally. */ }
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
      else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } else if (!previous.current || previous.current.pathname !== pathname || previous.current.hash !== hash) {
      const clearingAnchor = previous.current?.pathname === pathname && previous.current.hash && navigationType === 'PUSH';
      const smooth = clearingAnchor && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, left: 0, behavior: smooth ? 'smooth' : 'instant' });
    }
    previous.current = { pathname, hash };
    let position = { top: window.scrollY, left: window.scrollX };
    const remember = () => { position = { top: window.scrollY, left: window.scrollX }; };
    window.addEventListener('scroll', remember, { passive: true });
    return () => {
      window.removeEventListener('scroll', remember);
      positions.current.set(key, position);
      // Bound long browsing sessions without storing anything in localStorage.
      if (positions.current.size > 100) positions.current.delete(positions.current.keys().next().value);
    };
  }, [key, pathname, hash, navigationType]);
  return null;
}
