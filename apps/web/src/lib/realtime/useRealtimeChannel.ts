import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * §2.2 Real-Time Update Layer — thin EventSource wrapper.
 *
 * Design rules (from spec):
 *
 * 1. Resync-on-reconnect (correctness, not just UX):
 *    Every onopen event — initial connect AND every auto-reconnect — triggers
 *    a full re-fetch via queryClient.invalidateQueries before resuming live deltas.
 *    Redis Pub/Sub has no replay guarantee; events missed during a gap are gone.
 *    A client that only listened and never re-fetched would be wrong by construction
 *    after any network gap.
 *
 * 2. Events are triggers, not state:
 *    onmessage calls invalidateQueries(...) — the same query-key factory used for
 *    normal fetches. SSE and a manual refresh converge on the exact same code path.
 *    The event payload is never applied directly to UI state.
 *
 * 3. Native reconnect:
 *    EventSource auto-reconnects; no custom backoff loop is needed for this
 *    receive-only design. The server can hint the retry interval via `retry:` field.
 *    Heartbeat SSE comments (`: heartbeat`) keep proxies alive; the browser
 *    ignores them automatically.
 *
 * 4. Teardown:
 *    Effect cleanup closes the EventSource so stale connections don't accumulate
 *    when the component unmounts or the channel URL changes.
 *
 * @param channelUrl  Full SSE endpoint URL, or null to disable (e.g., params not ready).
 * @param queryKeysToInvalidate  Array of TanStack Query keys to invalidate on every
 *   event and on reconnect. Use the same keys as the page's useQuery calls.
 */
export function useRealtimeChannel(
  channelUrl: string | null,
  queryKeysToInvalidate: readonly (readonly unknown[])[],
): void {
  const queryClient = useQueryClient();

  // Hold the latest keys in a ref so key changes don't cause reconnections.
  // The channel URL is the reconnect signal; key updates take effect on the
  // next event without tearing down the SSE connection.
  const keysRef = useRef(queryKeysToInvalidate);
  useEffect(() => {
    keysRef.current = queryKeysToInvalidate;
  });

  useEffect(() => {
    if (!channelUrl) return;

    const es = new EventSource(channelUrl);

    const invalidate = (): void => {
      for (const key of keysRef.current) {
        void queryClient.invalidateQueries({ queryKey: key as unknown[] });
      }
    };

    es.onopen = invalidate;     // resync-on-reconnect rule
    es.onmessage = invalidate;  // each event triggers re-fetch

    return (): void => {
      es.close();
    };
  }, [channelUrl, queryClient]);
}
