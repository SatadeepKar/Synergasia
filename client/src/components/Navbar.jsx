import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <span className="navbar-logo">
          <span className="icon">dashboard</span>
        </span>
        <span className="navbar-title">Synergasia</span>
      </Link>
      <div className="navbar-actions">
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          <span className="icon" key={theme}>
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
        {user ? (
          <>
            <div className="navbar-user-pill">
              <div className="navbar-avatar">
                {user.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="navbar-user-name">{user.name}</span>
            </div>
            <button className="btn-outline" onClick={handleLogout}>
              <span className="icon" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>logout</span>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn-outline">Login</Link>
            <Link to="/register" className="btn-primary">Get Started</Link>
          </>
        )}
      </div>
    </nav>
  );
}
