import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  Briefcase, 
  FileText, 
  Target, 
  Bot, 
  LogOut
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const AppLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/applications", label: "Applications", icon: Briefcase },
    { to: "/resumes", label: "Resumes", icon: FileText },
    { to: "/matching", label: "Job Matching", icon: Target },
    { to: "/interview-prep", label: "Mock Interviews", icon: Bot },
  ];

  const getInitials = (name) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo-icon">IT</div>
          <div>InternTrack AI</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-badge">
            <div className="user-avatar">{getInitials(user?.name)}</div>
            <div className="user-info">
              <div className="user-name">{user?.name || "User"}</div>
              <div className="user-email">{user?.email || ""}</div>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon-logout"
            onClick={handleLogout}
            title="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="content-body">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
