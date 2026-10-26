import { useState } from 'react';
import { Coffee } from 'lucide-react';

// Reserve layout in the existing media container; never substitute a fake photo
// or repeatedly request another URL when owner media is missing or unavailable.
export default function SafeImage({ src, alt = '', iconSize = 54, ...props }) {
  const [failed, setFailed] = useState(null);
  if (!src || failed === src) return <span className="qc-image-fallback" role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={!alt || undefined}><Coffee size={iconSize} strokeWidth={1} aria-hidden="true"/></span>;
  return <img {...props} src={src} alt={alt} decoding="async" onError={() => setFailed(src)}/>;
}
