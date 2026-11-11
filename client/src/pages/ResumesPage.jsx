import { useState, useEffect, useRef, useCallback } from "react";
import { 
  UploadCloud, 
  FileText, 
  CheckCircle, 
  Download, 
  Trash2
} from "lucide-react";
import { resumeService } from "../services";
import { EmptyState, LoadingState, Modal } from "../components/common";

export const ResumesPage = () => {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const fileInputRef = useRef(null);

  const loadResumes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await resumeService.list();
      setResumes(res.resumes || []);
    } catch (err) {
      setError(err.message || "Failed to load resumes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  const uploadFile = async (file) => {
    if (!file) return;

    setUploadError("");
    setUploading(true);

    try {
      await resumeService.upload(file);
      await loadResumes();
    } catch (err) {
      setUploadError(err.message || "Failed to upload resume. PDF or DOCX up to 5MB supported.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    await uploadFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploading) return;
    uploadFile(e.dataTransfer.files?.[0]);
  };

  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };

  const handleUploadZoneKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!uploading) fileInputRef.current?.click();
    }
  };

  const handleActivate = async (id) => {
    setActionLoading(true);
    try {
      await resumeService.activate(id);
      await loadResumes();
    } catch (err) {
      alert(err.message || "Failed to activate resume");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (resume) => {
    try {
      const { blob } = await resumeService.download(resume._id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resume.originalName || "resume";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err.message || "Failed to download resume file");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      await resumeService.delete(deleteTarget._id);
      setDeleteTarget(null);
      await loadResumes();
    } catch (err) {
      alert(err.message || "Failed to delete resume");
    } finally {
      setActionLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 KB";
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="resumes-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Resume Asset Repository</h1>
          <p className="page-subtitle">Upload multiple iterations and designate an active canonical resume for AI evaluations</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <span className="spinner" /> : <><UploadCloud size={16} /> Upload New Resume</>}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {uploadError && <div className="alert alert-danger">{uploadError}</div>}

      {/* Upload Zone Card */}
      <div 
        className="card resume-upload-zone" 
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <div className="upload-zone-content">
          <UploadCloud size={40} className="upload-zone-icon" />
          <h3 className="upload-zone-title">Upload candidate resume (PDF or DOCX)</h3>
          <p className="upload-zone-desc">
            Maximum file size: 5MB. Text extraction and security scanning are performed automatically.
          </p>
          <button type="button" className="btn btn-secondary btn-sm" disabled={uploading}>
            {uploading ? "Extracting Text & Validating..." : "Select File From Computer"}
          </button>
        </div>
      </div>

      {/* Resumes List */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Version History ({resumes.length})</h3>
        </div>

        {loading ? (
          <LoadingState message="Loading uploaded resume catalog..." />
        ) : resumes.length === 0 ? (
          <EmptyState
            title="No resumes found"
            description="Upload your first resume to enable automated job matching and interview preparation."
            actionText="Upload Resume"
            onAction={() => fileInputRef.current?.click()}
            icon={FileText}
          />
        ) : (
          <div className="resume-grid">
            {resumes.map((res) => (
              <div 
                key={res._id} 
                className={`card resume-card ${res.isActive ? "resume-active-border" : ""}`}
              >
                <div className="resume-card-top">
                  <div className="resume-type-icon">
                    <FileText size={22} />
                  </div>
                  <div className="resume-card-main">
                    <div className="resume-filename" title={res.originalName}>
                      {res.originalName}
                    </div>
                    <div className="resume-file-meta">
                      {formatFileSize(res.fileSize)} • {new Date(res.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {res.isActive && (
                    <span className="badge badge-active" title="Primary resume used for match evaluations">
                      <CheckCircle size={12} /> Active
                    </span>
                  )}
                </div>

                <div className="resume-card-details">
                  <div className="resume-feature-row">
                    <span className="resume-feature-label">Text Extracted:</span>
                    <span className="resume-feature-val">
                      {res.hasExtractedText ? (
                        <span className="text-success font-semibold">Ready ({res.textLength} chars)</span>
                      ) : (
                        <span className="text-danger font-semibold">No extractable text</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="resume-card-actions">
                  {!res.isActive && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleActivate(res._id)}
                      disabled={actionLoading}
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDownload(res)}
                    title="Download document"
                  >
                    <Download size={14} /> Download
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger-outline btn-sm"
                    onClick={() => setDeleteTarget(res)}
                    disabled={actionLoading}
                    title="Delete resume"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !actionLoading && setDeleteTarget(null)}
        title="Confirm Resume Deletion"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={actionLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={actionLoading}
            >
              {actionLoading ? <span className="spinner" /> : "Delete Resume"}
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to permanently delete <strong>{deleteTarget?.originalName}</strong>?
        </p>
        <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>
          The file on disk and its extracted text will be wiped. Existing job match and interview prep snapshots created with this resume will remain preserved.
        </p>
      </Modal>
    </div>
  );
};
