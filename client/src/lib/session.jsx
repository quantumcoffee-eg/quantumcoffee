import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';

const Session = createContext(null);
export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const sequence = useRef(0), activeRead = useRef(null);
  const invalidateRead = useCallback(() => { sequence.current++; activeRead.current?.abort(); activeRead.current = null; }, []);
  const refresh = useCallback(async ({ signal } = {}) => {
    const revision = ++sequence.current;
    activeRead.current?.abort();
    const controller = new AbortController(); activeRead.current = controller;
    const abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    setStatus('loading');
    setError('');
    try {
      const result = await api('/auth/me', { signal: controller.signal });
      if (controller.signal.aborted || sequence.current !== revision) return;
      setUser(result.user);
      setStatus('ready');
    } catch (e) {
      if (controller.signal.aborted || sequence.current !== revision) return;
      setUser(null); // Fail closed: never retain stale admin/customer privileges.
      setError(e.message);
      setStatus('error');
    } finally { signal?.removeEventListener('abort', abort); if(activeRead.current === controller) activeRead.current = null; }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh({ signal: controller.signal });
    return () => controller.abort();
  }, [refresh]);
  const login = useCallback(async (payload) => {
    const result = await api('/auth/login', { method: 'POST', body: payload });
    invalidateRead();
    setUser(result.user); setError(''); setStatus('ready'); return result.user;
  }, [invalidateRead]);
  const register = useCallback(async (payload) => {
    const result = await api('/auth/register', { method: 'POST', body: payload });
    // Registration returns a pending verification result, NOT a login session.
    return result;
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    invalidateRead();
    setUser(null); setError(''); setStatus('ready');
  }, [invalidateRead]);
  const value = useMemo(() => ({
    user, role: user?.role || 'guest', status, error, ready: status !== 'loading',
    refresh, login, register, logout,
  }), [user, status, error, refresh, login, register, logout]);
  return <Session.Provider value={value}>{children}</Session.Provider>;
}
export function useSession() {
  const session = useContext(Session);
  if (!session) throw new Error('SessionProvider missing');
  return session;
}
