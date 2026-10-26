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
    if (!heroRef.current) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cancelled = false;
    let context, started = false, generation = 0;
    const install = async ticket => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled || preference.matches || ticket !== generation || !heroRef.current) return;
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
    // A stationary hero needs no scroll engine. Keep the approved tweens, but
    // request their modules only after genuine scroll/scroll-key intent.
    const detach = () => { for (const event of ['wheel','touchmove','scroll','keydown']) window.removeEventListener(event, intent); };
    const attach = () => { if (!preference.matches) for (const event of ['wheel','touchmove','scroll','keydown']) window.addEventListener(event, intent, { passive:true }); };
    const intent = event => {
      if (started || preference.matches) return;
      if (event.type === 'keydown' && (!['ArrowDown','ArrowUp','PageDown','PageUp',' ','Home','End'].includes(event.key) || event.target.closest?.('input,textarea,select,[contenteditable=true]'))) return;
      started = true; detach(); const ticket = ++generation;
      void install(ticket).catch(error => { if (import.meta.env.DEV) console.warn('Hero scroll animation unavailable:', error); });
    };
    const motionChanged = () => { generation++; context?.revert(); context = undefined; started = false; detach(); attach(); };
    attach(); preference.addEventListener('change', motionChanged);
    return () => { cancelled = true; generation++; detach(); preference.removeEventListener('change', motionChanged); context?.revert(); };
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
