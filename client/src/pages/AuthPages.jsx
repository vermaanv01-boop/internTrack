import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Mail, Lock, User, ArrowRight } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

const extractFieldErrors = (error) => {
  if (!error?.errors || typeof error.errors !== "object" || Array.isArray(error.errors)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(error.errors).filter(([, message]) => typeof message === "string" && message)
  );
};

const getErrorState = (error, fallbackMessage) => {
  const { body, ...fieldErrors } = extractFieldErrors(error);

  return {
    fieldErrors,
    message:
      (typeof body === "string" && body) ||
      (Object.keys(fieldErrors).length > 0
        ? "Please correct the highlighted fields."
        : error?.message || fallbackMessage),
  };
};

const AuthShell = ({ eyebrow, title, subtitle, children, footer }) => (
  <div className="auth-page">
    <div className="auth-shell">
      <aside className="auth-brand-panel" aria-label="InternTrack AI overview">
        <div className="auth-brand-top">
          <div className="auth-brand-mark">IT</div>
          <div className="auth-brand-text">
            <span className="auth-brand-name">InternTrack AI</span>
            <span className="auth-brand-sub">Career intelligence</span>
          </div>
        </div>

        <div className="auth-brand-copy">
          <span className="auth-brand-eyebrow">Premium career workspace</span>
          <h1 className="auth-brand-heading">
            Turn every application into a deliberate step forward.
          </h1>
          <p className="auth-brand-desc">
            Track your pipeline, align your resume to each role, and rehearse interviews with
            structured feedback.
          </p>
        </div>

        <ul className="auth-brand-points">
          <li>Pipeline analytics that surface momentum</li>
          <li>Resume-to-role fit scoring with clear gaps</li>
          <li>Mock interviews graded question by question</li>
        </ul>

        <div className="auth-brand-footer">
          <Lock size={14} aria-hidden="true" />
          <span>Private by design. Your career data stays yours.</span>
        </div>
      </aside>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-mobile-brand">
            <div className="auth-brand-mark">IT</div>
            <span className="auth-brand-name">InternTrack AI</span>
          </div>

          <div className="auth-header">
            <span className="auth-eyebrow">{eyebrow}</span>
            <h2 className="auth-title">{title}</h2>
            <p className="auth-subtitle">{subtitle}</p>
          </div>

          {children}

          <div className="auth-footer">{footer}</div>
        </div>
      </section>
    </div>
  </div>
);

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/dashboard";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (!email.trim() || !password) {
      const nextFieldErrors = {};
      if (!email.trim()) nextFieldErrors.email = "Email is required";
      if (!password) nextFieldErrors.password = "Password is required";

      setFieldErrors(nextFieldErrors);
      setError("Please correct the highlighted fields.");
      return;
    }

    setLoading(true);
    try {
      await login({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch (err) {
      const errorState = getErrorState(
        err,
        "Failed to sign in. Please verify your credentials."
      );

      setFieldErrors(errorState.fieldErrors);
      setError(errorState.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your workspace"
      subtitle="Pick up your pipeline, resume library, and interview prep exactly where you left off."
      footer={
        <>
          Don't have an account? <Link to="/register" className="auth-link">Create an account</Link>
        </>
      }
    >
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="login-email">Email Address</label>
          <div className="input-with-icon">
            <Mail size={16} className="input-icon" aria-hidden="true" />
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
              autoComplete="email"
              required
            />
          </div>
          {fieldErrors.email && (
            <div className="form-error" id="login-email-error">{fieldErrors.email}</div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="login-password">Password</label>
          <div className="input-with-icon">
            <Lock size={16} className="input-icon" aria-hidden="true" />
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              autoComplete="current-password"
              required
            />
          </div>
          {fieldErrors.password && (
            <div className="form-error" id="login-password-error">{fieldErrors.password}</div>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary auth-submit-btn"
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? <span className="spinner" aria-label="Signing in" /> : <>Sign In <ArrowRight size={16} aria-hidden="true" /></>}
        </button>
      </form>

      <div className="auth-trust">
        <Lock size={13} aria-hidden="true" />
        <span>Encrypted session · Your credentials are never shared.</span>
      </div>
    </AuthShell>
  );
};

export const RegisterPage = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register, login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (!name.trim() || !email.trim() || !password) {
      const nextFieldErrors = {};
      if (!name.trim()) nextFieldErrors.name = "Name is required";
      if (!email.trim()) nextFieldErrors.email = "Email is required";
      if (!password) nextFieldErrors.password = "Password is required";

      setFieldErrors(nextFieldErrors);
      setError("Please correct the highlighted fields.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldErrors({
        password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
      setError("Please correct the highlighted fields.");
      return;
    }

    setLoading(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
      // Auto login after registration
      await login({ email: email.trim(), password });
      navigate("/dashboard");
    } catch (err) {
      const errorState = getErrorState(err, "Failed to create account.");

      setFieldErrors(errorState.fieldErrors);
      setError(errorState.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">IT</div>
          <h2 className="auth-title">Create an Account</h2>
          <p className="auth-subtitle">Get started with AI-powered internship and job tracking</p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="register-name">Full Name</label>
            <div className="input-with-icon">
              <User size={16} className="input-icon" />
              <input
                id="register-name"
                type="text"
                className="form-input"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                required
              />
            </div>
            {fieldErrors.name && <div className="form-error">{fieldErrors.name}</div>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">Email Address</label>
            <div className="input-with-icon">
              <Mail size={16} className="input-icon" />
              <input
                id="register-email"
                type="email"
                className="form-input"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                required
              />
            </div>
            {fieldErrors.email && <div className="form-error">{fieldErrors.email}</div>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-password">Password</label>
            <div className="input-with-icon">
              <Lock size={16} className="input-icon" />
              <input
                id="register-password"
                type="password"
                className="form-input"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                required
              />
            </div>
            {fieldErrors.password && <div className="form-error">{fieldErrors.password}</div>}
          </div>

          <button
            type="submit"
            className="btn btn-primary auth-submit-btn"
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : <>Create Account <ArrowRight size={16} /></>}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login" className="auth-link">Sign In</Link>
        </div>
      </div>
    </div>
  );
};
