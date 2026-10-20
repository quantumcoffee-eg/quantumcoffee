import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { useLocale } from '../lib/i18n.jsx';

export default function Hero() {
  const { t, url } = useLocale();
  const heroRef = useRef(null);
  const mediaRef = useRef(null);
  const copyRef = useRef(null);

  useEffect(() => {
    if (!heroRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    let context;
    const install = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled || !heroRef.current) return;
      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        gsap.fromTo(mediaRef.current,
          { scale: 1 },
          { scale: 1.075, ease: 'none', scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 0.65 } }
        );
        gsap.to(copyRef.current, {
          yPercent: 15, opacity: 0.28, ease: 'none',
          scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 0.65 },
        });
      }, heroRef);
    };
    install().catch((error) => { if (import.meta.env.DEV) console.warn('Hero scroll animation unavailable:', error); });
    return () => { cancelled = true; context?.revert(); };
  }, []);

  return (
    <section ref={heroRef} className="hero hero-photographic" aria-labelledby="hero-title">
      <picture className="hero-media" ref={mediaRef} aria-hidden="true">
        <source media="(max-width: 700px)" srcSet="/media/hero/quantum-hero-mobile.webp" type="image/webp" />
        <img
          className="hero-media-image"
          src="/media/hero/quantum-hero.webp"
          width="1672" height="941"
          alt="" fetchPriority="high" decoding="async"
        />
      </picture>
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-copy" ref={copyRef}>
        <div className="eyebrow hero-eyebrow">
          <span className="eyebrow-line" />{t('eyebrow')}<span className="eyebrow-line" />
        </div>
        <h1 id="hero-title">{t('heroTitleA')}<br /><em>{t('heroTitleB')}</em></h1>
        <p>{t('heroText')}</p>
        <div className="hero-cta">
          <Link className="button button-primary" to={url('/shop')}>{t('explore')} <ArrowUpRight size={17} aria-hidden="true" /></Link>
          <Link className="hero-secondary" to={url('/about')}>{t('story')}</Link>
        </div>
      </div>
      <div className="hero-bottom">
        <span>QUANTUM / 001</span>
        <a href="#categories" className="scroll-cue">{t('scroll')} <ArrowDown size={15} aria-hidden="true" /></a>
        <span className="hero-coordinates">COFFEE × CURIOSITY</span>
      </div>
    </section>
  );
}
