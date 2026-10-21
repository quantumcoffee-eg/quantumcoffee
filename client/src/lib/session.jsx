import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const Session = createContext(null);
export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const refresh = useCallback(async ({ signal } = {}) => {
    setStatus('loading');
    setError('');
    try {
      const result = await api('/auth/me', { signal });
      if (signal?.aborted) return;
      setUser(result.user);
      setStatus('ready');
    } catch (e) {
      if (signal?.aborted) return;
      setUser(null); // Fail closed: never retain stale admin/customer privileges.
      setError(e.message);
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh({ signal: controller.signal });
    return () => controller.abort();
  }, [refresh]);
  const login = useCallback(async (payload) => {
    const result = await api('/auth/login', { method: 'POST', body: payload });
    setUser(result.user); setError(''); setStatus('ready'); return result.user;
  }, []);
  const register = useCallback(async (payload) => {
    const result = await api('/auth/register', { method: 'POST', body: payload });
    // Registration returns a pending verification result, NOT a login session.
    return result;
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null); setError(''); setStatus('ready');
  }, []);
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
