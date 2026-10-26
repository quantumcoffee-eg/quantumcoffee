import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLocale } from '../lib/i18n.jsx';
import { overviewText } from './overview-copy.js';

export default function AccountingReconciliation() {
  const { lang, url } = useLocale();
  const t = key => overviewText(lang, key);
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ status: 'idle', data: null });
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState({ status: 'loading', data: null });
    api('/admin/overview/reconciliation', { signal: controller.signal }).then(({ reconciliation }) => {
      if (!Array.isArray(reconciliation?.items) || !Number.isSafeInteger(reconciliation.issueCount)) throw new Error('Invalid reconciliation response.');
      if (!controller.signal.aborted) setState({ status: 'ready', data: reconciliation });
    }).catch(() => { if (!controller.signal.aborted) setState({ status: 'error', data: null }); });
    return () => controller.abort();
  }, [open, retry]);
  return <details className="qc-overview-panel qc-reconciliation" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('reconciliation')}</summary>
    <div aria-busy={state.status === 'loading'}>
      <p>{t('reconciliationHint')}</p>
      {state.status === 'loading' && <p role="status">{t('loadingAccounting')}</p>}
      {state.status === 'error' && <p role="alert">{t('accountingError')}</p>}
      {state.data && <>
        <p role="status">{state.data.complete ? t('reconciled') : `${state.data.issueCount} ${t('accountingIssues')}`}</p>
        {!!state.data.items.length && <ul className="qc-reconciliation-items">{state.data.items.map((item, index) => <li key={`${item.orderId}-${index}`}>
          {item.orderNumber ? <Link className="qc-overview-inline-link" to={url(`/admin?tab=orders&order=${encodeURIComponent(item.orderId)}`)}>{item.orderNumber}</Link> : <bdi>{item.orderId}</bdi>}
          <ul>{item.issues.map(code => <li key={code}>{t(code)}</li>)}</ul>
        </li>)}</ul>}
        {!state.data.complete && <p>{t('reportLimit')} {state.data.limit}.</p>}
      </>}
      {open && <button type="button" className="qc-admin-secondary" disabled={state.status === 'loading'} onClick={() => setRetry(value => value + 1)}>{t('refreshAccounting')}</button>}
      <p>{t('refundsLocked')}</p>
    </div>
  </details>;
}
