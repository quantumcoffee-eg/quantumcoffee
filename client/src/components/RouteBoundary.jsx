import { Component } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLocale } from '../lib/i18n.jsx';
import { uiText } from '../lib/ui-copy.js';

export function RouteLoading({ panel = false }) {
  const { lang } = useLocale();
  const content = <div className="qc-route-loading" role="status" aria-live="polite">{uiText(lang, 'loading')}</div>;
  return panel ? content : <main id="main-content" tabIndex={-1} className="qc-route-placeholder" aria-busy="true">{content}</main>;
}
class Boundary extends Component {
  state = { error: false, routeKey: this.props.routeKey };
  static getDerivedStateFromProps(props, state) { return props.routeKey !== state.routeKey ? { error: false, routeKey: props.routeKey } : null; }
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? this.props.fallback : this.props.children; }
}
// Reset on navigation, without automatically retrying a cached failed chunk or
// looping reloads after a deployment. Recovery is an explicit user action.
export default function RouteBoundary({ children, panel = false }) {
  const { key } = useLocation(), { lang, url } = useLocale();
  const Heading = panel ? 'h2' : 'h1';
  const content = <div className="qc-route-error" role="alert"><Heading>{uiText(lang, 'failed')}</Heading><p>{uiText(lang, 'failedHint')}</p>
    <button type="button" className="button button-dark" onClick={() => window.location.reload()}>{uiText(lang, 'refresh')}</button><Link to={url('/')}>{uiText(lang, 'home')}</Link></div>;
  return <Boundary routeKey={key} fallback={panel ? content : <main id="main-content" tabIndex={-1} className="qc-route-placeholder">{content}</main>}>{children}</Boundary>;
}
