import { useState, useEffect, useCallback } from "react";
import { 
  Bot, 
  Play, 
  CheckCircle2, 
  Send, 
  Trash2
} from "lucide-react";
import { resumeService, interviewPrepService } from "../services";
import { EmptyState, LoadingState, Modal, Pagination, ScoreBadge } from "../components/common";

export const InterviewPrepPage = () => {
  const [resumes, setResumes] = useState([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [difficulty, setDifficulty] = useState("mixed");
  const [jobDescription, setJobDescription] = useState("");
  
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState("");

  // Live session state
  const [currentSession, setCurrentSession] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [answerError, setAnswerError] = useState("");
  const [completionResult, setCompletionResult] = useState(null);

  // History state
  const [activeTab, setActiveTab] = useState("generate"); // "generate" | "live" | "history"
  const [history, setHistory] = useState([]);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

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
      const res = await interviewPrepService.getHistory({ page, limit: 10 });
      setHistory(res.sessions || []);
      setHistoryPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      console.error("Failed to load session history", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadResumes();
    loadHistory(1);
  }, [loadResumes, loadHistory]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!selectedResumeId) {
      setFormError("Please select a candidate resume");
      return;
    }

    if (!jobDescription.trim() || jobDescription.trim().length < 100) {
      setFormError("Job description must be at least 100 characters long");
      return;
    }

    setGenerating(true);
    try {
      const res = await interviewPrepService.generate({
        resumeId: selectedResumeId,
        jobDescription: jobDescription.trim(),
        jobTitle: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
        difficulty,
      });

      setCurrentSession(res.session);
      setActiveQuestionIndex(0);
      setCompletionResult(null);
      setActiveTab("live");
      loadHistory(1);
    } catch (err) {
      setFormError(err.message || "Failed to generate interview questions");
    } finally {
      setGenerating(false);
    }
  };

  const handleStartSession = async () => {
    if (!currentSession) return;
    try {
      const res = await interviewPrepService.start(currentSession._id || currentSession.id);
      setCurrentSession(res.session);
      setActiveQuestionIndex(0);
    } catch (err) {
      alert(err.message || "Failed to start interview");
    }
  };

  const handleSubmitAnswer = async (e) => {
    e.preventDefault();
    setAnswerError("");

    if (!answerText.trim()) {
      setAnswerError("Answer is required");
      return;
    }

    if (answerText.trim().length < 20) {
      setAnswerError("Answer must be at least 20 characters long");
      return;
    }

    const currentQuestions = currentSession.questions || [];
    const targetQ = currentQuestions[activeQuestionIndex];
    if (!targetQ) return;

    setEvaluating(true);
    try {
      const res = await interviewPrepService.submitAnswer(currentSession._id || currentSession.id, {
        questionId: targetQ.questionId,
        answer: answerText.trim(),
      });

      setAnswerText("");

      // Update session locally
      const updatedAnswers = [...(currentSession.answers || []), res.answer];
      const updatedSession = {
        ...currentSession,
        answers: updatedAnswers,
        currentQuestionIndex: res.progress?.currentQuestionIndex ?? (activeQuestionIndex + 1),
      };
      setCurrentSession(updatedSession);

      // Auto advance to next unanswered question
      if (res.progress?.currentQuestionIndex !== undefined) {
        setActiveQuestionIndex(Math.min(res.progress.currentQuestionIndex, currentQuestions.length - 1));
      }
    } catch (err) {
      setAnswerError(err.message || "Failed to submit answer");
    } finally {
      setEvaluating(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!currentSession) return;
    try {
      const res = await interviewPrepService.complete(currentSession._id || currentSession.id);
      setCurrentSession(res.session);
      setCompletionResult(res.result);
      loadHistory(1);
    } catch (err) {
      alert(err.message || "Failed to complete session");
    }
  };

  const handleViewHistorySession = async (id) => {
    try {
      const res = await interviewPrepService.getById(id);
      setSelectedSessionDetail(res.session);
    } catch (err) {
      alert(err.message || "Failed to load session detail");
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteTargetId) return;
    try {
      await interviewPrepService.delete(deleteTargetId);
      setDeleteTargetId(null);
      loadHistory(historyPagination.page);
    } catch (err) {
      alert(err.message || "Failed to delete session record");
    }
  };

  // Helper getters
  const currentQuestions = currentSession?.questions || [];
  const currentAnswers = currentSession?.answers || [];
  const currentQ = currentQuestions[activeQuestionIndex];
  const isQuestionAnswered = (qId) => currentAnswers.some((a) => a.questionId === qId);
  const getExistingAnswer = (qId) => currentAnswers.find((a) => a.questionId === qId);
  const answeredCount = currentAnswers.length;
  const progressPct = currentQuestions.length
    ? Math.round((answeredCount / currentQuestions.length) * 100)
    : 0;
  const getScoreTone = (score) => {
    if (typeof score !== "number") return "cat-score-low";
    if (score >= 75) return "cat-score-high";
    if (score >= 50) return "cat-score-mid";
    return "cat-score-low";
  };

  return (
    <div className="interview-prep-page">
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Interview rehearsal</span>
          <h1 className="page-title">Interactive Mock Interview Suite</h1>
          <p className="page-subtitle">Tailored technical, behavioral & experience questions with deterministic answer evaluation</p>
        </div>
        <div className="tab-pill-group">
          <button
            type="button"
            className={`tab-pill ${activeTab === "generate" ? "active" : ""}`}
            onClick={() => setActiveTab("generate")}
          >
            New Session
          </button>
          {currentSession && (
            <button
              type="button"
              className={`tab-pill ${activeTab === "live" ? "active" : ""}`}
              onClick={() => setActiveTab("live")}
            >
              Live Session {currentSession.status === "in_progress" ? "(In Progress)" : ""}
            </button>
          )}
          <button
            type="button"
            className={`tab-pill ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            Session History ({historyPagination.total || 0})
          </button>
        </div>
      </div>

      {activeTab === "generate" && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Generate Contextual Interview Questions</h3>
          </div>
          <form onSubmit={handleGenerate}>
            {formError && <div className="alert alert-danger">{formError}</div>}

            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label" htmlFor="prep-resume">Candidate Resume *</label>
                <select
                  id="prep-resume"
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
                <label className="form-label" htmlFor="prep-difficulty">Difficulty Level</label>
                <select
                  id="prep-difficulty"
                  className="form-select"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="mixed">Mixed (Recommended)</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="prep-jobTitle">Role Title (Optional)</label>
                <input
                  id="prep-jobTitle"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Backend Software Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="prep-company">Target Company (Optional)</label>
                <input
                  id="prep-company"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Google or OpenAI"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="prep-jobDesc">Job Description * (Min 100 characters)</label>
              <textarea
                id="prep-jobDesc"
                rows={6}
                className="form-textarea"
                placeholder="Paste the target job listing to extract technical requirements and evaluation rubrics..."
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
                disabled={generating || resumes.length === 0}
              >
                {generating ? <span className="spinner" /> : <><Bot size={16} /> Generate Question Set</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "live" && currentSession && (
        <div className="live-session-container">
          {/* Header Bar */}
          <div className="card live-session-header-card">
            <div className="live-header-info">
              <span className="live-badge-status">
                Status: <strong>{currentSession.status.replace("_", " ").toUpperCase()}</strong>
              </span>
              <h2 className="live-title">
                {currentSession.jobTitle || "Role Preparation"}{currentSession.company ? ` — ${currentSession.company}` : ""}
              </h2>
              <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                Difficulty: <span className="font-semibold">{currentSession.difficulty}</span> • Total Questions: {currentQuestions.length} • Answered: {currentAnswers.length}
              </div>
            </div>

            <div className="live-header-actions">
              {currentSession.status === "not_started" && (
                <button type="button" className="btn btn-primary" onClick={handleStartSession}>
                  <Play size={16} /> Begin Interview
                </button>
              )}
              {currentSession.status === "in_progress" && (
                <button type="button" className="btn btn-gold" onClick={handleCompleteSession}>
                  <CheckCircle2 size={16} /> Complete & Grade
                </button>
              )}
            </div>
          </div>

          {/* Session Overview when Completed */}
          {completionResult && (
            <div className="card completion-result-card" style={{ marginTop: 20 }}>
              <div className="completion-hero">
                <div>
                  <h3 className="completion-title">Interview Completed</h3>
                  <p className="text-muted" style={{ fontSize: "0.9rem" }}>
                    Performance breakdown evaluated across all attempted categories.
                  </p>
                </div>
                <div className="completion-score-badge">
                  <div className="completion-score-num">{completionResult.overallScore}%</div>
                  <div className="completion-score-label">Overall Score</div>
                </div>
              </div>

              {/* Category Performance */}
              <div className="category-performance-grid">
                {(completionResult.categoryPerformance || []).map((cat, i) => (
                  <div key={i} className="cat-card">
                    <div className="cat-header">
                      <span className="cat-name">{cat.category}</span>
                      <span className="cat-score font-semibold">
                        {cat.averageScore !== null ? `${cat.averageScore}%` : "Unattempted"}
                      </span>
                    </div>
                    <div className="cat-meta-text">
                      {cat.attempted} of {cat.total} answered
                    </div>
                  </div>
                ))}
              </div>

              {/* Recommended topics */}
              <div className="recommended-topics-box">
                <h4 className="recommended-topics-title">Focus & Revision Areas</h4>
                <div className="skills-pill-wrap">
                  {(completionResult.recommendedTopicsToRevise || []).map((t, idx) => (
                    <span key={idx} className="skill-pill skill-partial">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Question Navigator & Active Question View */}
          <div className="interview-split-grid" style={{ marginTop: 20 }}>
            {/* Sidebar Navigator */}
            <div className="card question-nav-sidebar">
              <h4 className="nav-title">Questions ({currentQuestions.length})</h4>
              <div className="question-nav-list">
                {currentQuestions.map((q, idx) => {
                  const answered = isQuestionAnswered(q.questionId);
                  const isCurrent = idx === activeQuestionIndex;
                  return (
                    <div
                      key={q.questionId}
                      className={`q-nav-item ${isCurrent ? "active" : ""} ${answered ? "answered" : ""}`}
                      onClick={() => setActiveQuestionIndex(idx)}
                    >
                      <div className="q-nav-index">Q{idx + 1}</div>
                      <div className="q-nav-body">
                        <div className="q-nav-category">{q.category}</div>
                        <div className="q-nav-preview">{q.text.slice(0, 50)}...</div>
                      </div>
                      {answered && <CheckCircle2 size={16} className="text-success" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Question & Submission Pane */}
            <div className="card question-active-pane">
              {currentQ ? (
                <>
                  <div className="question-header-row">
                    <span className="badge badge-interview">
                      {currentQ.category}
                    </span>
                    <span className="badge badge-screening">
                      {currentQ.difficulty}
                    </span>
                    <span className="text-muted" style={{ fontSize: "0.85rem", marginLeft: "auto" }}>
                      Question {activeQuestionIndex + 1} of {currentQuestions.length}
                    </span>
                  </div>

                  <h3 className="active-question-prompt">{currentQ.text}</h3>

                  {currentQ.whyRelevant && (
                    <div className="why-relevant-note">
                      <strong>Context:</strong> {currentQ.whyRelevant}
                    </div>
                  )}

                  {currentQ.keyConcepts && currentQ.keyConcepts.length > 0 && (
                    <div className="concepts-chips-row">
                      <span className="text-muted" style={{ fontSize: "0.8rem", marginRight: 6 }}>Key Concepts:</span>
                      {currentQ.keyConcepts.map((c, i) => (
                        <span key={i} className="concept-chip">{c}</span>
                      ))}
                    </div>
                  )}

                  {/* If already answered, display submitted answer & evaluation */}
                  {isQuestionAnswered(currentQ.questionId) ? (
                    <div className="submitted-answer-box">
                      <div className="submitted-answer-header">
                        <h4 className="font-semibold">Candidate Submission</h4>
                        <div className="evaluation-pill-score">
                          Score: {getExistingAnswer(currentQ.questionId)?.score}%
                        </div>
                      </div>
                      <p className="submitted-answer-text">
                        {getExistingAnswer(currentQ.questionId)?.answerText}
                      </p>

                      {/* Evaluation Feedback */}
                      {getExistingAnswer(currentQ.questionId) && (
                        <div className="feedback-eval-section">
                          <h4 className="feedback-heading">Evaluation Breakdown</h4>

                          <div className="feedback-col-grid">
                            <div className="feedback-col feedback-good">
                              <strong>Strengths Identified:</strong>
                              <ul>
                                {getExistingAnswer(currentQ.questionId).strengths?.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="feedback-col feedback-warn">
                              <strong>Missing Concepts & Gaps:</strong>
                              <ul>
                                {getExistingAnswer(currentQ.questionId).missingConcepts?.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {getExistingAnswer(currentQ.questionId).improvementSuggestions?.length > 0 && (
                            <div className="suggestions-box" style={{ marginTop: 12 }}>
                              <strong>Improvement Advice:</strong>
                              <ul>
                                {getExistingAnswer(currentQ.questionId).improvementSuggestions.map((sug, i) => (
                                  <li key={i}>{sug}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : currentSession.status === "in_progress" ? (
                    /* Answer Input Form */
                    <form onSubmit={handleSubmitAnswer} className="answer-form" style={{ marginTop: 20 }}>
                      {answerError && <div className="alert alert-danger">{answerError}</div>}
                      <label className="form-label" htmlFor="answer-input">
                        Your Professional Answer (Minimum 20 characters)
                      </label>
                      <textarea
                        id="answer-input"
                        rows={6}
                        className="form-textarea"
                        placeholder="Structure your answer clearly, including relevant experience, technical trade-offs, and verification approach..."
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        required
                      />
                      <div className="char-count-meta">{answerText.length} / 5,000 characters</div>

                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={evaluating}
                        >
                          {evaluating ? <span className="spinner" /> : <><Send size={15} /> Evaluate & Submit Answer</>}
                        </button>
                      </div>
                    </form>
                  ) : currentSession.status === "not_started" ? (
                    <div className="alert alert-info" style={{ marginTop: 20 }}>
                      Click <strong>Begin Interview</strong> above to start your timed evaluation session.
                    </div>
                  ) : (
                    <div className="alert alert-info" style={{ marginTop: 20 }}>
                      This interview session has been completed.
                    </div>
                  )}
                </>
              ) : (
                <EmptyState title="No question selected" />
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Previous Mock Interview Sessions</h3>
          </div>

          {loadingHistory ? (
            <LoadingState message="Loading interview sessions..." />
          ) : history.length === 0 ? (
            <EmptyState
              title="No interview sessions recorded"
              description="Generate a question set to launch your first AI mock interview."
              actionText="Create Session"
              onAction={() => setActiveTab("generate")}
            />
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Position & Company</th>
                      <th>Status</th>
                      <th>Difficulty</th>
                      <th>Questions</th>
                      <th>Score</th>
                      <th>Date</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((sess) => (
                      <tr 
                        key={sess.id || sess._id} 
                        onClick={() => handleViewHistorySession(sess.id || sess._id)} 
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <div className="app-role-cell">
                            <span className="font-semibold">{sess.jobTitle || "Custom Interview"}</span>
                            <span className="app-company-sub">{sess.company || "General"}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge badge-${sess.status === "completed" ? "offer" : sess.status === "in_progress" ? "screening" : "applied"}`}>
                            {sess.status.replace("_", " ")}
                          </span>
                        </td>
                        <td>
                          <span className="type-pill">{sess.difficulty}</span>
                        </td>
                        <td>
                          <span className="font-semibold">{sess.questionCount || 0}</span>
                        </td>
                        <td>
                          <span className="font-semibold">
                            {sess.overallScore !== null && sess.overallScore !== undefined ? `${sess.overallScore}%` : "—"}
                          </span>
                        </td>
                        <td className="text-muted" style={{ fontSize: "0.85rem" }}>
                          {sess.createdAt ? new Date(sess.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                          <div className="action-buttons-wrap">
                            <button
                              type="button"
                              className="btn-action-icon btn-action-danger"
                              onClick={() => setDeleteTargetId(sess.id || sess._id)}
                              title="Delete record"
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

      {/* History Session Dossier Modal */}
      <Modal
        isOpen={Boolean(selectedSessionDetail)}
        onClose={() => setSelectedSessionDetail(null)}
        title="Session Dossier"
        footer={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setSelectedSessionDetail(null)}
          >
            Close
          </button>
        }
      >
        {selectedSessionDetail && (
          <div className="history-session-modal-content">
            <div className="detail-hero">
              <div>
                <h3 className="detail-role">{selectedSessionDetail.jobTitle || "Interview Session"}</h3>
                <div className="detail-company">{selectedSessionDetail.company || "General"}</div>
              </div>
              {selectedSessionDetail.overallScore !== null && selectedSessionDetail.overallScore !== undefined && (
                <div className="score-badge score-high">
                  <span className="score-num">{selectedSessionDetail.overallScore}%</span>
                </div>
              )}
            </div>

            <div className="session-questions-review-list" style={{ marginTop: 20 }}>
              {(selectedSessionDetail.questions || []).map((q, idx) => {
                const answer = (selectedSessionDetail.answers || []).find((a) => a.questionId === q.questionId);
                return (
                  <div key={q.questionId} className="card question-review-card" style={{ marginBottom: 16 }}>
                    <div className="review-q-header">
                      <span className="font-semibold">Q{idx + 1}. {q.text}</span>
                      <span className="badge badge-interview">{q.category}</span>
                    </div>

                    {answer ? (
                      <div className="review-answer-body" style={{ marginTop: 10 }}>
                        <div className="review-answer-text">
                          <strong>Your Answer:</strong> {answer.answerText}
                        </div>
                        <div className="review-eval-score font-semibold text-success" style={{ marginTop: 6 }}>
                          Score: {answer.score}%
                        </div>
                      </div>
                    ) : (
                      <div className="text-muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>
                        Unanswered question
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        title="Delete Interview Session"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDeleteTargetId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteSession}
            >
              Delete Session
            </button>
          </>
        }
      >
        <p>Are you sure you want to permanently delete this interview preparation session?</p>
      </Modal>
    </div>
  );
};
