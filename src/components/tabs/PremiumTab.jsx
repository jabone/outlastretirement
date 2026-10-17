// The Premium explainer -- the one place that says what Detailed Holdings
// is and how to get it.
//
// Why this tab exists (2026-08-20): Premium had no advertising surface at
// all. The nav item for Detailed Holdings is hidden outright from free
// users, so the only mention anywhere in the running app was a single card
// buried on Plan Settings > Initial Balances, and that card's button was
// deliberately inert -- it opened an alert reading "in development ... Not
// available to purchase yet". Meanwhile the tab it describes is finished
// and shipping. A free user had no way to learn the feature existed, and
// the one hint they might stumble on told them it wasn't ready.
//
// What this page deliberately does NOT do: show a price, show a Buy
// button, or collect an email address into a form. There is no billing
// flow behind any of that yet (see App.jsx's entitlement comment
// and PREMIUM_SETUP.md -- keys are issued by hand), and a checkout that
// doesn't charge anything is worse than no checkout at all. A waitlist
// form would need a server to post to, which cuts against the no-backend,
// no-data-collection architecture PRODUCT_STRATEGY.md Goal 2 is built on.
// So the call to action is a mailto: the user's own mail client, their own
// address book, nothing stored anywhere. It works today and it matches how
// access is actually granted.
//
// Copy lives in config/premiumOffering.js, not inline here, because the
// Plan Settings card and the Help guide describe the same product and had
// already drifted apart once.
import React from 'react';
import {
  PieChart, Lock, Mail, ShieldCheck, Link2, ArrowRight, CheckCircle2, Sparkles,
} from 'lucide-react';
import MailtoLink from '../MailtoLink';
import { useSimulation } from '../../context/useSimulation';
import { useEntitlement } from '../../context/useEntitlement';
import { isDemoModeActive } from '../../utils/demoMode';
import { useDemoEntry } from '../../context/useDemoEntry';
import {
  PREMIUM_NAME, PREMIUM_TAGLINE, PREMIUM_FEATURES, PREMIUM_AREAS,
  PREMIUM_FACTS, CONTACT_EMAIL, REQUEST_SUBJECT, REQUEST_BODY,
} from '../../config/premiumOffering';

export default function PremiumTab() {
  const { setActiveTab } = useSimulation();
  const { isPremium } = useEntitlement();
  // Above the isPremium early return: hooks cannot be conditional.
  const { startDemo, isEntering: isEnteringDemo, label: demoLabel } = useDemoEntry();

  // A subscriber who deep-links to #/premium (or clicks a stale link)
  // should not be sold something they already own. Render a short
  // acknowledgment and a way through to the real tab instead. Not a
  // redirect: bouncing the URL would make the page unreachable for the
  // person most likely to want to re-read the privacy answers below.
  if (isPremium) {
    return (
      <div className="glass-panel" style={{ padding: '28px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <CheckCircle2 size={22} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '4px' }}>Premium is active on this browser</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
            All of it is unlocked. Questions about how your data is handled are answered in Help &rarr; Guide.
          </div>
        </div>
        {/* One button per area. These are navigation, so they name where
            they land — the AREA — not the product. A single "Open
            Premium" would have nowhere honest to go now there are two. */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PREMIUM_AREAS.map((area) => (
            <button
              key={area.id}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setActiveTab(area.tab)}
            >
              Open {area.name} <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div className="glass-panel" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <PieChart size={22} style={{ color: 'var(--accent-text)' }} />
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>{PREMIUM_NAME}</h2>
          <span style={{
            fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: '999px', color: 'var(--accent-text)',
            border: '1px solid var(--accent-primary)',
          }}>
            Premium
          </span>
        </div>
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', margin: '0 0 18px', maxWidth: '760px', lineHeight: 1.6 }}>
          {PREMIUM_TAGLINE}
        </p>

        {/* The honest state of things, above the fold rather than buried. */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderRadius: '10px',
          background: 'rgba(42, 127, 122, 0.08)', border: '1px solid rgba(42, 127, 122, 0.25)', marginBottom: '18px',
        }}>
          <Lock size={16} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
            <strong>Invite-only, and free while it is.</strong> There is no checkout here and no price set.
            Everything below is built and running today &mdash; you just need an access key, which is issued by hand.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <MailtoLink
            email={CONTACT_EMAIL}
            subject={REQUEST_SUBJECT}
            body={REQUEST_BODY}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
          >
            <Mail size={15} /> Request Access
          </MailtoLink>
          {/* See-before-you-ask: loads the fictional demo household and
              lands on Detailed Holdings in read-only preview — the honest
              way to show what an access key actually buys (demoMode.js).
              Already in demo? The tab is one click away instead. */}
          {!isDemoModeActive() ? (
            <button
              type="button"
              className="btn-outline"
              onClick={() => startDemo({ landOnTab: 'portfolio' })}
              disabled={isEnteringDemo}
              aria-busy={isEnteringDemo}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', opacity: isEnteringDemo ? 0.7 : 1 }}
            >
              {isEnteringDemo ? demoLabel : 'See it with demo data'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-outline"
              onClick={() => setActiveTab('portfolio')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              Open the demo preview
            </button>
          )}
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            Opens your own email app, addressed to {CONTACT_EMAIL}. Nothing is sent from this page, and if no email app opens, the page says so.
          </span>
          <a href="/premium" className="app-disclaimer-footer-link" style={{ fontSize: 'var(--fs-xs)' }}>
            Compare Free and Premium
          </a>
        </div>
      </div>

      {/* What you get */}
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em', margin: '0 0 14px' }}>
          What it adds
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {PREMIUM_FEATURES.map((f) => (
            <div key={f.id} className="glass-panel-hover" style={{ padding: '18px', borderRadius: '10px', border: '1px solid var(--card-border)' }}>
              {/* Which area a group belongs to, now that the grid mixes two.
                  Without it "Income Floor" and "Distributions" sit side by
                  side with no hint they are different halves. */}
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                {f.areaName}
              </div>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, marginBottom: '6px' }}>{f.title}</div>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.6 }}>{f.blurb}</p>
              <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {f.points.map((p, i) => (
                  <li key={i} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* The bit that is easy to miss and is arguably the real value */}
      <div className="glass-panel" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Link2 size={17} style={{ color: 'var(--accent-text)' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>It feeds the plan you already have</h3>
        </div>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6, maxWidth: '760px' }}>
          This is not a second app bolted on the side. Fields you type in by hand today can instead be driven by
          what Premium already knows, and they stay in step on their own:
        </p>
        {/* Per area, because the two have different linked fields and
            attributing one area's to both would be a small lie on the page
            most likely to be checked against reality. */}
        {PREMIUM_AREAS.filter((area) => area.linkedFields.length > 0).map((area) => (
          <div key={area.id} style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
              From {area.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {area.linkedFields.map((f) => (
                <span key={f} style={{
                  fontSize: 'var(--fs-xs)', padding: '5px 10px', borderRadius: '999px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)',
                }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        ))}
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '12px 0 0', lineHeight: 1.6, maxWidth: '760px' }}>
          Linking is reversible. Unlink any of them at any time and the field goes back to being editable by
          hand &mdash; your underlying data is untouched either way. That also means an access key lapsing never
          strands your plan: those fields simply return to manual entry.
        </p>
      </div>

      {/* Straight answers */}
      <div className="glass-panel" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <ShieldCheck size={17} style={{ color: 'var(--success)' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Straight answers</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {PREMIUM_FACTS.map((f) => (
            <div key={f.q}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: '3px' }}>{f.q}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '820px' }}>{f.a}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Closing CTA -- repeated because the page is long enough that the
          header button has scrolled away by the time someone is convinced. */}
      <div className="glass-panel" style={{ padding: '22px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <Sparkles size={18} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
        <div style={{ flex: '1 1 300px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Want it? Send a note saying roughly what you are tracking and I will get back to you.
        </div>
        <MailtoLink
          email={CONTACT_EMAIL}
          subject={REQUEST_SUBJECT}
          body={REQUEST_BODY}
          className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          <Mail size={15} /> Request Access
        </MailtoLink>
      </div>
    </div>
  );
}
