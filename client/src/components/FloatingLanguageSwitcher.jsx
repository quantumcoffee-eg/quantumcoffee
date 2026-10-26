import { Link } from 'react-router-dom';
import { useLocale } from '../lib/i18n.jsx';

export default function FloatingLanguageSwitcher() {
  const { lang, otherUrl } = useLocale();
  const label = lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية';

  return <Link className="qc-floating-language" to={otherUrl()} aria-label={label} title={label} dir="ltr">
    <img src={`/flags/${lang === 'en' ? 'us' : 'eg'}.svg`} width="24" height="16" alt="" aria-hidden="true" />
    <span lang="en">{lang.toUpperCase()}</span>
  </Link>;
}
