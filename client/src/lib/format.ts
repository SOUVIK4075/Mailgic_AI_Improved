/** Inbox-style dates: "2:33 pm" for today, "27 Sep" this year, "27 Sep 2025" otherwise. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/** Text used by the copy button and the mail link. */
export function emailAsText(subject: string, body: string): string {
  return `Subject: ${subject}\n\n${body}`;
}

export function mailtoLink(subject: string, body: string, to = ''): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Gmail's "compose" URL. Opening it shows a new message in whichever Gmail account is signed in,
 * with To, Subject and Body already filled — the user only has to press Send.
 */
export function gmailComposeLink(to: string, subject: string, body: string): string {
  // encodeURIComponent (not URLSearchParams) so spaces become %20 rather than "+".
  const q = (value: string) => encodeURIComponent(value);
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${q(to)}&su=${q(subject)}&body=${q(body)}`;
}

/** First email address found in a pasted email (usually the sender's), or '' if none. */
export function findEmailAddress(text: string): string {
  return text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0] ?? '';
}

/** Checks a comma-separated list of addresses. Same rule as the server. */
export function isValidRecipientList(value: string): boolean {
  const parts = value.split(',').map((p) => p.trim());
  return parts.length > 0 && parts.every((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
}

/** "Tuesday 29 September at 9:00 am" — used for reminder times. */
export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
