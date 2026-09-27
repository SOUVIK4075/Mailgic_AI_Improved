import { useState } from 'react';
import AnalysisPanel from '../components/AnalysisPanel';
import { useUsage } from '../components/AppShell';
import CharCounter from '../components/CharCounter';
import ChoiceCard from '../components/ChoiceCard';
import FullPageSpinner from '../components/FullPageSpinner';
import KnowledgeCheckbox from '../components/KnowledgeCheckbox';
import LiveDraft from '../components/LiveDraft';
import Notice from '../components/Notice';
import ReviewAndSend from '../components/ReviewAndSend';
import StepHeading from '../components/StepHeading';
import StepNav from '../components/StepNav';
import WizardSteps from '../components/WizardSteps';
import { STOPPED_MESSAGE, useDraftStream } from '../hooks/useDraftStream';
import { useMeta } from '../hooks/useMeta';
import { ApiError, getErrorMessage } from '../lib/api';
import { findEmailAddress } from '../lib/format';
import type { Email, ReplyRequest } from '../types';

const STEPS = ['Their email', 'Your reply', 'Review & send'];
const MIN_INCOMING_CHARS = 20; // same rule as the server

/** Step 1 Paste their email → 2 Tone + instructions → 3 Review & send */
export default function Reply() {
  const { meta, error: metaError } = useMeta();
  const { setRemaining } = useUsage();

  const [step, setStep] = useState(0);
  const [incomingEmail, setIncomingEmail] = useState('');
  const [tone, setTone] = useState('friendly');
  const [instructions, setInstructions] = useState('');
  const [useKnowledge, setUseKnowledge] = useState(false);

  const [draft, setDraft] = useState<Email | null>(null);
  const [lastRequest, setLastRequest] = useState<ReplyRequest | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const stream = useDraftStream();
  const { writing } = stream;

  if (metaError) return <Notice kind="error">Could not load settings: {metaError}</Notice>;
  if (!meta) return <FullPageSpinner />;
  const { limits } = meta;

  async function generate(request: ReplyRequest) {
    setError('');
    setInfo('');
    setStep(2);
    try {
      const data = await stream.run('/emails/reply/stream', request);
      if (data) {
        setDraft(data.email);
        setLastRequest(request);
        setRemaining(data.usage.remainingToday);
        return;
      }
      setInfo(STOPPED_MESSAGE); // null = the user pressed Stop
    } catch (err) {
      setError(getErrorMessage(err));
      if (err instanceof ApiError && err.code === 'DAILY_QUOTA_EXCEEDED') setRemaining(0);
    }
    // Stopped or failed: with no earlier draft, go back to "Your reply"; otherwise show the earlier draft again.
    if (!draft) setStep(1);
  }

  function draftReply() {
    const request: ReplyRequest = { incomingEmail: incomingEmail.trim(), tone, useKnowledge };
    // `instructions` is optional in the API, so only send it when the user typed something.
    if (instructions.trim()) request.instructions = instructions.trim();
    generate(request);
  }

  function startOver() {
    setIncomingEmail('');
    setInstructions('');
    setDraft(null);
    setLastRequest(null);
    setError('');
    setInfo('');
    setStep(0);
  }

  function jumpTo(i: number) {
    if (i < 2) setDraft(null);
    setStep(i);
  }

  const senderAddress = findEmailAddress(incomingEmail);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 space-y-5">
        <h1 className="font-serif text-3xl font-medium tracking-tight">Reply to an email</h1>
        <WizardSteps steps={STEPS} current={step} onJump={jumpTo} locked={writing} />
      </header>

      {error && (
        <div className="mb-6">
          <Notice kind="error" onClose={() => setError('')}>
            {error}
          </Notice>
        </div>
      )}
      {info && (
        <div className="mb-6">
          <Notice onClose={() => setInfo('')}>{info}</Notice>
        </div>
      )}

      {step === 0 && (
        <section>
          <StepHeading title="Paste the email you got" hint="Include the sign-off (and their address, if you have it) so Mailgic knows who it's from." />
          <div className="mb-1.5 flex justify-end">
            <CharCounter length={incomingEmail.length} max={limits.incomingEmailMaxChars} />
          </div>
          <textarea
            autoFocus
            aria-label="The email you received"
            value={incomingEmail}
            maxLength={limits.incomingEmailMaxChars}
            onChange={(e) => setIncomingEmail(e.target.value)}
            placeholder={'Hi,\n\nWe bought the Pro plan 10 days ago but it doesn’t fit our team. Can we get a refund?\n\nThanks,\nPriya'}
            className="field h-64 resize-y font-serif text-[16px] leading-relaxed"
          />
          <StepNav>
            <button type="button" onClick={() => setStep(1)} disabled={incomingEmail.trim().length < MIN_INCOMING_CHARS} className="btn">
              Next
            </button>
          </StepNav>
        </section>
      )}

      {step === 1 && (
        <section>
          <StepHeading title="How do you want to reply?" />
          <p className="label">Tone</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {meta.tones.map((t) => (
              <ChoiceCard key={t.id} title={t.label} description={t.description} selected={tone === t.id} onClick={() => setTone(t.id)} />
            ))}
          </div>

          <div className="mt-6">
            <label htmlFor="instructions" className="label">
              Anything it should say? <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="instructions"
              value={instructions}
              maxLength={limits.instructionsMaxChars}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. say yes to the refund, keep it short"
              className="field"
            />
          </div>
          <div className="mt-4">
            <KnowledgeCheckbox checked={useKnowledge} onChange={setUseKnowledge} />
          </div>

          <StepNav onBack={() => setStep(0)}>
            <button type="button" onClick={draftReply} className="btn">
              Draft a reply
            </button>
          </StepNav>
        </section>
      )}

      {step === 2 && (
        <section>
          {writing && (
            <div className="space-y-8">
              <StepHeading title="Writing your reply…" hint="You can stop it at any time." />
              {/* The analysis arrives before the draft starts, so the user can check it while waiting. */}
              {stream.analysis && <AnalysisPanel analysis={stream.analysis} />}
              <LiveDraft preview={stream.preview} onStop={stream.stop} />
            </div>
          )}
          {/* Hidden (not unmounted) while a new version streams, so edits survive a Stop or an error. */}
          {draft && lastRequest && (
            <div hidden={writing} className="space-y-8">
              <StepHeading title="Check it, then send" />
              {draft.analysis && <AnalysisPanel analysis={draft.analysis} />}
              <ReviewAndSend
                key={draft.id}
                email={draft}
                defaultTo={senderAddress}
                toHint={senderAddress ? 'Picked up from their email — double-check it.' : undefined}
                regenerating={writing}
                onRegenerate={() => generate(lastRequest)}
                onStartOver={startOver}
              />
            </div>
          )}
          <StepNav onBack={writing ? undefined : () => jumpTo(1)} />
        </section>
      )}
    </div>
  );
}
