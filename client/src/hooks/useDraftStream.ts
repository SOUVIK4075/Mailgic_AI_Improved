import { useEffect, useRef, useState } from 'react';
import { ApiError, apiStream, isAbortError } from '../lib/api';
import type { AnalysisEvent, DoneEvent, DraftPreview, ReplyAnalysis, StreamErrorEvent } from '../types';

const RETRY_DELAY_MS = 1000;

/** Shown after Stop. The server cancels the AI call, saves nothing and refunds the quota slot. */
export const STOPPED_MESSAGE = "Stopped. Nothing was saved and it didn't count towards today's limit.";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Streams a draft from /emails/compose/stream or /emails/reply/stream.
 * `preview` and `analysis` update live while the AI writes; `stop()` cancels it.
 *
 * run() resolves with the saved email when the stream finishes, or with null if the user pressed Stop.
 * It throws an ApiError if generation failed.
 */
export function useDraftStream() {
  const [writing, setWriting] = useState(false);
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [analysis, setAnalysis] = useState<ReplyAnalysis | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Leaving the page mid-stream cancels it, so the server doesn't finish (and charge for) a draft nobody sees.
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function run(path: string, body: unknown): Promise<DoneEvent | null> {
    const controller = new AbortController();
    controllerRef.current = controller;
    // A new key for every click. Retries of THIS click reuse it (see below).
    const idempotencyKey = crypto.randomUUID();

    // Filled in by the event handler. An object (not `let` variables) so TypeScript
    // doesn't assume they are still empty after the await.
    const outcome: { done?: DoneEvent; error?: ApiError } = {};

    function onEvent(event: string, data: unknown) {
      if (event === 'analysis') setAnalysis((data as AnalysisEvent).analysis);
      else if (event === 'draft') setPreview(data as DraftPreview);
      else if (event === 'done') outcome.done = data as DoneEvent;
      else if (event === 'error') {
        const { code, message } = data as StreamErrorEvent;
        outcome.error = new ApiError(502, code, message);
      }
    }

    const start = () => apiStream(path, body, { signal: controller.signal, idempotencyKey, onEvent });

    setWriting(true);
    setPreview(null);
    setAnalysis(null);
    try {
      try {
        await start();
      } catch (err) {
        // fetch throws a TypeError when the network drops (a Stop click is an AbortError instead).
        if (!(err instanceof TypeError)) throw err;
        // Retry once with the SAME key: if the server already finished the first attempt, it replays
        // the saved draft instead of calling the AI (and using up the daily quota) a second time.
        await wait(RETRY_DELAY_MS);
        await start();
      }
    } catch (err) {
      if (isAbortError(err)) return null; // the user pressed Stop
      throw err;
    } finally {
      setWriting(false);
      controllerRef.current = null;
    }

    if (outcome.error) throw outcome.error;
    if (!outcome.done) throw new ApiError(0, 'STREAM_ENDED', 'The connection closed before the draft was finished. Please try again.');
    return outcome.done;
  }

  function stop() {
    controllerRef.current?.abort();
  }

  return { writing, preview, analysis, run, stop };
}
