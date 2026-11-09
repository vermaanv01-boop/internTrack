import { 
  Search
} from "lucide-react";

export const StatusBadge = ({ status }) => {
  const normalized = (status || "").toLowerCase();
  return <span className={`badge badge-${normalized}`}>{normalized}</span>;
};

export const ScoreBadge = ({ score, label }) => {
  let colorClass = "score-low";
  if (score >= 75) colorClass = "score-high";
  else if (score >= 50) colorClass = "score-mid";

  return (
    <div className={`score-badge ${colorClass}`}>
      <span className="score-num">{score}%</span>
      {label && <span className="score-text">{label}</span>}
    </div>
  );
};

export const EmptyState = ({ title, description, actionText, onAction, icon: Icon = Search }) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon size={36} strokeWidth={1.5} />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {actionText && onAction && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
};

export const LoadingState = ({ message = "Loading..." }) => {
  return (
    <div className="loading-state">
      <div className="spinner" style={{ width: 28, height: 28 }} />
      <p className="loading-text">{message}</p>
    </div>
  );
};

export const Modal = ({ isOpen, onClose, title, children, footer }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export const Pagination = ({ page, totalPages, onPageChange }) => {
  if (!totalPages || totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button 
        type="button" 
        className="btn btn-secondary btn-sm" 
        disabled={page <= 1} 
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <span className="pagination-info">
        Page {page} of {totalPages}
      </span>
      <button 
        type="button" 
        className="btn btn-secondary btn-sm" 
        disabled={page >= totalPages} 
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
};
