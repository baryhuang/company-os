import { useEffect, useRef } from 'react';
import { SignInButton, useUser } from '@insforge/react';
import { Link } from 'react-router-dom';
import './landing.css';

export function LandingPage() {
  const { user } = useUser();
  const waveformRef = useRef<HTMLDivElement>(null);

  // Waveform animation
  useEffect(() => {
    const waveform = waveformRef.current;
    if (!waveform) return;
    waveform.innerHTML = '';
    const heights = [0.3, 0.6, 0.9, 0.5, 0.8, 0.4, 0.7, 1.0, 0.6, 0.3, 0.8, 0.5, 0.9, 0.4, 0.7, 0.6, 0.8, 0.5, 0.3, 0.7, 1.0, 0.6, 0.4, 0.8, 0.5, 0.9, 0.3, 0.7, 0.6, 0.4, 0.8, 0.5];
    heights.forEach((h, i) => {
      const bar = document.createElement('div');
      bar.className = 'waveform-bar';
      bar.style.height = (h * 44 + 4) + 'px';
      bar.style.animationDelay = (i * 0.05) + 's';
      bar.style.animationDuration = (0.8 + Math.random() * 0.8) + 's';
      waveform.appendChild(bar);
    });
  }, []);

  // Scroll reveal
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    const els = document.querySelectorAll('.landing-page .reveal, .landing-page .reveal-group');
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Nav scroll border effect
  useEffect(() => {
    const nav = document.querySelector('.landing-page nav') as HTMLElement | null;
    if (!nav) return;
    const handler = () => {
      nav.style.borderBottomColor = window.scrollY > 40
        ? 'rgba(204, 120, 92, 0.22)'
        : 'rgba(204, 120, 92, 0.12)';
    };
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Allow body scroll on landing page (dashboard sets overflow: hidden via theme.css)
  useEffect(() => {
    const root = document.getElementById('root');
    const prev = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    const prevRoot = root?.style.overflow ?? '';
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    if (root) root.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = prevHtml;
      if (root) root.style.overflow = prevRoot;
    };
  }, []);

  return (
    <div className="landing-page">
      {/* Nav */}
      <nav>
        <a href="#" className="nav-logo">
          <span></span>
          Company OS
        </a>
        <ul className="nav-links">
          <li><a href="#problem">The Problem</a></li>
          <li><a href="#how">How it works</a></li>
          <li><a href="#features">Features</a></li>
          <li><a href="#quickstart">Get Started</a></li>
          <li>
            <a href="https://github.com/baryhuang/company-os" className="gh-stars-badge" target="_blank" rel="noopener noreferrer">
              <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor" style={{opacity: 0.7}}><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg>
              <span>Star</span>
            </a>
          </li>
          <li>{user ? <Link to="/dashboard" className="nav-cta">Dashboard</Link> : <SignInButton className="nav-cta">Login</SignInButton>}</li>
        </ul>
      </nav>

      {/* Hero */}
      <section id="hero">
        <div className="hero-bg"></div>
        <div className="hero-grid"></div>
        <div className="container">
          <div className="hero-inner">
            <div>
              <div className="hero-badge">
                <span>●</span> Open source · Built by a founder, for founders
              </div>
              <h1>From conversation<br />to <em>structured</em><br />knowledge.</h1>
              <p className="hero-desc">
                Every founding team makes their best decisions in conversation. Then loses them. Company OS is the system of record for verbal decisions, customer insights, and strategic pivots.
              </p>
              <div className="hero-actions">
                <a href="https://github.com/baryhuang/company-os" className="btn-primary">⭐ Star on GitHub</a>
                <a href="#how" className="btn-ghost">See how it works</a>
              </div>
              <div className="hero-tags">
                <span className="tag">Voice → Knowledge</span>
                <span className="tag">Speaker Labels</span>
                <span className="tag">AI Processing</span>
                <span className="tag">Team Chat</span>
                <span className="tag">Self-Hosted</span>
                <span className="tag">MIT License</span>
              </div>
            </div>

            <div className="hero-visual">
              <div className="visual-card">
                <div className="card-header">
                  <div className="dot dot-r"></div>
                  <div className="dot dot-y"></div>
                  <div className="dot dot-g"></div>
                  <span className="card-title">company-os · founder standup</span>
                </div>
                <div className="waveform-container">
                  <div className="waveform" ref={waveformRef}></div>
                  <div className="wave-label">
                    <span>🎙 cofounder-sync-pricing.ogg</span>
                    <span>00:04:32</span>
                  </div>
                </div>
                <div className="transcript-lines" style={{ padding: '0 1.25rem' }}>
                  <div className="t-line">
                    <span className="speaker-badge sp-a">SPK A</span>
                    <span className="t-text">After 8 customer calls this week, onboarding is clearly the blocker. Not pricing.</span>
                    <span className="t-time">0:12</span>
                  </div>
                  <div className="t-line">
                    <span className="speaker-badge sp-b">SPK B</span>
                    <span className="t-text">Agreed. Let's drop the pricing experiment and ship the onboarding fix by Friday.</span>
                    <span className="t-time">0:28</span>
                  </div>
                  <div className="t-line">
                    <span className="speaker-badge sp-a">SPK A</span>
                    <span className="t-text">Perfect. I'll update the roadmap and loop in the design team this afternoon.</span>
                    <span className="t-time">0:41</span>
                  </div>
                </div>
                <div className="summary-box">
                  <div className="summary-label">✦ AI Summary</div>
                  <div className="summary-text"><strong>Decision:</strong> Focus on onboarding, not pricing — based on 8 customer calls. <strong>Action:</strong> Ship onboarding fix by Friday, update roadmap.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center' }}>
            <div className="section-label">Demo</div>
            <h2>See it in action.</h2>
            <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>Record a voice memo. Get a transcript with speaker labels. AI processes it into structured knowledge your whole team can search.</p>
          </div>
          <div className="demo-layout reveal">
            <div className="video-embed">
              <iframe
                src="https://www.youtube.com/embed/JGS3TGs68nI?loop=1&playlist=JGS3TGs68nI"
                title="Notesly Demo"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section id="problem">
        <div className="container">
          <div className="reveal">
            <div className="section-label">The Problem</div>
            <h2>Code goes in GitHub. Tasks go in Linear.<br />Verbal decisions go nowhere.</h2>
          </div>
          <div className="two-col reveal-group">
            <div className="prob-card">
              <div className="col-head">⬤ What every founding team deals with</div>
              <div className="step-row">
                <div className="step-num">1</div>
                <span className="step-text">Six meetings a day — investor calls, customer discovery, co-founder syncs</span>
              </div>
              <div className="step-row">
                <div className="step-num">2</div>
                <span className="step-text">The most important decisions are made out loud, never written down</span>
              </div>
              <div className="step-row">
                <div className="step-num">3</div>
                <span className="step-text">8 customer calls in a week — by Friday you can't remember who said what</span>
              </div>
              <div className="step-row">
                <div className="step-num">4</div>
                <span className="step-text">Hundreds of voice memos on your phone you'll never listen to again</span>
              </div>
              <div className="step-row">
                <div className="step-num">5</div>
                <span className="step-text">Context switching kills memory — your brain is not a system of record</span>
              </div>
            </div>
            <div className="sol-card">
              <div className="col-head">✓ With Company OS</div>
              <div className="step-row">
                <div className="step-num">1</div>
                <span className="step-text">Hit record, share to Telegram when you're done</span>
              </div>
              <div className="step-row">
                <div className="step-num">2</div>
                <span className="step-text">AI processes transcripts into structured knowledge dimensions</span>
              </div>
              <div className="step-row">
                <div className="step-num">3</div>
                <span className="step-text">Every decision, insight, and pivot — traced back to the exact conversation</span>
              </div>
              <div className="step-row">
                <div className="step-num">4</div>
                <span className="step-text">Team members chat with the knowledge base directly — "what did we decide about X?"</span>
              </div>
              <div className="step-row">
                <div className="step-num">5</div>
                <span className="step-text">Your company's structure emerges from your conversations, not a template</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brain */}
      <section id="brain">
        <div className="container">
          <div className="reveal">
            <div className="section-label">The Pipeline</div>
            <h2>Conversations become<br />structured knowledge.</h2>
          </div>
          <div className="brain-layout">
            <div className="brain-diagram reveal">
              <div className="brain-center">
                <div className="brain-center-label">What happens when you send a recording</div>
                <h3>Record → Transcribe → Process → Structure → Execute</h3>
                <div className="loop-steps">
                  <div className="loop-step"><span className="loop-arrow">→</span> Transcribe with speaker labels (AssemblyAI)</div>
                  <div className="loop-step"><span className="loop-arrow">→</span> Sync files via BubbleLab workflows</div>
                  <div className="loop-step"><span className="loop-arrow">→</span> Claude Cowork processes into knowledge dimensions</div>
                  <div className="loop-step"><span className="loop-arrow">→</span> Structured data stored in InsForge database</div>
                  <div className="loop-step"><span className="loop-arrow">→</span> Tasks sync from Linear into the same backend</div>
                </div>
                <div className="brain-nodes">
                  <div className="brain-node">AssemblyAI</div>
                  <div className="brain-node">BubbleLab</div>
                  <div className="brain-node">Claude Cowork</div>
                  <div className="brain-node">InsForge</div>
                  <div className="brain-node">OpenAgents</div>
                  <div className="brain-node">Linear</div>
                </div>
              </div>
            </div>

            <div className="brain-points reveal-group">
              <div className="brain-point">
                <div className="bp-icon">🧠</div>
                <div>
                  <div className="bp-title">Your dimensions, not a template</div>
                  <div className="bp-desc">The knowledge structure emerges from your conversations. A healthcare startup gets regulatory/, validation/. A fintech gets compliance/, partnerships/. Your company, your structure.</div>
                </div>
              </div>
              <div className="brain-point">
                <div className="bp-icon">⚡</div>
                <div>
                  <div className="bp-title">Chat with your knowledge base</div>
                  <div className="bp-desc">Team members ask "who did we talk to about X?" or "what did we decide about Y?" and get answers grounded in actual conversations. OpenAgents hosts the chat interface.</div>
                </div>
              </div>
              <div className="brain-point">
                <div className="bp-icon">🔗</div>
                <div>
                  <div className="bp-title">Clarity over consensus</div>
                  <div className="bp-desc">The system tracks who decided what, when, and why. Six months from now, trace any strategic decision back to the exact conversation.</div>
                </div>
              </div>
              <div className="brain-point">
                <div className="bp-icon">💬</div>
                <div>
                  <div className="bp-title">Your API keys, your data</div>
                  <div className="bp-desc">Investor negotiations, co-founder disagreements, customer deal terms — processed with your own API keys, stored on your own infrastructure.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Skills */}
      <section id="skills">
        <div className="container">
          <div className="skills-header reveal">
            <div>
              <div className="section-label">Use Cases</div>
              <h2>I use it for<br />every type of call.</h2>
              <p className="skills-intro">I built this for my team. Every type of conversation a founding team has benefits from being recorded, structured, and searchable. Here's what we use it for.</p>
            </div>
            <div className="skills-stat">
              <span className="stat-num">2</span>
              <div className="stat-label">env vars to get started</div>
              <div className="stat-label" style={{ marginTop: '0.5rem', fontSize: '0.72rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--copper)' }}>everything else is optional</div>
            </div>
          </div>

          <div className="skills-grid reveal-group">
            <div className="skill-cat">
              <div className="cat-header">
                <div className="cat-dot" style={{ background: '#3B82F6' }}></div>
                <span className="cat-title">Customer Discovery</span>
              </div>
              <div className="cat-items">
                <div className="cat-item">Record every customer call</div>
                <div className="cat-item">Search for patterns across calls</div>
                <div className="cat-item">"What did users say about X?"</div>
              </div>
            </div>
            <div className="skill-cat">
              <div className="cat-header">
                <div className="cat-dot" style={{ background: '#F59E0B' }}></div>
                <span className="cat-title">Investor Meetings</span>
              </div>
              <div className="cat-items">
                <div className="cat-item">Capture investor feedback</div>
                <div className="cat-item">Track objections and advice</div>
                <div className="cat-item">Never lose a term sheet detail</div>
              </div>
            </div>
            <div className="skill-cat">
              <div className="cat-header">
                <div className="cat-dot" style={{ background: '#8B5CF6' }}></div>
                <span className="cat-title">Co-Founder Syncs</span>
              </div>
              <div className="cat-items">
                <div className="cat-item">Record decisions as they happen</div>
                <div className="cat-item">"What did we agree on pricing?"</div>
                <div className="cat-item">End the "I thought we said..." debates</div>
              </div>
            </div>
            <div className="skill-cat">
              <div className="cat-header">
                <div className="cat-dot" style={{ background: '#EF4444' }}></div>
                <span className="cat-title">Advisor Sessions</span>
              </div>
              <div className="cat-items">
                <div className="cat-item">Capture mentor advice verbatim</div>
                <div className="cat-item">Search past sessions for guidance</div>
                <div className="cat-item">Build an advisor knowledge base</div>
              </div>
            </div>
            <div className="skill-cat">
              <div className="cat-header">
                <div className="cat-dot" style={{ background: '#10B981' }}></div>
                <span className="cat-title">Ideas & Voice Notes</span>
              </div>
              <div className="cat-items">
                <div className="cat-item">Capture midnight product ideas</div>
                <div className="cat-item">Voice-memo yourself on the go</div>
                <div className="cat-item">Never lose a thought again</div>
              </div>
            </div>
            <div className="skill-cat">
              <div className="cat-header">
                <div className="cat-dot" style={{ background: 'var(--copper)' }}></div>
                <span className="cat-title">Team Standups</span>
              </div>
              <div className="cat-items">
                <div className="cat-item">Record daily standups</div>
                <div className="cat-item">Track blockers and commitments</div>
                <div className="cat-item">Searchable standup history</div>
              </div>
            </div>
          </div>

          <div className="compat-bar reveal">
            <span className="compat-label">Works with</span>
            <div className="compat-tags">
              <span className="compat-tag">iPhone Voice Memos</span>
              <span className="compat-tag">Any Audio File</span>
              <span className="compat-tag">.m4a .mp3 .ogg .wav</span>
              <span className="compat-tag">Video .mp4 .mov</span>
              <span className="compat-tag">100+ Languages</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center' }}>
            <div className="section-label">Flow</div>
            <h2>From voice memo<br />to company knowledge.</h2>
          </div>
          <div className="steps-grid reveal-group">
            <div className="how-step">
              <div className="step-circle c1">1</div>
              <div className="step-title">Record</div>
              <div className="step-desc">Voice memo, Zoom recording, any audio. Customer call, co-founder sync, advisor session.</div>
            </div>
            <div className="how-step">
              <div className="step-circle c2">2</div>
              <div className="step-title">Transcribe</div>
              <div className="step-desc">Speaker labels, timestamps, 100+ languages. BubbleLab syncs files to cloud storage.</div>
            </div>
            <div className="how-step">
              <div className="step-circle c3">3</div>
              <div className="step-title">Structure</div>
              <div className="step-desc">Claude Cowork processes transcripts into knowledge dimensions that emerge from your conversations.</div>
            </div>
            <div className="how-step">
              <div className="step-circle c4">4</div>
              <div className="step-title">Execute</div>
              <div className="step-desc">Structured data flows to InsForge. Tasks sync from Linear. Everything in one backend.</div>
            </div>
            <div className="how-step">
              <div className="step-circle c5">5</div>
              <div className="step-title">Ask</div>
              <div className="step-desc">Chat with your knowledge base. "What did we decide about pricing?" — answered from your actual conversations.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features">
        <div className="container">
          <div className="reveal">
            <div className="section-label">What's Inside</div>
            <h2>Production code.<br />Not a demo.</h2>
          </div>
          <div className="features-grid reveal-group">
            <div className="feat-card">
              <div className="feat-icon">🎙</div>
              <div className="feat-title">Speaker Diarization</div>
              <div className="feat-desc">"Who said we should pivot?" — every speaker labeled with precise timestamps. 100+ languages auto-detected.</div>
            </div>
            <div className="feat-card">
              <div className="feat-icon">🧠</div>
              <div className="feat-title">Knowledge Dimensions</div>
              <div className="feat-desc">AI processes conversations into structured dimensions — market, product, regulatory — whatever emerges from your team's actual discussions.</div>
            </div>
            <div className="feat-card">
              <div className="feat-icon">💬</div>
              <div className="feat-title">Team Chat Interface</div>
              <div className="feat-desc">"What did we decide about pricing?" — team members chat with the knowledge base directly via OpenAgents. Answers grounded in real conversations.</div>
            </div>
            <div className="feat-card">
              <div className="feat-icon">⚡</div>
              <div className="feat-title">Claude Cowork</div>
              <div className="feat-desc">Not a simple summarizer — a Claude agent that processes files into structured knowledge, hosted in the cloud by OpenAgents.</div>
            </div>
            <div className="feat-card">
              <div className="feat-icon">📊</div>
              <div className="feat-title">Vibe-Coded Dashboards</div>
              <div className="feat-desc">Each team member builds their own view using shared primitives. The CEO sees the vision map. The COO sees the ops tracker. Same data, different views.</div>
            </div>
            <div className="feat-card">
              <div className="feat-icon">🔐</div>
              <div className="feat-title">Your API Keys, Your Data</div>
              <div className="feat-desc">Investor calls, co-founder disagreements, customer deal terms — processed with your keys, stored on your infrastructure.</div>
            </div>
            <div className="feat-card">
              <div className="feat-icon">🚀</div>
              <div className="feat-title">Deploy Anywhere</div>
              <div className="feat-desc">Docker, AWS ECS, a $5 VPS, or your laptop. The transcription bot runs anywhere Docker runs.</div>
            </div>
            <div className="feat-card">
              <div className="feat-icon">🧩</div>
              <div className="feat-title">Modular Stack</div>
              <div className="feat-desc">InsForge for backend. BubbleLab for file sync. Linear for tasks. OpenAgents for chat. Each piece works independently.</div>
            </div>
            <div className="feat-card">
              <div className="feat-icon">🤖</div>
              <div className="feat-title">Decision Traceability</div>
              <div className="feat-desc">Every strategic decision traces back to a conversation. 50+ days of transcripts, 16 dimensions, 800+ structured knowledge nodes.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard */}
      <section id="dashboard">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center' }}>
            <div className="section-label">Your Dashboard</div>
            <h2>The UI doesn't matter.<br />The primitives do.</h2>
            <p style={{ color: 'var(--muted)', marginTop: '1rem', maxWidth: '640px', marginLeft: 'auto', marginRight: 'auto' }}>Every team member vibe-codes their own dashboard. The CEO sees the vision map and fundraise pipeline. The COO sees the operational tracker. Same structured data, different views — all AI-generated from shared components.</p>
            <p style={{ color: 'var(--muted)', marginTop: '0.75rem', maxWidth: '640px', marginLeft: 'auto', marginRight: 'auto', fontSize: '0.9rem' }}>Think of it as an embedded Lovable — the primitives (dimension trees, timelines, competitor landscapes, task views) are shared React components. How you organize them is up to you.</p>
          </div>
          <div className="dashboard-img reveal" style={{ marginTop: '3rem' }}>
            <img src="https://7a358ypj.us-west.insforge.app/api/storage/buckets/assets/objects/dashboard.png" alt="Company OS Dashboard — decision trees, competitor landscape, task search, timeline views" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="cta-banner">
        <div className="container">
          <h2>I built it. I open-sourced it.<br />Now it's yours.</h2>
          <p>Production code my 5-person founding team runs daily. 50+ days of transcripts processed into 16 knowledge dimensions. Star the repo or fork it — that's what open source is for.</p>
          <div className="cta-actions">
            <a href="https://github.com/baryhuang/company-os" className="btn-primary">⭐ Star on GitHub</a>
          </div>
        </div>
      </div>

      {/* Quickstart */}
      <section id="quickstart">
        <div className="container">
          <div className="reveal">
            <div className="section-label">Quickstart</div>
            <h2>Up and running<br />in 4 steps.</h2>
          </div>
          <div className="quick-layout">
            <div className="qs-steps reveal-group">
              <div className="qs-step">
                <div className="qs-num">1</div>
                <div className="qs-content">
                  <div className="qs-title">Clone & Configure</div>
                  <div className="qs-desc">Set TELEGRAM_TOKEN + ASSEMBLYAI_API_KEY — everything else is optional.</div>
                </div>
              </div>
              <div className="qs-step">
                <div className="qs-num">2</div>
                <div className="qs-content">
                  <div className="qs-title">Deploy</div>
                  <div className="qs-desc">docker compose up, EC2 systemd, AWS ECS Fargate — or any VPS. Your choice.</div>
                </div>
              </div>
              <div className="qs-step">
                <div className="qs-num">3</div>
                <div className="qs-content">
                  <div className="qs-title">Send a Voice Memo</div>
                  <div className="qs-desc">Record with Voice Memos, share to Telegram. Transcript comes back in under a minute.</div>
                </div>
              </div>
              <div className="qs-step">
                <div className="qs-num">4</div>
                <div className="qs-content">
                  <div className="qs-title">Ask Questions</div>
                  <div className="qs-desc">"What did we decide last Tuesday?" — search across every recording your team has made.</div>
                </div>
              </div>
            </div>

            <div className="code-block reveal">
              <div className="code-header">
                <div className="dot dot-r"></div>
                <div className="dot dot-y"></div>
                <div className="dot dot-g"></div>
                <span className="code-lang">bash</span>
              </div>
              <div className="code-body">
                <span className="c-comment"># 1. Clone the repo</span>{'\n'}
                <span className="c-cmd">git clone</span> <span className="c-str">https://github.com/baryhuang/company-os</span>{'\n'}
                <span className="c-cmd">cd</span> company-os{'\n'}
                {'\n'}
                <span className="c-comment"># 2. Configure (only 2 required vars)</span>{'\n'}
                <span className="c-kw">cp</span> .env.example .env{'\n'}
                <span className="c-comment"># set TELEGRAM_BOT_TOKEN and ASSEMBLY_API_KEY</span>{'\n'}
                {'\n'}
                <span className="c-comment"># 3. Launch</span>{'\n'}
                <span className="c-cmd">docker compose up</span> -d{'\n'}
                {'\n'}
                <span className="c-comment"># 4. Send a voice memo to your bot on Telegram.</span>{'\n'}
                <span className="c-comment">#    Transcript comes back in under a minute.</span>{'\n'}
                <span className="c-comment">#    Ask questions across all your recordings.</span>{'\n'}
                <span className="c-comment">#    Never lose a decision again.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="container">
          <div className="footer-inner">
            <a href="#" className="footer-logo">Company OS</a>
            <ul className="footer-links">
              <li><a href="#problem">The Problem</a></li>
              <li><a href="#how">How it works</a></li>
              <li><a href="#features">Features</a></li>
              <li><a href="https://github.com/baryhuang/company-os">GitHub</a></li>
            </ul>
            <div className="footer-copy">MIT License · Open Source</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
