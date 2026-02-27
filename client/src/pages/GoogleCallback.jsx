import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function GoogleCallback() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const data = searchParams.get('data');
    if (data) {
      try {
        const userData = JSON.parse(decodeURIComponent(data));
        login(userData);
        navigate('/');
      } catch {
        navigate('/login');
      }
    } else {
      navigate('/login');
    }
  }, [searchParams, login, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center', padding: '60px 36px' }}>
        <span className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Signing you in...</p>
      </div>
    </div>
  );
}
