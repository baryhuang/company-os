import { useState, useEffect, useCallback } from 'react';
import './executive-report.css';

const SLIDES = [
  { title: 'Cover', render: SlideCover },
  { title: 'Timeline', render: SlideTimeline },
  { title: '\u2460 Market Selection', render: SlideMarket },
  { title: '\u2461 Product Scope', render: SlideProduct },
  { title: '\u2462 Business Model', render: SlideBizModel },
  { title: '\u2463 Org Structure', render: SlideOrg },
  { title: '\u2464 GTM Strategy', render: SlideGTM },
  { title: '\u2465 Messaging', render: SlideMessaging },
  { title: '\u2465+ Pitch Coaching', render: SlidePitch },
  { title: '\u2466 Moat', render: SlideMoat },
  { title: '\u2467 People', render: SlidePeople },
  { title: '\u2468 Competitor Evolution', render: SlideCompetitor },
  { title: 'Vision Summary', render: SlideVision },
];

export function ExecutiveReport() {
  const [current, setCurrent] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const total = SLIDES.length;

  const go = useCallback((dir: number) => {
    setCurrent(prev => {
      const n = prev + dir;
      return n >= 0 && n < total ? n : prev;
    });
  }, [total]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(-1); }
      if (e.key === 'Escape') setTocOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [go]);

  const SlideComponent = SLIDES[current].render;

  return (
    <div className="exec-report">
      <div className="progress" style={{ width: `${((current + 1) / total) * 100}%` }} />

      <button className="toc-toggle" onClick={() => setTocOpen(!tocOpen)}>{'\u2630'}</button>
      <div className={`toc${tocOpen ? ' open' : ''}`}>
        {SLIDES.map((s, i) => (
          <div
            key={i}
            className={`toc-item${i === current ? ' active' : ''}`}
            onClick={() => { setCurrent(i); setTocOpen(false); }}
          >
            <span className="num">{i + 1}</span> {s.title}
          </div>
        ))}
      </div>

      <div className="deck">
        <div className="slide active">
          <SlideComponent />
        </div>
      </div>

      <div className="nav">
        <button onClick={() => go(-1)} disabled={current === 0}>{'\u2039'}</button>
        <span className="counter">{current + 1} / {total}</span>
        <button onClick={() => go(1)} disabled={current === total - 1}>{'\u203A'}</button>
      </div>
    </div>
  );
}

/* ── SLIDE COMPONENTS ─────────────────────────── */

function SlideCover() {
  return (
    <div className="title-slide-content">
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand)', marginBottom: 16 }}>{'\u2764\uFE0F'} Company OS</div>
        <h1><span className="brand">Company OS</span> Vision &amp;<br />Roadmap Evolution</h1>
        <p className="subtitle" style={{ maxWidth: 560, margin: '16px auto 0' }}>Feb 23 {'\u2013'} Mar 5, 2026 {'\u00b7'} 8 Decision Dimensions {'\u00b7'} 10-Day Strategic Sprint</p>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28 }}>
        <StatCard num="8" label="Dimensions" />
        <StatCard num="10" label="Day Sprint" />
        <StatCard num="15+" label="Transcripts" />
        <StatCard num="4" label="Competitive Stages" />
      </div>
      <div style={{ marginTop: 32, fontSize: 12, color: 'var(--text3)' }}>{'\u2190 \u2192'} Navigate {'\u00b7'} Press {'\u2630'} for TOC</div>
    </div>
  );
}

function SlideTimeline() {
  return (
    <>
      <div className="dim-label">Timeline</div>
      <h2>10-Day Decision Path</h2>
      <div className="timeline" style={{ margin: '20px 0' }}>
        <TLItem date="Feb 23" label="Start\nHealthcare" />
        <TLItem date="Feb 24" label="Josh+Ron\nAdvisory" />
        <TLItem date="Feb 25" label="Jim triggers\nHybrid Model" />
        <TLItem date="Feb 26" label="Sue joins\n$2000 pricing" />
        <TLItem date="Feb 27" label="Anna expands\nFull Pathway" />
        <TLItem date="Feb 28" label="Steve joins\nContent validation" />
        <TLItem date="Mar 3" label="Three-phase Roadmap\nPitch Coaching" highlight />
        <TLItem date="Mar 4" label="Care Provider\nOS positioning" highlight />
        <TLItem date="Mar 5" label="Final Pitch\nFinalized" highlight />
      </div>
      <div className="grid3" style={{ marginTop: 20 }}>
        <div className="card accent"><h3>Phase 1 (Feb 23-28)</h3><p>Fast validation & elimination: Engineering/Sales {'\u2192'} Healthcare {'\u2192'} LTC {'\u2192'} CNA {'\u2192'} Full Pathway. Key experts Sue/Anna/Steve join.</p></div>
        <div className="card green"><h3>Inflection (Mar 3)</h3><p>Three-phase Roadmap crystallizes, three-tier business model confirmed, Techstars Pitch Coaching launches Super Mario framework.</p></div>
        <div className="card purple"><h3>Convergence (Mar 4-5)</h3><p>Care Provider positioning lands, Healthcare vs Care distinction, Strategic Narrative Workshop, Final Elevator Pitch.</p></div>
      </div>
    </>
  );
}

function SlideMarket() {
  return (
    <>
      <div className="dim-label">Dimension 1</div>
      <h2>Market Selection {'\u2014'} Where to Play</h2>
      <div className="flow" style={{ margin: '12px 0 20px' }}>
        <FlowNode status="origin" label="AI Training Platform" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="abandoned" label="Engineering" />
        <FlowNode status="abandoned" label="Sales" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="chosen" label="Healthcare" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="abandoned" label="Hospital" />
        <FlowNode status="partial" label="Home Care" />
        <FlowNode status="chosen" label="LTC" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="final" label="Care Provider" />
      </div>
      <div className="grid2">
        <div>
          <h3>Why Healthcare?</h3>
          <div className="quote" style={{ marginBottom: 12 }}>Massive market, little tech, nice people {'\u2014'} <span className="speaker">Klein Galland:</span> &ldquo;They have no AI to buy because no one make AI for long term care and we are the one.&rdquo;</div>
          <h3 style={{ marginTop: 14 }}>Elimination Logic</h3>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.9 }}>
            <span className="badge red">Engineering</span> Shrinking market, AI displacement fear<br />
            <span className="badge red">Sales</span> Culture mismatch, 3-4 competitors ahead<br />
            <span className="badge red">Hospital</span> Doctor-dominated, pharma/insurance complexity<br />
            <span className="badge orange">Home Care</span> HCA 35hr entry, high volume but low price point
          </div>
        </div>
        <div>
          <div className="card accent" style={{ marginBottom: 14 }}>
            <h3>Final Definition: Care Provider</h3>
            <p>&ldquo;Person-to-person care&rdquo; {'\u2014'} private sector, venture-scalable</p>
            <div className="quote" style={{ marginTop: 8 }}><span className="speaker">Barry:</span> Healthcare vs care distinction is critical for competition analysis</div>
          </div>
          <div className="card green">
            <h3>Key Insight</h3>
            <p>&ldquo;Healthcare is too broad&rdquo; {'\u2014'} Excluding pharma, insurance, hospital lands precisely on person-to-person direct care</p>
          </div>
        </div>
      </div>
    </>
  );
}

function SlideProduct() {
  return (
    <>
      <div className="dim-label">Dimension 2</div>
      <h2>Product Scope {'\u2014'} Three-Phase Roadmap</h2>
      <div className="flow" style={{ marginBottom: 18 }}>
        <FlowNode status="abandoned" label="CNA Only" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="chosen" label="Full Nursing Pathway" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="final" label="Three-Phase Roadmap" />
      </div>
      <div className="grid3">
        <div className="card" style={{ borderTop: '3px solid var(--green)', borderLeft: 'none' }}>
          <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginBottom: 4 }}>PHASE 1 {'\u00b7'} 2026</div>
          <h3>Training Capacity</h3>
          <p>AI Content Factory + CNA + ESL differentiation</p>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            {'\u00b7'} 6000+ violation scenarios<br />
            {'\u00b7'} ESL support {'\u2014'} universally exciting feature<br />
            {'\u00b7'} Chinese first {'\u2192'} Spanish/Filipino<br />
            {'\u00b7'} Volume: 500 {'\u00d7'} $2,000 = $1M ARR
          </div>
        </div>
        <div className="card" style={{ borderTop: '3px solid var(--orange)', borderLeft: 'none' }}>
          <div style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600, marginBottom: 4 }}>PHASE 2 {'\u00b7'} 2027-2028</div>
          <h3>Quality & Assessment</h3>
          <p>Standardized competency assessment + data collection</p>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            {'\u00b7'} LPN {'\u2192'} RN {'\u2192'} NP/DNP pathway<br />
            {'\u00b7'} Competency assessment standardization<br />
            {'\u00b7'} Training data accumulation {'\u2192'} AI Brain<br />
            {'\u00b7'} Enterprise license scale
          </div>
        </div>
        <div className="card" style={{ borderTop: '3px solid var(--teal)', borderLeft: 'none' }}>
          <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600, marginBottom: 4 }}>PHASE 3 {'\u00b7'} ~2031 Ultimate</div>
          <h3>Care Workforce OS</h3>
          <p>Human + AI + Robotics</p>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            {'\u00b7'} <span style={{ color: 'var(--green)' }}>Human:</span> relationship, empathy, ethics<br />
            {'\u00b7'} <span style={{ color: 'var(--teal)' }}>AI:</span> cognitive, monitoring, early warning<br />
            {'\u00b7'} <span style={{ color: 'var(--purple)' }}>Robotics:</span> physical execution, lifting, vitals
          </div>
        </div>
      </div>
      <div className="quote" style={{ marginTop: 14 }}><span className="speaker">Bary:</span> Maximum hype reached. Can go up to Human+AI part, but not beyond. Robotics is 2-10 years out.</div>
    </>
  );
}

function SlideBizModel() {
  return (
    <>
      <div className="dim-label">Dimension 3</div>
      <h2>Business Model {'\u2014'} NOT SaaS</h2>
      <div className="flow" style={{ marginBottom: 16 }}>
        <FlowNode status="abandoned" label="SaaS" />
        <FlowNode status="abandoned" label="Pure B2C" />
        <FlowNode status="partial" label="Facility-funded" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="final" label="Three-tier Revenue" />
      </div>
      <div className="quote" style={{ marginBottom: 16 }}><span className="speaker">Bary:</span> SaaS is dead now, everyone has killed SaaS</div>
      <div className="grid3">
        <div className="card accent">
          <span className="badge cyan" style={{ marginBottom: 8, display: 'inline-block' }}>TIER 1 {'\u00b7'} In-house</span>
          <h3>In-house Training</h3>
          <p>Run own program<br /><span style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>$2,000</span>/person</p>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>CNA market rate $800-2,500<br />30 per cohort, 10 first year</div>
        </div>
        <div className="card green">
          <span className="badge green" style={{ marginBottom: 8, display: 'inline-block' }}>TIER 2 {'\u00b7'} License</span>
          <h3>Enterprise License</h3>
          <p>Usage-based AI training license</p>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>Per-use pricing, NOT SaaS subscription<br />Facilities buy AI training capacity</div>
        </div>
        <div className="card orange">
          <span className="badge orange" style={{ marginBottom: 8, display: 'inline-block' }}>TIER 3 {'\u00b7'} Continuous</span>
          <h3>Continuous Training</h3>
          <p>Incumbent caregiver retraining</p>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>Continuing education subscription<br />Recurring revenue base</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16, textAlign: 'center', background: 'var(--green-light)', borderColor: 'var(--green)' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>GTM Math: <span style={{ color: 'var(--green)', fontWeight: 800, fontSize: 18 }}>500 {'\u00d7'} $2,000 = $1M ARR</span></div>
      </div>
    </>
  );
}

function SlideOrg() {
  return (
    <>
      <div className="dim-label">Dimension 4</div>
      <h2>Org Structure {'\u2014'} Hybrid Model</h2>
      <div className="flow" style={{ marginBottom: 20 }}>
        <FlowNode status="abandoned" label="Pure For-profit" />
        <FlowNode status="abandoned" label="Pure Nonprofit" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="final" label="Hybrid Model" />
      </div>
      <div className="grid3">
        <div className="card accent">
          <h3 style={{ color: 'var(--teal)' }}>Parent Company</h3>
          <span className="badge blue" style={{ marginBottom: 8, display: 'inline-block' }}>For-profit {'\u00b7'} Fundraising entity</span>
          <p>AI Training System<br />LMS Platform<br />Scenario Library<br />IP & Data Assets</p>
        </div>
        <div className="card green">
          <h3 style={{ color: 'var(--green)' }}>{'\u2764\uFE0F'} Company OS</h3>
          <span className="badge green" style={{ marginBottom: 8, display: 'inline-block' }}>Brand</span>
          <p>Healthcare market brand<br />Healthcare rebrand<br />Care Provider positioning carrier</p>
        </div>
        <div className="card purple">
          <h3 style={{ color: 'var(--purple)' }}>MojoAcademy</h3>
          <span className="badge purple" style={{ marginBottom: 8, display: 'inline-block' }}>501(c)(3) Nonprofit</span>
          <p>Operates nursing school<br />Government funding/donations<br />Entity ready by April</p>
        </div>
      </div>
      <div className="quote" style={{ marginTop: 16 }}><span className="speaker">Bary:</span> School is nonprofit, company is for-profit corporation, school is nonprofit {'\u2014'} like Klein Galland</div>
    </>
  );
}

function SlideGTM() {
  return (
    <>
      <div className="dim-label">Dimension 5</div>
      <h2>GTM Strategy {'\u2014'} Partner Model</h2>
      <div className="flow" style={{ marginBottom: 20 }}>
        <FlowNode status="abandoned" label="Direct B2C" />
        <FlowNode status="partial" label="B2B2C via Facilities" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="final" label="Partner Model" />
      </div>
      <div className="grid4">
        <div className="card" style={{ borderTop: '3px solid var(--blue)', borderLeft: 'none' }}>
          <h3 style={{ fontSize: 13 }}>Nursing Director</h3>
          <span className="badge blue">Program Oversight</span>
          <p style={{ marginTop: 8 }}>Curriculum oversight<br />Requires RN/LPN license</p>
        </div>
        <div className="card" style={{ borderTop: '3px solid var(--green)', borderLeft: 'none' }}>
          <h3 style={{ fontSize: 13 }}>Program Operator</h3>
          <span className="badge green">Operations Entity</span>
          <p style={{ marginTop: 8 }}>Academy day-to-day ops<br />Execution on ground</p>
        </div>
        <div className="card" style={{ borderTop: '3px solid var(--orange)', borderLeft: 'none' }}>
          <h3 style={{ fontSize: 13 }}>Program Ambassador</h3>
          <span className="badge orange">Distribution</span>
          <p style={{ marginTop: 8 }}>University/program outreach<br />Revenue share + equity</p>
        </div>
        <div className="card" style={{ borderTop: '3px solid var(--purple)', borderLeft: 'none' }}>
          <h3 style={{ fontSize: 13 }}>Instructor Expert</h3>
          <span className="badge purple">Data Labeler</span>
          <p style={{ marginTop: 8 }}>Content review<br />Data annotation CNA/RN/NP level</p>
        </div>
      </div>
      <div className="quote" style={{ marginTop: 16 }}><span className="speaker">Bary:</span> We need two types of people: Human Help and Program Ambassadors</div>
    </>
  );
}

function SlideMessaging() {
  return (
    <>
      <div className="dim-label">Dimension 6</div>
      <h2>Messaging {'\u2014'} From Vague to Precise</h2>
      <div className="flow" style={{ marginBottom: 16 }}>
        <FlowNode status="abandoned" label="Nursing Training" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="partial" label="Training & Hiring HCW" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="abandoned" label="Healthcare" />
        <span className="flow-arrow">{'\u2192'}</span>
        <FlowNode status="final" label="Care Provider" />
      </div>
      <div className="grid2">
        <div>
          <h3>Category Label Exploration (all rejected)</h3>
          <div style={{ fontSize: 12, lineHeight: 2, marginBottom: 14 }}>
            <span className="badge red">Vertical AI</span> Too generic<br />
            <span className="badge red">AI as a Service</span> Not sexy<br />
            <span className="badge red">Agent Economy</span> &ldquo;Don&rsquo;t chase it&rdquo;<br />
            <span className="badge green">Operating System</span> Barry: &ldquo;Sexier than Platform&rdquo;
          </div>
          <div className="card orange">
            <h3>Narrative Gap (core tension)</h3>
            <p>Current {'\u2192'} future story not yet stitched</p>
            <div className="quote" style={{ marginTop: 8, borderLeftColor: 'var(--orange)' }}><span className="speaker" style={{ color: 'var(--orange)' }}>Bary:</span> Human AI collaboration in caring is wonderful. But how to get there from training?</div>
          </div>
        </div>
        <div>
          <div className="card accent" style={{ marginBottom: 14 }}>
            <h3>Final Positioning</h3>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal)' }}>AI Healthcare Workforce Enablement Operating System</p>
            <div className="quote" style={{ marginTop: 8 }}><span className="speaker">Bary:</span> $1M revenue shouldn&rsquo;t be our vision, elevated pitch shouldn&rsquo;t be about that</div>
          </div>
          <div className="card green">
            <h3>Josh: Strategic Narrative Workshop</h3>
            <p>5-hour workshop defining market + positioning + pitch</p>
            <div className="quote" style={{ marginTop: 8 }}><span className="speaker">Josh:</span> The very first thing I do is always a strategic narrative workshop. End result: understanding of your market, why this category exists, how to position yourself in it.</div>
          </div>
        </div>
      </div>
    </>
  );
}

function SlidePitch() {
  return (
    <>
      <div className="dim-label">Dimension 6 {'\u00b7'} Deep Dive</div>
      <h2>Pitch Coaching {'\u2014'} Super Mario to Final Pitch</h2>
      <div className="grid2">
        <div>
          <div className="card" style={{ marginBottom: 10, borderLeft: '3px solid var(--blue)' }}>
            <span className="badge blue" style={{ marginBottom: 6, display: 'inline-block' }}>Dave Jilk {'\u00b7'} Techstars MD</span>
            <h3>Super Mario Framework</h3>
            <p>Mario = your customer {'\u00b7'} Fire Flower = your product<br />&ldquo;For [WHO] who [PROBLEM], we [PRODUCT] so they can [BENEFIT]&rdquo;</p>
            <div className="quote" style={{ marginTop: 8, borderLeftColor: 'var(--blue)' }}><span className="speaker" style={{ color: 'var(--blue)' }}>Dave:</span> Story is about Mario. Great elevator pitches are 90% about your customers.</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.9, marginTop: 10 }}>
            <span className="badge red" style={{ marginRight: 4 }}>V1</span> 48s, too long, product-centric<br />
            <span className="badge orange" style={{ marginRight: 4 }}>V2</span> For-Who: &ldquo;strong on FOR, WHO needs work&rdquo;<br />
            <span className="badge orange" style={{ marginRight: 4 }}>V3</span> For-Who-We: &ldquo;I got what you&rsquo;re trying to do&rdquo;<br />
            <span className="badge green" style={{ marginRight: 4 }}>V4</span> Full Pitch: added emotion + &ldquo;learn by doing&rdquo;
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>FINAL ELEVATOR PITCH</div>
          <div className="pitch-hook"><span style={{ fontSize: 10, opacity: 0.6 }}>HOOK</span><br />If we live long enough, most of us will need care one day.</div>
          <div className="pitch-problem"><span style={{ fontSize: 10, opacity: 0.6 }}>PROBLEM</span><br />As America ages, we need millions more caregivers. Yet turnover exceeds 50% {'\u2014'} and nearly 70% of skills are learned on the job.</div>
          <div className="pitch-product"><span style={{ fontSize: 10, opacity: 0.6 }}>PRODUCT</span><br />Company OS is building AI experiential training that simulates real patients, so caregivers can learn by doing and be ready before touching any real patients.</div>
          <div className="pitch-traction"><span style={{ fontSize: 10, opacity: 0.6 }}>TRACTION</span><br />We&rsquo;re launching our first training cohort in Washington with Kline Galland and UCSF Nursing, and this is only the beginning.</div>
          <div className="pitch-vision"><span style={{ fontSize: 10, opacity: 0.6 }}>VISION</span><br />The future of care is a fellowship of humans, AI, and robotics {'\u2014'} working together to care for an aging world.</div>
        </div>
      </div>
    </>
  );
}

function SlideMoat() {
  return (
    <>
      <div className="dim-label">Dimension 7</div>
      <h2>Moat {'\u2014'} Why Us, Why Hard to Follow</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 4 }}>
        <MoatCard num="01" color="var(--teal)" title="Data & IP" desc="6000+ violation scenarios \u2192 AI content factory. Training data is the core asset." accentClass="accent" />
        <MoatCard num="02" color="var(--green)" title="Customer Trust (bilateral)" desc="Customer trust + Regulator trust. Vertical market penetration via proven graduates." accentClass="green" />
        <MoatCard num="03" color="var(--orange)" title="Regulatory Support" desc="WA state strictest in US for nursing. Pass WA \u2192 easier to scale nationwide." accentClass="orange" />
        <MoatCard num="04" color="var(--purple)" title="Domain Expertise" desc="Sue (DNP), Anna (40+ states), Steve (nursing director at Klein Gallant)." accentClass="purple" />
      </div>
      <div className="card" style={{ marginTop: 14, border: '2px solid var(--teal)', background: 'var(--teal-light)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--teal)', minWidth: 36 }}>05</div>
        <div>
          <h3 style={{ color: 'var(--teal)' }}>Robotics Gatekeeper (~2031 Ultimate Moat)</h3>
          <p>Train Humans {'\u2192'} Collect Data {'\u2192'} Train AI {'\u2192'} Guide Robots</p>
          <div className="quote" style={{ marginTop: 8, borderLeftColor: 'var(--teal)' }}><span className="speaker">Bary:</span> When robot companies arrive, everyone they need is trained by us.</div>
        </div>
      </div>
    </>
  );
}

function SlidePeople() {
  return (
    <>
      <div className="dim-label">Dimension 8</div>
      <h2>People {'\u2014'} Who&rsquo;s on the Ship</h2>
      <div className="grid3" style={{ marginTop: 4 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>CORE TEAM</div>
          <PersonCard color="var(--brand)" initial="B" name="Bary \u00b7 CEO" role="Vision driver, all key decisions" />
          <PersonCard color="var(--blue)" initial="B" name="Barry \u00b7 CTO" role="Tech lead" />
          <PersonCard color="var(--purple)" initial="P" name="PeiJun \u00b7 I/O Psych" role="Assessment, competency" />
          <PersonCard color="var(--orange)" initial="D" name="DaiJun \u00b7 Ops" role="From hesitant to committed" />
          <PersonCard color="var(--green)" initial="Z" name="ZiChen \u00b7 ESL" role="ESL training module" />
          <PersonCard color="var(--teal)" initial="J" name="ZhuLi \u00b7 Data Pipeline" role="DNP samples, content" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600, marginBottom: 8 }}>ADVISORS</div>
          <PersonCard color="var(--red)" initial="R" name="Ron" role="Not engaging, may drop" inactive />
          <PersonCard color="var(--green)" initial="J" name="Josh" role="BD + Messaging + Narrative" badge="Core" />
          <PersonCard color="var(--text3)" initial="J" name="Jim" role="One-time advisory, triggered Hybrid" />
          <div style={{ fontSize: 11, color: 'var(--purple)', fontWeight: 600, margin: '14px 0 8px' }}>SPECIALISTS</div>
          <PersonCard color="var(--purple)" initial="S" name="Sue" role="Pricing/facility/clinical" badge="DNP" />
          <PersonCard color="var(--orange)" initial="A" name="Anna" role="Nursing Education Expert" badge="40+ states" />
          <PersonCard color="var(--green)" initial="S" name="Steve" role="Nursing Dir, Klein Gallant" />
        </div>
        <div>
          <div className="card" style={{ marginBottom: 10 }}>
            <h3>Team Dynamics</h3>
            <div className="quote" style={{ borderLeftColor: 'var(--orange)' }}><span className="speaker" style={{ color: 'var(--orange)' }}>DaiJun Mar 2:</span> Goals keep changing, losing sense of direction</div>
            <div className="quote"><span className="speaker">DaiJun Mar 3:</span> Had that void initially, but after these discussions it disappeared</div>
          </div>
          <div className="card accent">
            <h3>CEO Self-positioning</h3>
            <div className="quote"><span className="speaker">Bary:</span> I deserve major equity because I can lead everyone to build a venture-scale business</div>
          </div>
        </div>
      </div>
    </>
  );
}

function SlideCompetitor() {
  return (
    <>
      <div className="dim-label">Competitor Evolution</div>
      <h2>Competitive Landscape {'\u2014'} 4 Stages</h2>
      <div className="grid4" style={{ marginTop: 4 }}>
        <CompStageCard stage="STAGE 1" subtitle="CNA Training" color="var(--red)" count="10" desc="CareAcademy, Nevvon...\nRed ocean, compete on content" />
        <CompStageCard stage="STAGE 2" subtitle="HC Training" color="var(--orange)" count="18" desc="+Medbridge, Relias...\nLMS giants adding AI" />
        <CompStageCard stage="STAGE 3" subtitle="Care Provider" color="var(--green)" count="16" desc="+Staffing, Compliance...\nIncident AI first-mover" />
        <CompStageCard stage="STAGE 4" subtitle="Workforce OS" color="var(--teal)" count="80+" desc="Training+AI+Robotics...\nNo one connects full chain" />
      </div>
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card accent">
          <h3>White Space</h3>
          <p>Stage 3: Incident Reporting & Compliance AI {'\u2014'} no dominant player<br />Stage 4: Training {'\u2192'} Data {'\u2192'} AI {'\u2192'} Robotics full chain {'\u2014'} nobody does it</p>
        </div>
        <div className="card green">
          <h3>Our Position</h3>
          <p>Not competing with any single player, but building the connection layer<br /><strong>Data Flywheel:</strong> Train Humans {'\u2192'} Collect Data {'\u2192'} Train AI {'\u2192'} Guide Robots</p>
        </div>
      </div>
    </>
  );
}

function SlideVision() {
  return (
    <div className="title-slide-content" style={{ background: 'linear-gradient(160deg, #e8f2e0 0%, #eef5e8 30%, #f2f0ea 60%, #e8f0e2 100%)' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand)', marginBottom: 12 }}>{'\u2764\uFE0F'} Company OS</div>
      <h1 style={{ fontSize: 28, maxWidth: 740, lineHeight: 1.45 }}>
        Expand global caregiving capacity today and become the operating system of the care workforce tomorrow
      </h1>
      <div style={{ marginTop: 28, maxWidth: 600, textAlign: 'left' as const }}>
        <div className="pitch-hook" style={{ margin: '4px 0' }}>If we live long enough, most of us will need care one day.</div>
        <div className="pitch-problem" style={{ margin: '4px 0' }}>As America ages, we need millions more caregivers. Yet turnover exceeds 50% {'\u2014'} and nearly 70% of skills are learned on the job.</div>
        <div className="pitch-product" style={{ margin: '4px 0' }}>Company OS is building AI experiential training that simulates real patients, so caregivers can learn by doing.</div>
        <div className="pitch-traction" style={{ margin: '4px 0' }}>Launching first cohort in Washington with Kline Galland and UCSF Nursing.</div>
        <div className="pitch-vision" style={{ margin: '4px 0' }}><strong>The future of care is a fellowship of humans, AI, and robotics {'\u2014'} working together to care for an aging world.</strong></div>
      </div>
      <div style={{ marginTop: 28, display: 'flex', gap: 16, justifyContent: 'center' }}>
        <StatCard num="$2,000" label="per trainee" />
        <StatCard num="500" label="\u2192 $1M ARR" />
        <StatCard num="6,000+" label="scenarios" />
        <StatCard num="3" label="phases" />
      </div>
      <div style={{ marginTop: 20, fontSize: 11, color: 'var(--text3)' }}>Feb 23 {'\u2013'} Mar 5, 2026 {'\u00b7'} Company OS Executive Report</div>
    </div>
  );
}

/* ── HELPER COMPONENTS ────────────────────────── */

function StatCard({ num, label }: { num: string; label: string }) {
  return (
    <div className="card" style={{ padding: '16px 28px', textAlign: 'center', minWidth: 120 }}>
      <div className="stat">
        <div className="num" style={{ fontSize: 28 }}>{num}</div>
        <div className="label">{label}</div>
      </div>
    </div>
  );
}

function TLItem({ date, label, highlight }: { date: string; label: string; highlight?: boolean }) {
  return (
    <div className={`tl-item${highlight ? ' highlight' : ''}`}>
      <div className="tl-date">{date}</div>
      <div className="tl-label">{label.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</div>
    </div>
  );
}

function FlowNode({ status, label }: { status: string; label: string }) {
  const classMap: Record<string, string> = {
    origin: '', abandoned: 'abandoned', chosen: 'chosen', final: 'final', partial: 'partial',
  };
  const cls = classMap[status] || '';
  const style = status === 'origin' ? { background: 'var(--blue-light)', color: 'var(--blue)' } : undefined;
  return <span className={`flow-node ${cls}`} style={style}>{label}</span>;
}

function MoatCard({ num, color, title, desc, accentClass }: { num: string; color: string; title: string; desc: string; accentClass: string }) {
  return (
    <div className={`card ${accentClass}`} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, minWidth: 36 }}>{num}</div>
      <div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function PersonCard({ color, initial, name, role, badge, inactive }: { color: string; initial: string; name: string; role: string; badge?: string; inactive?: boolean }) {
  return (
    <div className="person" style={inactive ? { opacity: 0.45, marginBottom: 5 } : { marginBottom: 5 }}>
      <div className="avatar" style={{ background: color }}>{initial}</div>
      <div className="info">
        <div className="name" style={inactive ? { textDecoration: 'line-through' } : undefined}>{name} {badge && <span className="badge cyan">{badge}</span>}</div>
        <div className="role">{role}</div>
      </div>
    </div>
  );
}

function CompStageCard({ stage, subtitle, color, count, desc }: { stage: string; subtitle: string; color: string; count: string; desc: string }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${color}`, borderLeft: 'none' }}>
      <div style={{ fontSize: 10, color, fontWeight: 600, marginBottom: 4 }}>{stage} {'\u00b7'} {subtitle}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{count}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>competitors</div>
      <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{desc}</div>
    </div>
  );
}
