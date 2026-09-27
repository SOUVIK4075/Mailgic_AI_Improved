import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-5 py-24">
      <p className="meta">404</p>
      <h1 className="mt-2 font-serif text-3xl font-medium">This page got lost in the post.</h1>
      <p className="mt-2 text-muted">The link might be old, or there might be a typo in the address.</p>
      <Link to="/" className="btn mt-6">
        Back to the start
      </Link>
    </div>
  );
}
