import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import Notice from '../components/Notice';
import SubmitButton from '../components/SubmitButton';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { ApiError, getErrorMessage } from '../lib/api';

const MIN_PASSWORD_LENGTH = 8; // same rule as the server

export default function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  function update(field: keyof typeof form, value: string) {
    setForm({ ...form, [field]: value });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    // Quick checks before calling the server (the server validates again).
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await signup(form.name.trim(), form.email.trim(), form.password);
      navigate('/app', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setError('An account with this email already exists. Try logging in.');
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle={
        <>
          Already have an account?{' '}
          <Link to="/login" className="link">
            Log in
          </Link>
        </>
      }
    >
      {error && <Notice kind="error">{error}</Notice>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <TextField id="name" label="Name" required autoComplete="name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Used to sign your emails" />
        <TextField id="email" label="Email address" type="email" required autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" />
        <TextField
          id="password"
          label="Password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />
        <TextField
          id="confirm"
          label="Confirm password"
          type="password"
          required
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => update('confirm', e.target.value)}
          placeholder="Repeat your password"
        />
        <SubmitButton loading={submitting} loadingText="Creating your account…">
          Create account
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
