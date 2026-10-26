import { useEffect } from 'react';
import { useSession } from '../lib/session.jsx';
import { preloadRoute } from '../lib/route-modules.js';

export default function NavigationIntent() {
  const { role } = useSession();
  useEffect(() => {
    const intent = event => {
      const link = event.target.closest?.('a[href]');
      if (!link || link.hasAttribute('download') || link.target === '_blank') return;
      if (event.type === 'pointerover' && (event.pointerType === 'touch' || link.contains(event.relatedTarget))) return;
      preloadRoute(link.href, role);
    };
    for (const type of ['pointerover','pointerdown','focusin']) document.addEventListener(type, intent, { passive: true });
    return () => { for (const type of ['pointerover','pointerdown','focusin']) document.removeEventListener(type, intent); };
  }, [role]);
  return null;
}
