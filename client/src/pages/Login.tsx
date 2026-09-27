import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import Notice from '../components/Notice';
import SubmitButton from '../components/SubmitButton';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/api';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ProtectedRoute puts the page the user originally wanted in location.state.
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  if (user) return <Navigate to={from} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Log in"
      subtitle={
        <>
          New here?{' '}
          <Link to="/signup" className="link">
            Create an account
          </Link>
        </>
      }
    >
      {error && <Notice kind="error">{error}</Notice>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <TextField
          id="email"
          label="Email address"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
        />
        <div className="-mt-2 text-right text-sm">
          <Link to="/forgot-password" className="text-muted hover:text-ink">
            Forgot your password?
          </Link>
        </div>
        <SubmitButton loading={submitting} loadingText="Logging in…">
          Log in
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
