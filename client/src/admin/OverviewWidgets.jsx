import { useId } from 'react';
import { overviewText, overviewDate, overviewMoney } from './overview-copy.js';

export function MetricCard({ label, value, hint, prominent = false }) {
  return <article className={`qc-overview-metric${prominent ? ' is-prominent' : ''}`} aria-label={label}>
    <h3>{label}</h3><p className="qc-overview-value"><bdi>{value}</bdi></p><p className="qc-overview-hint">{hint}</p>
  </article>;
}
export function StatusPill({ value, lang }) {
  return <span className={`qc-overview-status is-${value}`}>{overviewText(lang, value === 'paid' ? 'paidState' : value)}</span>;
}
export function RevenueChart({ series, lang }) {
  const id = useId();
  const t = key => overviewText(lang, key);
  const maximum = Math.max(1, ...series.map(point => point.collectedPiastres));
  const hasRevenue = series.some(point => point.collectedPiastres > 0);
  const points = series.map((point, i) => ({ x: series.length === 1 ? 360 : i * 720 / (series.length - 1), y: 164 - point.collectedPiastres / maximum * 140 }));
  const path = points.map((point, i) => `${i ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  return <figure className="qc-revenue-figure">
    <div className="qc-revenue-plot" dir="ltr">
      <div className="qc-revenue-axis" aria-hidden="true"><span>{overviewMoney(hasRevenue ? maximum : 0, lang)}</span><span>{overviewMoney(hasRevenue ? Math.round(maximum / 2) : 0, lang)}</span><span>{overviewMoney(0, lang)}</span></div>
      <div className="qc-revenue-canvas">
        <svg viewBox="0 0 720 180" preserveAspectRatio="none" role="img" aria-labelledby={id}>
          <title id={id}>{t('chart')} — {hasRevenue ? t('gross') : t('noRevenue')}</title>
          {[24, 94, 164].map(y => <path key={y} d={`M0 ${y}H720`} className="qc-revenue-grid" vectorEffect="non-scaling-stroke" />)}
          <path d={hasRevenue ? path : 'M0 164H720'} className="qc-revenue-line" vectorEffect="non-scaling-stroke" />
          {series.length === 1 && hasRevenue && <circle cx="360" cy={points[0].y} r="3" fill="currentColor" />}
        </svg>
        {!hasRevenue && <div className="qc-revenue-empty"><strong>{t('noRevenue')}</strong><span>{t('noRevenueHint')}</span></div>}
      </div>
    </div>
    <figcaption className="qc-revenue-dates" dir="ltr"><span>{overviewDate(series[0].date, lang)}</span><span>{overviewDate(series.at(-1).date, lang)}</span></figcaption>
    <details className="qc-overview-daily"><summary>{t('daily')}</summary><div className="qc-overview-table-scroll" tabIndex={0} role="region" aria-label={t('daily')}><table><caption className="qc-announcement-sr-only">{t('chart')}</caption><thead><tr><th scope="col">{t('date')}</th><th scope="col">{t('revenue')}</th><th scope="col">{t('paid')}</th></tr></thead><tbody>{series.map(point => <tr key={point.date}><th scope="row">{overviewDate(point.date, lang)}</th><td><bdi>{overviewMoney(point.collectedPiastres, lang)}</bdi></td><td>{point.paidOrders}</td></tr>)}</tbody></table></div></details>
  </figure>;
}
