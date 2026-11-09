import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit3, 
  ExternalLink, 
  Building, 
  MapPin, 
  Calendar, 
  DollarSign,
  ChevronDown
} from "lucide-react";
import { applicationService } from "../services";
import { StatusBadge, EmptyState, LoadingState, Modal, Pagination } from "../components/common";

const INITIAL_FORM = {
  company: "",
  role: "",
  status: "applied",
  jobUrl: "",
  location: "",
  salary: "",
  employmentType: "full-time",
  description: "",
  notes: "",
  deadline: "",
};

export const ApplicationsPage = () => {
  const [applications, setApplications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadApplications(pagination.page);
  }, [statusFilter, sortOrder]);

  const loadApplications = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page,
        limit: 10,
        sort: sortOrder,
      };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await applicationService.list(params);
      setApplications(res.applications || []);
      setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadApplications(1);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (app) => {
    setEditingId(app._id);
    setFormData({
      company: app.company || "",
      role: app.role || "",
      status: app.status || "applied",
      jobUrl: app.jobUrl || "",
      location: app.location || "",
      salary: app.salary || "",
      employmentType: app.employmentType || "full-time",
      description: app.description || "",
      notes: app.notes || "",
      deadline: app.deadline ? app.deadline.slice(0, 10) : "",
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openDetailModal = (app) => {
    setSelectedApp(app);
    setIsDetailOpen(true);
  };

  const openDeleteModal = (app) => {
    setSelectedApp(app);
    setIsDeleteOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.company.trim()) errors.company = "Company is required";
    if (!formData.role.trim()) errors.role = "Role is required";
    if (formData.jobUrl && !/^https?:\/\/.+/i.test(formData.jobUrl.trim())) {
      errors.jobUrl = "Job URL must be a valid http or https URL";
    }
    return errors;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...formData };
      if (!payload.jobUrl) delete payload.jobUrl;
      if (!payload.location) delete payload.location;
      if (!payload.salary) delete payload.salary;
      if (!payload.description) delete payload.description;
      if (!payload.notes) delete payload.notes;
      if (!payload.deadline) delete payload.deadline;

      if (editingId) {
        await applicationService.update(editingId, payload);
      } else {
        await applicationService.create(payload);
      }
      setIsModalOpen(false);
      loadApplications(editingId ? pagination.page : 1);
    } catch (err) {
      if (err.errors) {
        setFormErrors(err.errors);
      } else {
        setFormErrors({ general: err.message || "Failed to save application" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedApp) return;
    setSubmitting(true);
    try {
      await applicationService.delete(selectedApp._id);
      setIsDeleteOpen(false);
      setSelectedApp(null);
      loadApplications(pagination.page);
    } catch (err) {
      alert(err.message || "Failed to delete application");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="applications-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Application Management</h1>
          <p className="page-subtitle">Track, filter and update every internship & job pipeline milestone</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={16} /> Add Application
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Filter and Search Bar */}
      <div className="card filter-bar-card">
        <form onSubmit={handleSearchSubmit} className="filter-form">
          <div className="search-input-wrap">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="form-input search-input"
              placeholder="Search by company or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <select
              className="form-select filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="applied">Applied</option>
              <option value="screening">Screening</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
            </select>

            <select
              className="form-select filter-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>

            <button type="submit" className="btn btn-secondary">
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Applications Listing */}
      <div className="card" style={{ marginTop: 20 }}>
        {loading ? (
          <LoadingState message="Fetching application records..." />
        ) : applications.length === 0 ? (
          <EmptyState
            title="No applications match your criteria"
            description="Adjust your search filters or record a new job application."
            actionText="Add Application"
            onAction={openCreateModal}
          />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Role & Company</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Applied</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app._id} onClick={() => openDetailModal(app)} style={{ cursor: "pointer" }}>
                      <td>
                        <div className="app-role-cell">
                          <span className="font-semibold">{app.role}</span>
                          <span className="app-company-sub">{app.company}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={app.status} />
                      </td>
                      <td>
                        <span className="type-pill">{app.employmentType || "full-time"}</span>
                      </td>
                      <td className="text-muted" style={{ fontSize: "0.875rem" }}>
                        {app.location || "Remote / Unspecified"}
                      </td>
                      <td className="text-muted" style={{ fontSize: "0.85rem" }}>
                        {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <div className="action-buttons-wrap">
                          {app.jobUrl && (
                            <a
                              href={app.jobUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-action-icon"
                              title="Open Job Listing"
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}
                          <button
                            type="button"
                            className="btn-action-icon"
                            onClick={() => openEditModal(app)}
                            title="Edit"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn-action-icon btn-action-danger"
                            onClick={() => openDeleteModal(app)}
                            title="Delete"
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
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={(p) => loadApplications(p)}
            />
          </>
        )}
      </div>

      {/* Add / Edit Application Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !submitting && setIsModalOpen(false)}
        title={editingId ? "Edit Application" : "Record New Application"}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleFormSubmit}
              disabled={submitting}
            >
              {submitting ? <span className="spinner" /> : editingId ? "Update" : "Save Application"}
            </button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit}>
          {formErrors.general && <div className="alert alert-danger">{formErrors.general}</div>}

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="app-role">Job Title / Role *</label>
              <input
                id="app-role"
                name="role"
                type="text"
                className="form-input"
                placeholder="e.g. Software Engineer Intern"
                value={formData.role}
                onChange={handleFormChange}
                required
              />
              {formErrors.role && <div className="form-error">{formErrors.role}</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="app-company">Company *</label>
              <input
                id="app-company"
                name="company"
                type="text"
                className="form-input"
                placeholder="e.g. Acme Corp"
                value={formData.company}
                onChange={handleFormChange}
                required
              />
              {formErrors.company && <div className="form-error">{formErrors.company}</div>}
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="app-status">Application Status</label>
              <select
                id="app-status"
                name="status"
                className="form-select"
                value={formData.status}
                onChange={handleFormChange}
              >
                <option value="applied">Applied</option>
                <option value="screening">Screening</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="app-employmentType">Employment Type</label>
              <select
                id="app-employmentType"
                name="employmentType"
                className="form-select"
                value={formData.employmentType}
                onChange={handleFormChange}
              >
                <option value="full-time">Full-Time</option>
                <option value="part-time">Part-Time</option>
                <option value="internship">Internship</option>
                <option value="contract">Contract</option>
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="app-location">Location</label>
              <input
                id="app-location"
                name="location"
                type="text"
                className="form-input"
                placeholder="e.g. San Francisco, CA or Remote"
                value={formData.location}
                onChange={handleFormChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="app-salary">Compensation / Stipend</label>
              <input
                id="app-salary"
                name="salary"
                type="text"
                className="form-input"
                placeholder="e.g. $45/hr or $90,000"
                value={formData.salary}
                onChange={handleFormChange}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="app-jobUrl">Job Listing URL</label>
              <input
                id="app-jobUrl"
                name="jobUrl"
                type="url"
                className="form-input"
                placeholder="https://..."
                value={formData.jobUrl}
                onChange={handleFormChange}
              />
              {formErrors.jobUrl && <div className="form-error">{formErrors.jobUrl}</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="app-deadline">Application Deadline</label>
              <input
                id="app-deadline"
                name="deadline"
                type="date"
                className="form-input"
                value={formData.deadline}
                onChange={handleFormChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="app-notes">Personal Notes & Preparation</label>
            <textarea
              id="app-notes"
              name="notes"
              rows={3}
              className="form-textarea"
              placeholder="Referral contacts, follow-up dates, interviewer names..."
              value={formData.notes}
              onChange={handleFormChange}
            />
          </div>
        </form>
      </Modal>

      {/* Details View Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Application Dossier"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setIsDetailOpen(false);
                openEditModal(selectedApp);
              }}
            >
              <Edit3 size={15} /> Edit
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsDetailOpen(false)}
            >
              Done
            </button>
          </>
        }
      >
        {selectedApp && (
          <div className="app-detail-view">
            <div className="detail-hero">
              <div>
                <h2 className="detail-role">{selectedApp.role}</h2>
                <div className="detail-company">{selectedApp.company}</div>
              </div>
              <StatusBadge status={selectedApp.status} />
            </div>

            <div className="detail-meta-grid">
              <div className="detail-meta-item">
                <span className="detail-meta-label">Employment Type</span>
                <span className="detail-meta-val">{selectedApp.employmentType || "—"}</span>
              </div>
              <div className="detail-meta-item">
                <span className="detail-meta-label">Location</span>
                <span className="detail-meta-val">{selectedApp.location || "—"}</span>
              </div>
              <div className="detail-meta-item">
                <span className="detail-meta-label">Compensation</span>
                <span className="detail-meta-val">{selectedApp.salary || "—"}</span>
              </div>
              <div className="detail-meta-item">
                <span className="detail-meta-label">Created Date</span>
                <span className="detail-meta-val">
                  {selectedApp.createdAt ? new Date(selectedApp.createdAt).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>

            {selectedApp.jobUrl && (
              <div style={{ marginTop: 16 }}>
                <a
                  href={selectedApp.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  <ExternalLink size={14} /> Open Job Posting
                </a>
              </div>
            )}

            {selectedApp.notes && (
              <div className="detail-section">
                <h4 className="detail-section-title">Candidate Notes</h4>
                <div className="detail-notes-box">{selectedApp.notes}</div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => !submitting && setIsDeleteOpen(false)}
        title="Confirm Application Removal"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsDeleteOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? <span className="spinner" /> : "Permanently Delete"}
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to delete the application for{" "}
          <strong>{selectedApp?.role}</strong> at <strong>{selectedApp?.company}</strong>?
        </p>
        <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>
          This operation cannot be undone. Associated matching snapshots and interview prep sessions will remain preserved in history.
        </p>
      </Modal>
    </div>
  );
};
