import type { Response } from 'express';

/**
 * Tiny Server-Sent Events writer. Headers are sent lazily on the first event, so anything that
 * fails *before* streaming starts (validation, quota…) can still be a normal JSON error response.
 * Wire format per event:  "event: <name>\ndata: <json>\n\n"
 */
export function createSse(res: Response) {
  let started = false;

  function start() {
    if (started) return;
    started = true;
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // tell Nginx-style proxies not to buffer the stream
    });
    res.flushHeaders();
  }

  return {
    get started() {
      return started;
    },
    send(event: string, data: unknown) {
      start();
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      start();
      res.end();
    },
  };
}
