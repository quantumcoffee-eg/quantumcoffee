import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';
import { useLocale } from '../lib/i18n.jsx';
import { preparationName } from '../lib/grinds.js';
import { overviewText, overviewMoney, overviewDate } from './overview-copy.js';
import { MetricCard, StatusPill, RevenueChart } from './OverviewWidgets.jsx';
import './admin-overview.css';

const periods = ['today', '7d', '30d', '90d'];
export default function AdminOverview() {
  const { lang, url } = useLocale();
  const [params, setParams] = useSearchParams();
  const range = periods.includes(params.get('range')) ? params.get('range') : '30d';
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const t = key => overviewText(lang, key);
  const money = value => overviewMoney(value, lang);
  const number = value => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG').format(value);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null });
    api(`/admin/overview?range=${range}`, { signal: controller.signal }).then(result => {
      if (!result.overview?.series?.length) throw new Error('Invalid overview response.');
      if (!controller.signal.aborted) setState({ status: 'ready', data: result.overview, error: null });
    }).catch(error => { if (!controller.signal.aborted) setState({ status: 'error', data: null, error }); });
    return () => controller.abort();
  }, [range, retry]);
  const data = state.data;
  const productLink = id => url(`/admin?tab=products&product=${encodeURIComponent(id)}`);
  const changeRange = value => { const next = new URLSearchParams(params); next.set('tab', 'overview'); next.set('range', value); setParams(next); };
  const attention = [
    ['paymentReviews', '/admin?tab=orders&queue=payment_reviews'], ['confirmation', '/admin?tab=orders&queue=confirmation'],
    ['packingShipping', '/admin?tab=orders&queue=packing_shipping'], ['unpaidDigital', '/admin?tab=orders&queue=unpaid_digital'],
    ['lowStock', '/admin?tab=overview#inventory-alerts'], ['draftProducts', '/admin?tab=products&status=draft'],
  ];
  return <section className="qc-overview" aria-labelledby="qc-overview-title" aria-busy={state.status === 'loading'}>
    <div className="qc-overview-heading"><div><h2 id="qc-overview-title">{t('overview')}</h2><p>{t('subtitle')}</p></div>
      <div className="qc-overview-tools"><div className="qc-overview-periods" role="group" aria-label={t('period')}>{periods.map(period => <button key={period} type="button" aria-pressed={range === period} onClick={() => changeRange(period)}>{t(period)}</button>)}</div><button type="button" className="qc-overview-refresh" aria-label={t('refresh')} title={t('refresh')} disabled={state.status === 'loading'} onClick={() => setRetry(value => value + 1)}><RefreshCw size={17} aria-hidden="true" /></button></div>
    </div>
    {state.status === 'loading' && <div className="qc-overview-loading" role="status"><p>{t('loading')}</p><div aria-hidden="true" className="qc-overview-skeleton"><span/><span/><span/><span/></div></div>}
    {state.status === 'error' && <div className="qc-overview-error" role="alert"><h3>{t('error')}</h3><p>{[401, 403].includes(state.error?.status) ? t('access') : state.error?.message}</p><button className="qc-admin-secondary" type="button" onClick={() => setRetry(value => value + 1)}>{t('retry')}</button></div>}
    {data && <>
      <p className="qc-overview-updated">{t('updated')} <time dateTime={data.calculatedAt}>{overviewDate(data.calculatedAt, lang, true)}</time> · {t('cairo')}</p>
      <div className="qc-overview-metrics">
        <MetricCard prominent label={t('revenue')} value={money(data.financial.collectedPiastres)} hint={t('gross')}/>
        <MetricCard label={t('orders')} value={number(data.metrics.totalOrders)} hint={t('placed')}/>
        <MetricCard label={t('products')} value={number(data.metrics.totalProducts)} hint={t('current')}/>
        <MetricCard label={t('categories')} value={number(data.metrics.totalCategories)} hint={`${number(data.metrics.activeCategories)} ${t('activeCategories')}`}/>
      </div>
      <dl className="qc-overview-secondary">
        {[[t('average'), money(data.financial.averageOrderValuePiastres)], [t('reviews'), number(data.metrics.pendingPaymentReviews)], [t('fulfillment'), number(data.metrics.awaitingFulfillment)], [t('drafts'), number(data.metrics.draftProducts)], [t('published'), number(data.metrics.publishedProducts)], [t('low'), number(data.lowStock.total)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>)}
      </dl>
      <p className="qc-overview-definition">{t('averageHint')} {t('paid')}: {number(data.financial.paidOrders)}.</p>
      <div className="qc-overview-top-grid">
        <section className="qc-overview-panel" aria-labelledby="qc-revenue-heading"><div className="qc-overview-panel-head"><div><h3 id="qc-revenue-heading">{t('chart')}</h3><p>{t('gross')}</p></div><span className="qc-overview-range-label">{t(range)}</span></div><RevenueChart series={data.series} lang={lang}/></section>
        <section className="qc-overview-panel" aria-labelledby="qc-attention-heading"><div className="qc-overview-panel-head"><div><h3 id="qc-attention-heading">{t('attention')}</h3><p>{t('now')}</p></div></div><div className="qc-overview-attention">{attention.map(([key, path]) => <Link key={key} to={url(path)}><span>{t(key)}</span><strong>{number(data.attention[key])}</strong><ArrowUpRight size={15} aria-hidden="true"/></Link>)}</div></section>
      </div>
      <section className="qc-overview-panel" aria-labelledby="qc-recent-heading"><div className="qc-overview-panel-head"><div><h3 id="qc-recent-heading">{t('recent')}</h3><p>{t('recentHint')}</p></div><Link className="qc-overview-inline-link" to={url('/admin?tab=orders')}>{t('allOrders')} <ArrowUpRight size={15} aria-hidden="true"/></Link></div>
        {!data.recentOrders.length ? <div className="qc-overview-empty"><h4>{t('noOrders')}</h4><p>{t('noOrdersHint')}</p></div> : <div className="qc-overview-table-scroll"><table><caption className="qc-announcement-sr-only">{t('recent')}</caption><thead><tr>{['order','date','amount','payment','fulfillmentStatus','details'].map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead><tbody>{data.recentOrders.map(order => <tr key={order.id}><th scope="row"><bdi>{order.orderNumber}</bdi></th><td><time dateTime={order.createdAt}>{overviewDate(order.createdAt, lang)}</time></td><td><bdi>{money(order.totalPiastres)}</bdi></td><td><StatusPill value={order.paymentState} lang={lang}/></td><td><StatusPill value={order.fulfillmentState} lang={lang}/></td><td><Link className="qc-overview-inline-link" to={url(`/admin?tab=orders&order=${order.id}`)} aria-label={`${t('details')} ${order.orderNumber}`}>{t('details')} <ArrowUpRight size={14} aria-hidden="true"/></Link></td></tr>)}</tbody></table></div>}
      </section>
      <div className="qc-overview-bottom-grid">
        <section className="qc-overview-panel" aria-labelledby="qc-best-heading"><div className="qc-overview-panel-head"><div><h3 id="qc-best-heading">{t('best')}</h3><p>{t('bestHint')}</p></div></div>{!data.bestSellers.length ? <div className="qc-overview-empty"><h4>{t('noSales')}</h4></div> : <ol className="qc-overview-insights">{data.bestSellers.map(item => <li key={item.productId}><Link to={productLink(item.productId)}><span>{item.name[lang] || item.name.en}<small title={t('merchandise')}>{money(item.merchandisePiastres)}</small></span><strong>{number(item.units)} <small>{t('units')}</small></strong><ArrowUpRight size={15} aria-hidden="true"/></Link></li>)}</ol>}</section>
        <section className="qc-overview-panel" id="inventory-alerts" aria-labelledby="qc-inventory-heading"><div className="qc-overview-panel-head"><div><h3 id="qc-inventory-heading">{t('inventory')}</h3><p>{t('threshold')}</p></div></div>{!data.lowStock.items.length ? <div className="qc-overview-empty"><h4>{t('noLow')}</h4><p>{t('draftHint')}</p></div> : <ul className="qc-overview-insights">{data.lowStock.items.map(item => <li key={`${item.productId}-${item.sizeGrams}-${item.grindCode}`}><Link to={productLink(item.productId)} aria-label={`${t('manage')}: ${item.name[lang] || item.name.en}, ${item.sizeGrams}g, ${preparationName(item.grindCode,lang)}`}><span>{item.name[lang] || item.name.en}<small><bdi>{item.sizeGrams}g</bdi> · {preparationName(item.grindCode,lang)}</small></span><strong>{number(item.stockQuantity)} <small>{t('stock')}</small></strong><ArrowUpRight size={15} aria-hidden="true"/></Link></li>)}</ul>}{data.lowStock.total > 8 && <p className="qc-overview-hint">{number(data.lowStock.items.length)} / {number(data.lowStock.total)}</p>}</section>
      </div>
      <aside className="qc-overview-disclosure"><p>{t('refunds')}</p>{data.financial.missingCollectionEvents > 0 && <p>{number(data.financial.missingCollectionEvents)} {t('missing')}</p>}</aside>
    </>}
  </section>;
}
