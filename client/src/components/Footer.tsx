export default function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted sm:flex-row sm:justify-between">
        <p>Mailgic is a side project by Souvik Khanra.</p>
        <p>
          React, Express &amp; MongoDB ·{' '}
          <a href="https://github.com/SOUVIK4075/Mailgic-AI" className="link" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
