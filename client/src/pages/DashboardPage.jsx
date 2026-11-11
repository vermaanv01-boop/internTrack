import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { 
  Briefcase, 
  Calendar, 
  Clock, 
  CheckCircle, 
  Award, 
  XCircle, 
  ArrowRight,
  FileSearch
} from "lucide-react";
import { analyticsService } from "../services";
import { StatusBadge, LoadingState, EmptyState } from "../components/common";

export const DashboardPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await analyticsService.getDashboardAnalytics();
      setData(res);
    } catch (err) {
      setError(err.message || "Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return <LoadingState message="Aggregating your career analytics..." />;
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        {error}
        <button type="button" className="btn btn-sm btn-secondary" onClick={loadAnalytics} style={{ marginLeft: 12 }}>
          Retry
        </button>
      </div>
    );
  }

  const { overview = {}, pipeline = {}, trend = [], recentApplications = [] } = data || {};

  const statCards = [
    { label: "Total Applications", value: overview.totalApplications || 0, icon: Briefcase, color: "var(--color-primary)", meta: "All-time pipeline" },
    { label: "This Month", value: overview.applicationsThisMonth || 0, icon: Calendar, color: "var(--color-gold)", meta: "New submissions" },
    { label: "Pending Review", value: overview.pendingApplications || 0, icon: Clock, color: "var(--color-warning)", meta: "Awaiting response" },
    { label: "Interviews", value: overview.interviews || 0, icon: Award, color: "var(--color-info)", meta: "Scheduled rounds" },
    { label: "Offers Received", value: overview.offers || 0, icon: CheckCircle, color: "var(--color-success)", meta: "Converted outcomes" },
    { label: "Rejections", value: overview.rejections || 0, icon: XCircle, color: "var(--color-danger)", meta: "Closed out" },
  ];

  const pipelineStages = [
    { key: "applied", label: "Applied", count: pipeline.applied || 0 },
    { key: "screening", label: "Screening", count: pipeline.screening || 0 },
    { key: "interview", label: "Interview", count: pipeline.interview || 0 },
    { key: "offer", label: "Offer", count: pipeline.offer || 0 },
    { key: "rejected", label: "Rejected", count: pipeline.rejected || 0 },
    { key: "withdrawn", label: "Withdrawn", count: pipeline.withdrawn || 0 },
  ];

  const maxPipelineCount = Math.max(...pipelineStages.map((s) => s.count), 1);
  const maxTrendCount = Math.max(...trend.map((t) => t.count), 1);
  const totalPipeline = pipelineStages.reduce((sum, stage) => sum + stage.count, 0);
  const totalTrend = trend.reduce((sum, point) => sum + point.count, 0);

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Performance snapshot</span>
          <h1 className="page-title">Executive Overview</h1>
          <p className="page-subtitle">Track your recruitment momentum and AI preparation metrics</p>
        </div>
        <div className="page-actions">
          <Link to="/applications" className="btn btn-secondary btn-sm">
            <Briefcase size={14} /> View All
          </Link>
          <Link to="/matching" className="btn btn-primary btn-sm">
            <FileSearch size={14} /> Match Job
          </Link>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="metrics-grid">
        {statCards.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className={`card metric-card ${idx === 0 ? "metric-card-featured" : ""}`}>
              <div className="metric-header">
                <span className="metric-label">{stat.label}</span>
                <span className="metric-icon-wrap" style={{ color: stat.color, backgroundColor: `color-mix(in srgb, ${stat.color} 12%, transparent)` }}>
                  <Icon size={18} aria-hidden="true" />
                </span>
              </div>
              <div className="metric-value">{stat.value}</div>
              <div className="metric-meta">{stat.meta}</div>
            </div>
          );
        })}
      </div>

      <div className="dashboard-split-grid">
        {/* Pipeline Distribution Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recruitment Pipeline</h3>
          </div>
          <div className="pipeline-list">
            {pipelineStages.map((stage) => {
              const percentage = Math.round((stage.count / maxPipelineCount) * 100);
              return (
                <div key={stage.key} className="pipeline-item">
                  <div className="pipeline-label-row">
                    <span className="pipeline-stage-name">
                      <StatusBadge status={stage.key} />
                    </span>
                    <span className="pipeline-count">{stage.count}</span>
                  </div>
                  <div className="pipeline-bar-track">
                    <div 
                      className="pipeline-bar-fill" 
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: stage.key === 'offer' ? 'var(--color-success)' : 
                                         stage.key === 'rejected' ? 'var(--color-danger)' : 
                                         stage.key === 'interview' ? 'var(--color-info)' : 'var(--color-primary)'
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 6-Month Application Trend */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Application Momentum (6 Months)</h3>
          </div>
          {trend.length === 0 ? (
            <p className="text-muted" style={{ fontSize: "0.9rem" }}>No submission activity found in the last 6 months.</p>
          ) : (
            <div className="trend-chart">
              {trend.map((point) => {
                const heightPct = Math.round((point.count / maxTrendCount) * 100);
                return (
                  <div key={point.month} className="trend-bar-col">
                    <div className="trend-bar-wrap">
                      <span className="trend-bar-val">{point.count}</span>
                      <div 
                        className="trend-bar" 
                        style={{ height: `${Math.max(heightPct, 6)}%` }}
                        title={`${point.count} applications in ${point.month}`}
                      />
                    </div>
                    <span className="trend-month-label">{point.month.slice(5)}/{point.month.slice(2, 4)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Applications Section */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Recent Application Activity</h3>
          <Link to="/applications" className="card-action-link">
            Manage All <ArrowRight size={14} />
          </Link>
        </div>

        {recentApplications.length === 0 ? (
          <EmptyState
            title="No applications logged yet"
            description="Start organizing your career pipeline by adding your active job submissions."
          />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recentApplications.map((app, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{app.role}</td>
                    <td>{app.company}</td>
                    <td><StatusBadge status={app.status} /></td>
                    <td className="text-muted" style={{ fontSize: "0.85rem" }}>
                      {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
