// Used by the language switch so product slugs, shop filters, admin tabs and
// page fragments survive switching between English and Arabic.
export function localizedPath(pathname, search = '', hash = '', destinationLanguage = 'en') {
  const cleanPath = typeof pathname === 'string' && pathname.startsWith('/') ? pathname : '/';
  const noLanguage = cleanPath.replace(/^\/ar(?=\/|$)/, '') || '/';
  const local = destinationLanguage === 'ar' ? `/ar${noLanguage === '/' ? '' : noLanguage}` : noLanguage;
  const safeSearch = typeof search === 'string' && search.startsWith('?') ? search : '';
  const safeHash = typeof hash === 'string' && hash.startsWith('#') ? hash : '';
  return `${local}${safeSearch}${safeHash}`;
}
export function isCurrentPath(pathname, target) {
  const strip = path => path.length > 1 ? path.replace(/\/+$/, '') : path;
  return strip(pathname) === strip(target);
}
