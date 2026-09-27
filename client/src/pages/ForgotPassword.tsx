import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import Notice from '../components/Notice';
import SubmitButton from '../components/SubmitButton';
import TextField from '../components/TextField';
import { api, getErrorMessage } from '../lib/api';
import type { MessageResponse } from '../types';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // The server always answers 200 so nobody can find out which emails are registered.
      const data = await api<MessageResponse>('/auth/forgot-password', { method: 'POST', body: { email } });
      setSuccessMessage(data.message);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Tell us the email you signed up with and we'll send a link to set a new one."
    >
      {error && <Notice kind="error">{error}</Notice>}

      {successMessage ? (
        <Notice kind="success">{successMessage}</Notice>
      ) : (
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
          <SubmitButton loading={submitting} loadingText="Sending…">
            Send reset link
          </SubmitButton>
        </form>
      )}

      <Link to="/login" className="block text-center text-sm text-muted hover:text-ink">
        Back to login
      </Link>
    </AuthLayout>
  );
}
