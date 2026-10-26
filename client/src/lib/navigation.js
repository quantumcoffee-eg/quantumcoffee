import { isCurrentPath } from './navigation-values.mjs';

// Keep native modified-click/new-tab behavior. Re-selecting the same clean
// route scrolls without adding a duplicate history entry or rerunning filters.
export function handleSamePageClick(event, location, target) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!isCurrentPath(location.pathname, target)) return;
  // Removing a fragment is handled by NavigationEffects after the router commit.
  if (location.hash) return;
  if (!location.search) event.preventDefault();
  window.scrollTo({ top: 0, left: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
