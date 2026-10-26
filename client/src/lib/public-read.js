import { api } from './api.js';

const allowed = new Set(['/catalog/categories', '/store/settings']);
const cache = new Map(); // Two fixed keys; never auth, admin, prices, stock or cart.
const TTL_MS = 30000;
const aborted = () => new DOMException('Request abandoned.', 'AbortError');
function publicView(path, data) {
  if (path === '/catalog/categories') {
    if (!Array.isArray(data.categories)) throw new Error('Invalid public response.');
    return { categories: data.categories.map(category => ({ _id: category._id, slug: category.slug, name: { en: category.name?.en || '', ar: category.name?.ar || '' }, imageUrl: category.imageUrl || null })) };
  }
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('Invalid public response.');
  // The endpoint can also contain shipping/payment settings. Neither belongs
  // in a frontend cache; footer/legal consumers receive this narrow public view.
  const contact = Object.fromEntries(['whatsapp','email','instagramUrl'].filter(key => typeof data.settings.contact?.[key] === 'string').map(key => [key, data.settings.contact[key]]));
  const policies = Object.fromEntries(['shipping','refunds','privacy','terms'].map(key => [key, Object.fromEntries(['en','ar'].filter(lang => typeof data.settings.policies?.[key]?.[lang] === 'string').map(lang => [lang, data.settings.policies[key][lang]]))]));
  return { settings: { contact, policies } };
}
export function publicRead(path, { signal, force = false } = {}) {
  if (!allowed.has(path)) return Promise.reject(new Error('This endpoint cannot be cached publicly.'));
  if (signal?.aborted) return Promise.reject(aborted());
  let entry = cache.get(path);
  if (entry?.data && entry.expires > Date.now() && !force) return Promise.resolve(structuredClone(entry.data));
  if (!entry?.pending) {
    entry = { controller: new AbortController(), users: new Set(), pending: true };
    cache.set(path, entry);
    const current = entry;
    current.promise = api(path, { signal: current.controller.signal, publicRead: true }).then(data => {
      current.data = publicView(path, data); current.expires = Date.now() + TTL_MS;
      return current.data;
    }).finally(() => { current.pending = false; if (!current.data && cache.get(path) === current) cache.delete(path); });
  }
  const current = entry, user = Symbol();
  current.users.add(user);
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener('abort', onAbort); current.users.delete(user); };
    const onAbort = () => {
      cleanup(); reject(aborted());
      if (!current.users.size && current.pending) { current.controller.abort(); if (cache.get(path) === current) cache.delete(path); }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    current.promise.then(data => { cleanup(); if (!signal?.aborted) resolve(structuredClone(data)); }, error => { cleanup(); reject(error); });
  });
}
