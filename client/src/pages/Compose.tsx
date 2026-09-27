import { useState } from 'react';
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
import type { ComposeRequest, Email } from '../types';

const STEPS = ['Kind', 'Tone', 'Length', 'Message', 'Review & send'];
const WORD_PRESETS = [
  { label: 'Short', words: 80 },
  { label: 'Standard', words: 150 },
  { label: 'Detailed', words: 250 },
  { label: 'Long', words: 400 },
];

type Form = {
  type: string;
  tone: string;
  lengthOption: 'flexible' | 'custom';
  words: number;
  prompt: string;
  useKnowledge: boolean;
};

const EMPTY: Form = { type: '', tone: '', lengthOption: 'flexible', words: 150, prompt: '', useKnowledge: false };

/** Step 1 Kind → 2 Tone → 3 Length → 4 Message → 5 Review & send */
export default function Compose() {
  const { meta, error: metaError } = useMeta();
  const { setRemaining } = useUsage();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [draft, setDraft] = useState<Email | null>(null);
  const [lastRequest, setLastRequest] = useState<ComposeRequest | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const stream = useDraftStream();
  const { writing } = stream;

  if (metaError) return <Notice kind="error">Could not load settings: {metaError}</Notice>;
  if (!meta) return <FullPageSpinner />;
  const { limits } = meta;

  const update = (changes: Partial<Form>) => setForm((f) => ({ ...f, ...changes }));
  const clampWords = (n: number) => Math.min(limits.maxWords, Math.max(limits.minWords, n || limits.minWords));
  const typeLabel = meta.emailTypes.find((t) => t.id === form.type)?.label;
  const toneLabel = meta.tones.find((t) => t.id === form.tone)?.label;

  async function generate(request: ComposeRequest) {
    setError('');
    setInfo('');
    setStep(4);
    try {
      const data = await stream.run('/emails/compose/stream', request);
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
    // Stopped or failed: `draft` is still the one from before this click. With no draft yet,
    // go back to the message step; otherwise the previous draft is shown again.
    if (!draft) setStep(3);
  }

  function writeDraft() {
    generate({
      type: form.type,
      tone: form.tone,
      prompt: form.prompt.trim(),
      length: form.lengthOption === 'custom' ? { option: 'custom', words: clampWords(form.words) } : { option: 'flexible' },
      useKnowledge: form.useKnowledge,
    });
  }

  function startOver() {
    setForm(EMPTY);
    setDraft(null);
    setLastRequest(null);
    setError('');
    setInfo('');
    setStep(0);
  }

  // Going back to an earlier step means the next draft should be written fresh.
  function jumpTo(i: number) {
    if (i < 4) setDraft(null);
    setStep(i);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 space-y-5">
        <h1 className="font-serif text-3xl font-medium tracking-tight">New email</h1>
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
          <StepHeading title="What kind of email is this?" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {meta.emailTypes.map((t) => (
              <ChoiceCard
                key={t.id}
                title={t.label}
                description={t.description}
                selected={form.type === t.id}
                onClick={() => {
                  update({ type: t.id });
                  setStep(1);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          <StepHeading title="How should it sound?" hint={`For a ${typeLabel?.toLowerCase()}.`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {meta.tones.map((t) => (
              <ChoiceCard
                key={t.id}
                title={t.label}
                description={t.description}
                selected={form.tone === t.id}
                onClick={() => {
                  update({ tone: t.id });
                  setStep(2);
                }}
              />
            ))}
          </div>
          <StepNav onBack={() => setStep(0)} />
        </section>
      )}

      {step === 2 && (
        <section>
          <StepHeading title="How long should it be?" />
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              title="Whatever fits"
              description="Mailgic uses the shortest length that still covers everything."
              selected={form.lengthOption === 'flexible'}
              onClick={() => update({ lengthOption: 'flexible' })}
            />
            <ChoiceCard
              title="Set a length"
              description="Pick a rough word count."
              selected={form.lengthOption === 'custom'}
              onClick={() => update({ lengthOption: 'custom' })}
            />
          </div>

          {form.lengthOption === 'custom' && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {WORD_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => update({ words: p.words })}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    form.words === p.words ? 'border-accent bg-accent text-white' : 'border-line bg-sheet hover:border-muted'
                  }`}
                >
                  {p.label} <span className="opacity-60">~{p.words}</span>
                </button>
              ))}
              <label className="ml-2 flex items-center gap-2 text-sm text-muted">
                or
                <input
                  type="number"
                  aria-label="Number of words"
                  min={limits.minWords}
                  max={limits.maxWords}
                  value={form.words}
                  onChange={(e) => update({ words: Number(e.target.value) })}
                  onBlur={() => update({ words: clampWords(form.words) })}
                  className="field w-20 px-2 py-1 text-center"
                />
                words
              </label>
            </div>
          )}

          <StepNav onBack={() => setStep(1)}>
            <button type="button" onClick={() => setStep(3)} className="btn">
              Next
            </button>
          </StepNav>
        </section>
      )}

      {step === 3 && (
        <section>
          <StepHeading title="What should it say?" hint="Plain notes are fine — who it's for, what happened, what you need." />
          <div className="mb-1.5 flex justify-between">
            <p className="text-xs text-muted">
              {typeLabel} · {toneLabel} · {form.lengthOption === 'custom' ? `about ${form.words} words` : 'any length'}
            </p>
            <CharCounter length={form.prompt.length} max={limits.promptMaxChars} />
          </div>
          <textarea
            autoFocus
            aria-label="What should the email say?"
            value={form.prompt}
            maxLength={limits.promptMaxChars}
            onChange={(e) => update({ prompt: e.target.value })}
            placeholder="e.g. Thank Rahul for yesterday's interview and ask when I'll hear back about the backend role."
            className="field h-44 resize-y leading-relaxed"
          />
          <div className="mt-4">
            <KnowledgeCheckbox checked={form.useKnowledge} onChange={(useKnowledge) => update({ useKnowledge })} />
          </div>

          <StepNav onBack={() => setStep(2)}>
            <button type="button" onClick={writeDraft} disabled={form.prompt.trim().length < limits.promptMinChars} className="btn">
              Write the draft
            </button>
          </StepNav>
        </section>
      )}

      {step === 4 && (
        <section>
          {writing && (
            <>
              <StepHeading title="Writing your draft…" hint="You can stop it at any time." />
              <LiveDraft preview={stream.preview} onStop={stream.stop} />
            </>
          )}
          {/* Hidden (not unmounted) while a new version streams, so edits survive a Stop or an error. */}
          {draft && lastRequest && (
            <div hidden={writing}>
              <StepHeading title="Check it, then send" hint="Fill any blanks, tweak the wording if you like, and add who it's going to." />
              <ReviewAndSend
                key={draft.id}
                email={draft}
                regenerating={writing}
                onRegenerate={() => generate(lastRequest)}
                onStartOver={startOver}
              />
            </div>
          )}
          <StepNav onBack={writing ? undefined : () => jumpTo(3)} />
        </section>
      )}
    </div>
  );
}
