import { Outlet, NavLink } from "react-router-dom";

const NAV = [
  { to: "/dashboard", label: "Dashboard",  icon: "⬡" },
  { to: "/scan",      label: "New Scan",   icon: "◈" },
];

export default function Layout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: "var(--surface)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky",
        top: 0, height: "100vh",
      }}>
        {/* Logo */}
        <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--accent)", letterSpacing: 2, textTransform: "uppercase" }}>
            ◈ Code
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text-2)", letterSpacing: 2, textTransform: "uppercase" }}>
            &nbsp;&nbsp;Analyzer
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
              borderRadius: "var(--radius)", marginBottom: 4, fontSize: 13,
              fontWeight: 500, color: isActive ? "var(--accent)" : "var(--text-2)",
              background: isActive ? "var(--accent-dim)" : "transparent",
              textDecoration: "none", transition: "all var(--transition)",
            })}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 15 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
          v1.0.0 · offline
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
