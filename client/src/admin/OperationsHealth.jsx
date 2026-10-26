import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLocale } from '../lib/i18n.jsx';
import { overviewDate } from './overview-copy.js';

import { operationsText } from './operations-copy.js';

export default function OperationsHealth() {
  const { lang } = useLocale();
  const t = key => operationsText(lang, key);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: null });
    api('/admin/overview/operations', { signal: controller.signal }).then(({ operations }) => {
      if (!operations?.email || !operations?.storage) throw new Error('Invalid health response.');
      if (!controller.signal.aborted) setState({ status: 'ready', data: operations });
    }).catch(() => { if (!controller.signal.aborted) setState({ status: 'error', data: null }); });
    return () => controller.abort();
  }, [retry]);
  return <section className="qc-overview-panel qc-operations" aria-labelledby="qc-operations-heading" aria-busy={state.status === 'loading'}>
    <div className="qc-overview-panel-head"><h3 id="qc-operations-heading">{t('title')}</h3><button type="button" className="qc-admin-secondary" onClick={() => setRetry(value => value + 1)} disabled={state.status === 'loading'}>{t('refresh')}</button></div>
    {state.status === 'loading' && <p role="status">{t('loading')}</p>}
    {state.status === 'error' && <p role="alert">{t('error')}</p>}
    {state.data && <>
      <p role="status">{t(state.data.email.mode)}</p>
      <dl className="qc-overview-secondary qc-operations-counts">{['pending','dead','uncertain','stuck'].map(key => <div key={key}><dt>{t(key)}</dt><dd><bdi>{new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG').format(state.data.email[key])}</bdi></dd></div>)}</dl>
      <dl className="qc-overview-secondary qc-operations-times">{['lastAcceptedAt','lastProcessedAt'].map(key => <div key={key}><dt>{t(key)}</dt><dd>{state.data.email[key] ? <time dateTime={state.data.email[key]}>{overviewDate(state.data.email[key], lang, true)}</time> : t('none')}</dd></div>)}</dl>
      <dl className="qc-overview-secondary qc-operations-storage">{['expiredProofIntents','unattachedProofCopies','uncertainProofCopies','expiredImageIntents','unattachedImages'].map(key => <div key={key}><dt>{t(key)}</dt><dd><bdi>{new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG').format(state.data.storage[key])}</bdi></dd></div>)}</dl>
      <p className="qc-overview-hint">{t('semantics')}</p><p className="qc-overview-hint">{t('limits')}</p>
    </>}
  </section>;
}
