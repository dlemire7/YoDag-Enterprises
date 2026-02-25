import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import Dashboard from './pages/Dashboard';
import Study from './pages/Study';
import Stats from './pages/Stats';
import Import from './pages/Import';
import Settings from './pages/Settings';
import './styles/tokens.css';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '\u25C9' },
  { path: '/study', label: 'Study', icon: '\u25B3' },
  { path: '/stats', label: 'Stats', icon: '\u25C8' },
  { path: '/import', label: 'Import', icon: '\u27F3' },
  { path: '/settings', label: 'Settings', icon: '\u270E' },
];

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar nav */}
        <nav style={{
          width: 220,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          padding: 'var(--space-lg) 0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          {/* Brand */}
          <div style={{
            padding: '0 var(--space-lg) var(--space-xl)',
            borderBottom: '1px solid var(--border)',
            marginBottom: 'var(--space-lg)',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 4,
            }}>
              LearnedLeague
            </div>
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.1,
            }}>
              Trivia<br />Study
            </div>
          </div>

          {/* Nav links */}
          {navItems.map(({ path, label, icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px var(--space-lg)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: 1,
                textDecoration: 'none',
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--info)' : '2px solid transparent',
                transition: 'var(--transition)',
              })}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <main style={{
          flex: 1,
          padding: 'var(--space-xl)',
          overflowY: 'auto',
          maxWidth: 1200,
        }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/study" element={<Study />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/import" element={<Import />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
