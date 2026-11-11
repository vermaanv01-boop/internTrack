import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Briefcase,
  Check,
  ChevronRight,
  FileText,
  Layers,
  Lock,
  Menu,
  MessageSquare,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import "./LandingPage.css";

const NAV_ITEMS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
];

const FEATURES = [
  {
    title: "Application Tracking",
    description:
      "Keep every role, stage, deadline, and note in one structured pipeline that stays easy to scan.",
    icon: Briefcase,
  },
  {
    title: "Career Analytics",
    description:
      "See momentum across applications, interviews, and outcomes with clear dashboard signals.",
    icon: BarChart3,
  },
  {
    title: "Resume Management",
    description:
      "Store multiple resume versions, activate the right one, and keep your materials organized.",
    icon: FileText,
  },
  {
    title: "Resume-Job Matching",
    description:
      "Compare your resume against a job description and surface aligned skills and honest gaps.",
    icon: Target,
  },
  {
    title: "AI-Assisted Interview Preparation",
    description:
      "Generate role-specific questions and structured practice sessions tailored to the opportunity.",
    icon: Sparkles,
  },
  {
    title: "Interactive Mock Interviews",
    description:
      "Answer questions, receive feedback, and review your performance by category after each session.",
    icon: MessageSquare,
  },
];

const STEPS = [
  {
    number: "01",
    title: "Organize your applications.",
    description:
      "Capture each opportunity, move it through your pipeline, and keep the next action visible.",
  },
  {
    number: "02",
    title: "Improve your resume for each opportunity.",
    description:
      "Match your resume to the role, identify gaps, and keep the strongest version ready to send.",
  },
  {
    number: "03",
    title: "Practice interviews and track your progress.",
    description:
      "Rehearse with structured questions, review feedback, and build confidence round by round.",
  },
];

const PIPELINE = [
  { label: "Applied", count: 8, width: 82, color: "var(--color-primary)" },
  { label: "Screening", count: 5, width: 58, color: "var(--color-gold)" },
  { label: "Interview", count: 4, width: 44, color: "var(--color-info)" },
  { label: "Offer", count: 2, width: 24, color: "var(--color-success)" },
];

const useLandingEffects = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const nodes = document.querySelectorAll("[data-reveal]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return { menuOpen, setMenuOpen, scrolled };
};

const Reveal = ({ as: Tag = "div", delay = 0, className = "", children, ...props }) => (
  <Tag
    className={`landing-reveal ${className}`.trim()}
    data-reveal
    style={{ "--reveal-delay": `${delay}ms` }}
    {...props}
  >
    {children}
  </Tag>
);

const MatchRing = () => (
  <div className="landing-match-visual">
    <svg
      className="landing-match-ring"
      viewBox="0 0 120 120"
      role="img"
      aria-label="Resume match preview of 86 percent"
    >
      <circle className="landing-match-ring-track" cx="60" cy="60" r="50" />
      <circle className="landing-match-ring-value" cx="60" cy="60" r="50" />
    </svg>
    <div className="landing-match-visual-text">
      <strong>86%</strong>
      <span>match</span>
    </div>
  </div>
);

const DashboardPreview = ({ compact = false }) => (
  <div
    className={`landing-preview${compact ? " landing-preview--compact" : ""}`}
    aria-label="Illustrative InternTrack AI workspace preview"
  >
    <aside className="landing-preview-sidebar">
      <div className="landing-preview-brand">
        <span className="landing-preview-brand-mark">IT</span>
        <span className="landing-preview-brand-text">InternTrack</span>
      </div>

      <div className="landing-preview-nav" aria-hidden="true">
        <span className="landing-preview-nav-item is-active">
          <Layers size={13} />
          <span className="landing-preview-nav-label">Overview</span>
        </span>
        <span className="landing-preview-nav-item">
          <Briefcase size={13} />
          <span className="landing-preview-nav-label">Applications</span>
        </span>
        <span className="landing-preview-nav-item">
          <FileText size={13} />
          <span className="landing-preview-nav-label">Resumes</span>
        </span>
        <span className="landing-preview-nav-item">
          <Target size={13} />
          <span className="landing-preview-nav-label">Matching</span>
        </span>
        <span className="landing-preview-nav-item">
          <Bot size={13} />
          <span className="landing-preview-nav-label">Interviews</span>
        </span>
      </div>

      <div className="landing-preview-user">
        <span className="landing-preview-avatar">AJ</span>
        <span className="landing-preview-user-text">
          <strong>Alex Jordan</strong>
          <small>Career workspace</small>
        </span>
      </div>
    </aside>

    <div className="landing-preview-main">
      <div className="landing-preview-topbar">
        <div>
          <span className="landing-preview-kicker">Workspace preview</span>
          <h3>Career overview</h3>
        </div>
        <span className="landing-preview-badge">Preview</span>
      </div>

      <div className="landing-preview-stats">
        <div className="landing-preview-stat">
          <span>Applications</span>
          <strong>12</strong>
          <small>8 active</small>
        </div>
        <div className="landing-preview-stat">
          <span>Interviews</span>
          <strong>4</strong>
          <small>2 upcoming</small>
        </div>
        <div className="landing-preview-stat">
          <span>Match score</span>
          <strong>86%</strong>
          <small>Resume aligned</small>
        </div>
      </div>

      <div className="landing-preview-columns">
        <div className="landing-preview-panel">
          <div className="landing-preview-panel-head">
            <span>Pipeline</span>
            <span>8 active</span>
          </div>
          <div className="landing-preview-pipeline">
            {PIPELINE.map((stage, index) => (
              <div className="landing-preview-pipeline-row" key={stage.label}>
                <div className="landing-preview-pipeline-label">
                  <span>{stage.label}</span>
                  <strong>{stage.count}</strong>
                </div>
                <div className="landing-preview-pipeline-track">
                  <div
                    className="landing-preview-pipeline-fill"
                    style={{
                      "--bar-width": `${stage.width}%`,
                      "--bar-color": stage.color,
                      "--bar-delay": `${180 + index * 90}ms`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-preview-panel landing-preview-match-panel">
          <div className="landing-preview-panel-head">
            <span>Resume match</span>
            <span>Role fit</span>
          </div>
          <MatchRing />
          <div className="landing-preview-skills">
            <span className="landing-preview-skill">React</span>
            <span className="landing-preview-skill">SQL</span>
            <span className="landing-preview-skill">Research</span>
          </div>
        </div>
      </div>

      <div className="landing-preview-panel landing-preview-interview">
        <div className="landing-preview-panel-head">
          <span>Interview prep</span>
          <span>Session 3 of 5</span>
        </div>
        <p>&ldquo;Walk me through a project where you had to influence a team.&rdquo;</p>
        <div className="landing-preview-progress" aria-hidden="true">
          <span style={{ "--bar-width": "62%", "--bar-delay": "620ms" }} />
        </div>
      </div>
    </div>
  </div>
);

export const LandingPage = () => {
  const { menuOpen, setMenuOpen, scrolled } = useLandingEffects();
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-page">
      <a className="landing-skip-link" href="#main">
        Skip to content
      </a>

      <header className={`landing-nav${scrolled ? " is-scrolled" : ""}`}>
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand" onClick={closeMenu} aria-label="InternTrack AI home">
            <span className="landing-brand-mark">IT</span>
            <span className="landing-brand-copy">
              <span className="landing-brand-name">InternTrack AI</span>
              <span className="landing-brand-sub">Career intelligence</span>
            </span>
          </Link>

          <nav className="landing-nav-links" aria-label="Landing page">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="landing-nav-actions">
            <Link to="/login" className="landing-signin">
              Sign In
            </Link>
            <Link to="/register" className="btn landing-nav-cta">
              Get Started <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <button
            type="button"
            className="landing-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
          </button>
        </div>

        {menuOpen && (
          <nav id="landing-mobile-menu" className="landing-mobile-menu" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>
                {item.label}
              </a>
            ))}
            <a href="#product" onClick={closeMenu}>
              Product
            </a>
            <div className="landing-mobile-actions">
              <Link to="/login" className="btn landing-btn landing-btn-secondary" onClick={closeMenu}>
                Sign In
              </Link>
              <Link to="/register" className="btn landing-btn landing-btn-primary" onClick={closeMenu}>
                Get Started
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="main">
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <span className="landing-eyebrow">
                <Sparkles size={13} aria-hidden="true" />
                Career intelligence workspace
              </span>
              <h1 id="landing-hero-title" className="landing-hero-title">
                Your Career Journey.
                <span className="landing-hero-title-accent">Intelligently Tracked.</span>
              </h1>
              <p className="landing-hero-text">
                Manage applications, optimize your resume, and prepare for interviews — all from
                one intelligent career workspace.
              </p>
              <div className="landing-hero-actions">
                <Link to="/register" className="btn landing-btn landing-btn-primary">
                  Start Tracking <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <a href="#features" className="btn landing-btn landing-btn-secondary">
                  Explore Features <ChevronRight size={16} aria-hidden="true" />
                </a>
              </div>
              <div className="landing-hero-notes">
                <span>
                  <Lock size={13} aria-hidden="true" /> Private by design
                </span>
                <span>
                  <Layers size={13} aria-hidden="true" /> One focused workspace
                </span>
              </div>
            </div>

            <div className="landing-hero-visual">
              <div className="landing-hero-orbit landing-hero-orbit--one" aria-hidden="true" />
              <div className="landing-hero-orbit landing-hero-orbit--two" aria-hidden="true" />
              <DashboardPreview compact />
              <div className="landing-float-card landing-float-card--match">
                <span className="landing-float-icon">
                  <Target size={16} aria-hidden="true" />
                </span>
                <span>
                  <span>Resume alignment</span>
                  <strong>86%</strong>
                </span>
              </div>
              <div className="landing-float-card landing-float-card--interview">
                <span className="landing-float-icon">
                  <Bot size={16} aria-hidden="true" />
                </span>
                <span>
                  <span>Interview readiness</span>
                  <strong>Session 3 of 5</strong>
                </span>
              </div>
            </div>
          </div>
          <div className="landing-hero-rule" aria-hidden="true" />
        </section>

        <section id="features" className="landing-section landing-features" aria-labelledby="features-title">
          <div className="landing-container">
            <Reveal className="landing-section-head">
              <span className="landing-eyebrow">Capabilities</span>
              <h2 id="features-title" className="landing-section-title">
                A calmer, sharper way to run your search.
              </h2>
              <p className="landing-section-text">
                Everything you need to stay organized, tailor your materials, and walk into
                interviews prepared.
              </p>
            </Reveal>

            <div className="landing-feature-grid">
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Reveal
                    key={feature.title}
                    className="landing-feature-card"
                    delay={index * 70}
                  >
                    <div className="landing-feature-top">
                      <span className="landing-feature-icon">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span className="landing-feature-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                    <span className="landing-feature-link">
                      Built into your workspace <ChevronRight size={14} aria-hidden="true" />
                    </span>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="landing-section landing-how"
          aria-labelledby="how-title"
        >
          <div className="landing-container">
            <Reveal className="landing-section-head landing-section-head--split">
              <div>
                <span className="landing-eyebrow">How it works</span>
                <h2 id="how-title" className="landing-section-title">
                  Three moves. A clearer search.
                </h2>
              </div>
              <p className="landing-section-text">
                A repeatable rhythm from first application to final round, without the scattered
                notes and last-minute scrambles.
              </p>
            </Reveal>

            <div className="landing-steps">
              {STEPS.map((step, index) => (
                <Reveal key={step.number} className="landing-step" delay={index * 100}>
                  <span className="landing-step-number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="landing-showcase-section" aria-labelledby="product-title">
          <div className="landing-container">
            <Reveal className="landing-showcase">
              <div className="landing-showcase-copy">
                <span className="landing-eyebrow landing-eyebrow--light">Product showcase</span>
                <h2 id="product-title" className="landing-section-title landing-section-title--light">
                  Your entire search, in one composed view.
                </h2>
                <p className="landing-section-text landing-section-text--light">
                  See your pipeline, resume alignment, and interview preparation without
                  switching between tools.
                </p>
                <ul className="landing-showcase-list">
                  <li>
                    <Check size={15} aria-hidden="true" />
                    Application analytics that show real momentum.
                  </li>
                  <li>
                    <Check size={15} aria-hidden="true" />
                    Resume-to-role matching with clear gaps.
                  </li>
                  <li>
                    <Check size={15} aria-hidden="true" />
                    Structured interview practice and review.
                  </li>
                </ul>
                <Link to="/register" className="btn landing-btn landing-btn-gold">
                  Explore the workspace <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>

              <div className="landing-showcase-visual">
                <DashboardPreview />
              </div>
            </Reveal>
          </div>
        </section>

        <section className="landing-final" aria-labelledby="final-title">
          <div className="landing-container">
            <Reveal className="landing-final-inner">
              <span className="landing-eyebrow">Your next chapter</span>
              <h2 id="final-title" className="landing-final-title">
                Take control of your next opportunity.
              </h2>
              <p>
                Bring your applications, resumes, and interview preparation into one intentional
                workspace.
              </p>
              <Link to="/register" className="btn landing-btn landing-btn-primary">
                Build Your Career Workspace <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div className="landing-footer-brand">
            <Link to="/" className="landing-brand" aria-label="InternTrack AI home">
              <span className="landing-brand-mark">IT</span>
              <span className="landing-brand-copy">
                <span className="landing-brand-name">InternTrack AI</span>
                <span className="landing-brand-sub">Career intelligence</span>
              </span>
            </Link>
            <p>A focused workspace for internships and early-career opportunities.</p>
          </div>

          <div className="landing-footer-nav">
            <div>
              <span>Explore</span>
              <a href="#features">Features</a>
              <a href="#how-it-works">How It Works</a>
              <a href="#product">Product</a>
            </div>
            <div>
              <span>Account</span>
              <Link to="/login">Sign In</Link>
              <Link to="/register">Get Started</Link>
            </div>
          </div>
        </div>

        <div className="landing-container landing-footer-bottom">
          <span>&copy; {new Date().getFullYear()} InternTrack AI. All rights reserved.</span>
          <span>Private by design.</span>
        </div>
      </footer>
    </div>
  );
};
