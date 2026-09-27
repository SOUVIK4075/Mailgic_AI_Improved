import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const STEPS = [
  {
    n: 'i.',
    title: 'Write, or paste what you got',
    text: 'Describe a new email in a line or two, or paste one from your inbox. No templates to fill in.',
  },
  {
    n: 'ii.',
    title: 'It checks your documents',
    text: 'Upload a resume, price list or policy once. Mailgic pulls the few passages that matter and quotes those.',
  },
  {
    n: 'iii.',
    title: 'You fill the gaps and send',
    text: "Anything it couldn't find is highlighted as a [placeholder], so nothing made-up slips into your outbox.",
  },
];

const USES = [
  'Cover letters that only mention skills from your actual resume',
  'Support replies that quote your real refund policy',
  'Follow-ups after a meeting or an interview',
  'Saying no politely, without writing three drafts',
];

/** A static copy of a real reply Mailgic wrote, used as the hero illustration. */
function SampleExchange() {
  return (
    <div className="relative">
      <div className="rounded-lg border border-line bg-paper px-5 py-4 text-sm text-muted">
        <p className="meta mb-2">From Priya Sharma</p>
        <p className="font-serif leading-relaxed">
          We bought the Pro plan 10 days ago but it doesn't fit our team. Can we get a refund, and how long will it
          take?
        </p>
      </div>

      <article className="relative -mt-3 ml-6 rounded-lg border border-line bg-sheet shadow-[0_24px_48px_-30px_rgba(31,29,26,0.45)] sm:ml-10">
        <div className="flex items-baseline gap-3 border-b border-line px-6 py-3.5">
          <span className="meta">Subject</span>
          <span className="font-serif font-medium">Re: Your refund</span>
        </div>
        <div className="px-6 py-5 font-serif text-[16px] leading-[1.7]">
          <p>Hi Priya,</p>
          <p className="mt-3">
            Yes — you bought the plan 10 days ago, which is inside our 14-day refund window
            <sup className="ml-0.5 font-sans text-[10px] text-accent">1</sup>. The money goes back to your original
            payment method within 5–7 business days.
          </p>
          <p className="mt-3">
            I've started it for you; your reference is <mark className="rounded-[3px] bg-marker px-0.5">[Refund ID]</mark>.
          </p>
          <p className="mt-3">Best,<br />Souvik</p>
        </div>
        <div className="border-t border-dashed border-line px-6 py-3 text-xs text-muted">
          <span className="font-mono text-faint">1.</span> <span className="font-medium text-ink">Refund policy.pdf</span> — “Full
          refund within 14 days of purchase…”
        </div>
      </article>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="grid items-center gap-14 py-16 md:grid-cols-[1.05fr_1fr] md:py-24">
        <div>
          <p className="meta">Email, minus the guesswork</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] font-medium tracking-tight md:text-6xl">
            Replies that stick to what you actually know.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
            Mailgic drafts new emails and answers the ones in your inbox. Give it your resume, price list or refund
            policy and it quotes those. Whatever it doesn't know stays highlighted for you to fill in.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link to={user ? '/app' : '/signup'} className="btn px-5 py-3 text-base">
              {user ? 'Open Mailgic' : 'Start writing'}
            </Link>
            {!user && (
              <Link to="/login" className="text-sm text-muted hover:text-ink">
                I already have an account →
              </Link>
            )}
          </div>
        </div>

        <SampleExchange />
      </section>

      <section className="border-t border-line py-16">
        <h2 className="font-serif text-2xl font-medium">How it works</h2>
        <ol className="mt-8 grid gap-10 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="font-serif text-2xl italic text-accent">{s.n}</span>
              <h3 className="mt-2 font-medium">{s.title}</h3>
              <p className="mt-1.5 leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-12 border-t border-line py-16 md:grid-cols-2">
        <div>
          <h2 className="font-serif text-2xl font-medium">Why the yellow highlights?</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Most AI writing tools fill gaps with something that sounds right — a date, a price, a name. That's fine
            until you send it. Mailgic is told to only use facts from what you typed or uploaded. When a detail is
            missing it writes <mark className="rounded-[3px] bg-marker px-0.5 text-ink">[Meeting Date]</mark> instead,
            and lists every one so you can't miss them.
          </p>
        </div>
        <div>
          <h2 className="font-serif text-2xl font-medium">Good for</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {USES.map((u) => (
              <li key={u} className="py-3 text-muted">
                {u}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col items-start justify-between gap-6 border-t border-line py-14 sm:flex-row sm:items-center">
        <p className="font-serif text-2xl">Try it with one of your own documents.</p>
        <Link to={user ? '/app/knowledge' : '/signup'} className="btn px-5 py-3 text-base">
          {user ? 'Add a document' : 'Create a free account'}
        </Link>
      </section>
    </div>
  );
}
