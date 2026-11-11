import { useState, useEffect, useCallback } from "react";
import { 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Trash2, 
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { resumeService, matchingService } from "../services";
import { EmptyState, LoadingState, Modal, Pagination, ScoreBadge } from "../components/common";

export const MatchingPage = () => {
  const [resumes, setResumes] = useState([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  
  const [analyzing, setAnalyzing] = useState(false);
  const [formError, setFormError] = useState("");
  const [currentResult, setCurrentResult] = useState(null);

  // History Tab / Section
  const [history, setHistory] = useState([]);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState("workspace"); // "workspace" | "history"
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const loadResumes = useCallback(async () => {
    try {
      const res = await resumeService.list();
      const list = res.resumes || [];
      setResumes(list);
      const active = list.find((r) => r.isActive);
      if (active) {
        setSelectedResumeId(active._id);
      } else if (list.length > 0) {
        setSelectedResumeId(list[0]._id);
      }
    } catch (err) {
      console.error("Failed to load resumes", err);
    }
  }, []);

  const loadHistory = useCallback(async (page = 1) => {
    setLoadingHistory(true);
    try {
      const res = await matchingService.getHistory({ page, limit: 10 });
      setHistory(res.analyses || []);
      setHistoryPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      console.error("Failed to load match history", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadResumes();
    loadHistory(1);
  }, [loadResumes, loadHistory]);

  const handleRunAnalysis = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!jobDescription.trim()) {
      setFormError("Job description is required");
      return;
    }

    if (jobDescription.trim().length < 100) {
      setFormError("Job description must be at least 100 characters long");
      return;
    }

    setAnalyzing(true);
    setCurrentResult(null);

    try {
      const payload = {
        jobDescription: jobDescription.trim(),
        jobTitle: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
        resumeId: selectedResumeId || undefined,
      };

      const result = await matchingService.analyze(payload);
      setCurrentResult(result);
      loadHistory(1);
    } catch (err) {
      setFormError(err.message || "Failed to analyze match");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleViewHistoryDetail = async (id) => {
    try {
      const res = await matchingService.getHistoryById(id);
      setSelectedHistoryItem(res.analysis);
    } catch (err) {
      alert(err.message || "Failed to fetch analysis details");
    }
  };

  const handleDeleteHistory = async () => {
    if (!deleteId) return;
    try {
      await matchingService.deleteHistory(deleteId);
      setDeleteId(null);
      loadHistory(historyPagination.page);
    } catch (err) {
      alert(err.message || "Failed to delete history item");
    }
  };

  const renderResultView = (result) => {
    if (!result) return null;

    const matchedSkills = result.matchedSkills || [];
    const missingSkills = result.missingSkills || [];
    const relatedSkills = result.relatedSkills || result.partialMatches || [];
    const strengths = result.strengths || [];
    const improvements = result.improvements || [];
    const scoreBreakdown = result.scoreBreakdown || {};
    const keywordCoverage = result.keywordAnalysis?.coverage;
    const breakdownItems = [
      { label: "Skills Weight", value: scoreBreakdown.skillsScore },
      { label: "Experience Weight", value: scoreBreakdown.experienceScore },
      { label: "Education Weight", value: scoreBreakdown.educationScore },
      {
        label: "Keyword Density",
        value: keywordCoverage ? Math.round(keywordCoverage * 100) : null,
      },
    ];

    return (
      <div className="card match-result-card" style={{ marginTop: 24 }}>
        <div className="match-result-hero">
          <div>
            <div className="score-hero-label">Target Match Evaluation</div>
            <h2 className="match-hero-title">
              {result.jobTitle || "Evaluated Position"} {result.company ? `at ${result.company}` : ""}
            </h2>
            <p className="text-muted" style={{ fontSize: "0.9rem" }}>
              {result.summary || "Deterministic concept-weighted score calculated against candidate profile."}
            </p>
          </div>
          <div className="match-score-ring-wrap">
            <div
              className="match-score-ring"
              style={{
                backgroundImage: `conic-gradient(var(--color-primary) ${Math.max(0, Math.min(100, result.matchScore ?? 0))}%, var(--bg-surface-hover) 0)`,
              }}
              role="img"
              aria-label={`Match score ${result.matchScore ?? 0} percent`}
            >
              <div className="match-score-ring-inner">
                <div className="match-score-number">{result.matchScore ?? 0}%</div>
                <div className="match-score-tag">{result.matchLabel || result.scoreLabel || "Score"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Score Breakdown Pill Grid */}
        <div className="score-breakdown-grid">
          {breakdownItems.map((item) => (
            <div key={item.label} className="breakdown-stat-box">
              <span className="breakdown-stat-label">{item.label}</span>
              <span className="breakdown-stat-val">
                {typeof item.value === "number" ? `${item.value}%` : "—"}
              </span>
              <div
                className="breakdown-stat-bar"
                role="progressbar"
                aria-label={`${item.label} score`}
                aria-valuenow={typeof item.value === "number" ? item.value : 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="breakdown-stat-fill"
                  style={{
                    width: `${typeof item.value === "number" ? Math.max(0, Math.min(100, item.value)) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Skills Alignment Grid */}
        <div className="skills-alignment-grid">
          {/* Matched Skills */}
          <div className="skills-col">
            <div className="skills-col-header text-success">
              <CheckCircle2 size={16} /> Matched Skills ({matchedSkills.length})
            </div>
            {matchedSkills.length === 0 ? (
              <p className="text-muted" style={{ fontSize: "0.85rem" }}>No direct keyword matches found.</p>
            ) : (
              <div className="skills-pill-wrap">
                {matchedSkills.map((s, idx) => (
                  <span key={idx} className="skill-pill skill-matched">
                    {typeof s === "string" ? s : s.skill || s.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Related / Partial Skills */}
          <div className="skills-col">
            <div className="skills-col-header text-warning">
              <TrendingUp size={16} /> Transferable / Partial ({relatedSkills.length})
            </div>
            {relatedSkills.length === 0 ? (
              <p className="text-muted" style={{ fontSize: "0.85rem" }}>None identified.</p>
            ) : (
              <div className="skills-pill-wrap">
                {relatedSkills.map((s, idx) => (
                  <span key={idx} className="skill-pill skill-partial">
                    {typeof s === "string" ? s : s.skill || s.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Missing Skills */}
          <div className="skills-col">
            <div className="skills-col-header text-danger">
              <XCircle size={16} /> Missing Requirements ({missingSkills.length})
            </div>
            {missingSkills.length === 0 ? (
              <p className="text-muted" style={{ fontSize: "0.85rem" }}>No major gaps detected.</p>
            ) : (
              <div className="skills-pill-wrap">
                {missingSkills.map((s, idx) => (
                  <span key={idx} className="skill-pill skill-missing">
                    {typeof s === "string" ? s : s.skill || s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Strengths & Improvements */}
        <div className="insights-split-grid">
          <div className="insight-card-box insight-strengths">
            <h4 className="insight-title text-success">Core Strengths</h4>
            {strengths.length === 0 ? (
              <p className="text-muted" style={{ fontSize: "0.85rem" }}>No distinct strengths highlighted.</p>
            ) : (
              <ul className="insight-list">
                {strengths.map((st, i) => <li key={i}>{st}</li>)}
              </ul>
            )}
          </div>

          <div className="insight-card-box insight-improvements">
            <h4 className="insight-title text-warning">Optimization Suggestions</h4>
            {improvements.length === 0 ? (
              <p className="text-muted" style={{ fontSize: "0.85rem" }}>Resume closely fits role keywords.</p>
            ) : (
              <ul className="insight-list">
                {improvements.map((imp, i) => <li key={i}>{imp}</li>)}
              </ul>
            )}
          </div>
        </div>

        {result.disclaimer && (
          <div className="evaluation-disclaimer-note">
            <AlertCircle size={14} /> {result.disclaimer}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="matching-page">
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Fit intelligence</span>
          <h1 className="page-title">Resume–Job Fit Engine</h1>
          <p className="page-subtitle">Deterministic skill, keyword & experience alignment analysis</p>
        </div>
        <div className="tab-pill-group">
          <button
            type="button"
            className={`tab-pill ${activeTab === "workspace" ? "active" : ""}`}
            onClick={() => setActiveTab("workspace")}
          >
            Match Workspace
          </button>
          <button
            type="button"
            className={`tab-pill ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            Saved Analyses ({historyPagination.total || 0})
          </button>
        </div>
      </div>

      {activeTab === "workspace" ? (
        <>
          <div className="card">
            <form onSubmit={handleRunAnalysis}>
              {formError && <div className="alert alert-danger" role="alert">{formError}</div>}

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label" htmlFor="match-resume">Select Candidate Resume *</label>
                  <select
                    id="match-resume"
                    className="form-select"
                    value={selectedResumeId}
                    onChange={(e) => setSelectedResumeId(e.target.value)}
                  >
                    {resumes.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.originalName} {r.isActive ? "(Active)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="match-jobTitle">Job Title (Optional)</label>
                  <input
                    id="match-jobTitle"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Frontend Engineer"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="match-company">Company (Optional)</label>
                  <input
                    id="match-company"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Stripe"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="match-jobDesc">Job Description Text * (Min 100 characters)</label>
                <textarea
                  id="match-jobDesc"
                  rows={6}
                  className="form-textarea"
                  placeholder="Paste the target job description requirements, responsibilities and desired skills..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  required
                />
                <div className="char-count-meta">{jobDescription.length} / 30,000 characters</div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={analyzing || resumes.length === 0}
                >
                  {analyzing ? <span className="spinner" /> : <><Sparkles size={16} /> Run Fit Analysis</>}
                </button>
              </div>
            </form>
          </div>

          {currentResult && renderResultView(currentResult)}
        </>
      ) : (
        /* History Tab */
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Previous Fit Analyses</h3>
          </div>

          {loadingHistory ? (
            <LoadingState message="Loading previous match analyses..." />
          ) : history.length === 0 ? (
            <EmptyState
              title="No saved analyses yet"
              description="Run a fit analysis from the workspace to save immutable snapshots here."
              actionText="Open Workspace"
              onAction={() => setActiveTab("workspace")}
            />
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Position & Company</th>
                      <th>Match Score</th>
                      <th>Matched Skills</th>
                      <th>Missing Skills</th>
                      <th>Analyzed Date</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr 
                        key={item.id || item._id} 
                        onClick={() => handleViewHistoryDetail(item.id || item._id)} 
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <div className="app-role-cell">
                            <span className="font-semibold">{item.jobTitle || "Untitled Role"}</span>
                            <span className="app-company-sub">{item.company || "Company not specified"}</span>
                          </div>
                        </td>
                        <td>
                          <span className="font-semibold" style={{ fontSize: "1rem" }}>
                            {item.matchScore}%
                          </span>{" "}
                          <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                            ({item.scoreLabel})
                          </span>
                        </td>
                        <td>
                          <span className="text-success font-semibold">{item.matchedSkillsCount} skills</span>
                        </td>
                        <td>
                          <span className="text-danger font-semibold">{item.missingSkillsCount} gaps</span>
                        </td>
                        <td className="text-muted" style={{ fontSize: "0.85rem" }}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                          <div className="action-buttons-wrap">
                            <button
                              type="button"
                              className="btn-action-icon"
                              onClick={() => handleViewHistoryDetail(item.id || item._id)}
                              title="View dossier"
                            >
                              <ChevronRight size={16} />
                            </button>
                            <button
                              type="button"
                              className="btn-action-icon btn-action-danger"
                              onClick={() => setDeleteId(item.id || item._id)}
                              title="Delete snapshot"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={historyPagination.page}
                totalPages={historyPagination.totalPages}
                onPageChange={(p) => loadHistory(p)}
              />
            </>
          )}
        </div>
      )}

      {/* Snapshot Details Modal */}
      <Modal
        isOpen={Boolean(selectedHistoryItem)}
        onClose={() => setSelectedHistoryItem(null)}
        title="Saved Match Snapshot"
        footer={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setSelectedHistoryItem(null)}
          >
            Close
          </button>
        }
      >
        {selectedHistoryItem && renderResultView(selectedHistoryItem)}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title="Delete Match Snapshot"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteHistory}
            >
              Delete Snapshot
            </button>
          </>
        }
      >
        <p>Are you sure you want to delete this matching analysis record?</p>
        <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>
          This will permanently remove the score and skill breakdown snapshot from your history.
        </p>
      </Modal>
    </div>
  );
};
