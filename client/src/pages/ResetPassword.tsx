import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import Notice from '../components/Notice';
import SubmitButton from '../components/SubmitButton';
import TextField from '../components/TextField';
import { api, getErrorMessage } from '../lib/api';
import type { MessageResponse } from '../types';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await api<MessageResponse>('/auth/reset-password', { method: 'POST', body: { token, password } });
      setSuccessMessage(data.message);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Invalid reset link">
        <Notice kind="error">This link is missing its reset token.</Notice>
        <Link to="/forgot-password" className="link block text-center">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      {error && <Notice kind="error">{error}</Notice>}

      {successMessage ? (
        <>
          {/* The server signs out every session after a reset, so the user must log in again. */}
          <Notice kind="success">{successMessage}</Notice>
          <Link to="/login" className="btn w-full">
            Go to login
          </Link>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <TextField
            id="password"
            label="New password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          />
          <TextField
            id="confirm"
            label="Confirm new password"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your password"
          />
          <SubmitButton loading={submitting} loadingText="Saving…">
            Reset password
          </SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
