import type { AmplitudeEvent, AmplitudeResult, ChameleonWindow } from './types';

const POLL_INITIAL_MS = 100;
const POLL_MAX_TOTAL_MS = 4000;

const win = globalThis as unknown as ChameleonWindow;

type QueuedCall = {
  uid: string;
  properties: Record<string, unknown>;
  resolve: () => void;
};

let queue: QueuedCall[] = [];
let polling = false;

function startPolling(): void {
  if (polling) return;
  polling = true;

  let elapsed = 0;
  let delay = POLL_INITIAL_MS;

  const tick = (): void => {
    if (win.chmln) {
      flushQueue();
      polling = false;
      return;
    }

    elapsed += delay;
    if (elapsed >= POLL_MAX_TOTAL_MS) {
      for (const call of queue) {
        call.resolve();
      }
      queue = [];
      polling = false;
      return;
    }

    delay = Math.min(delay * 2, POLL_MAX_TOTAL_MS - elapsed);
    setTimeout(tick, delay);
  };

  setTimeout(tick, delay);
}

function flushQueue(): void {
  const pending = queue;
  queue = [];
  for (const call of pending) {
    win.chmln!.identify(call.uid, call.properties);
    call.resolve();
  }
}

export function addAmplitudePrefix(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[`amplitude_${key}`] = value;
  }
  return result;
}

function mergeUserProperties(userProperties: AmplitudeEvent['user_properties']): Record<string, unknown> {
  if (!userProperties) return {};

  const { $setOnce, $set, $unset } = userProperties;
  const merged: Record<string, unknown> = {};

  if ($setOnce) {
    Object.assign(merged, addAmplitudePrefix($setOnce));
  }
  if ($set) {
    Object.assign(merged, addAmplitudePrefix($set));
  }
  if ($unset) {
    for (const key of Object.keys($unset)) {
      merged[`amplitude_${key}`] = null;
    }
  }

  return merged;
}

export class ChameleonPlugin {
  name = 'chameleon';
  type = 'destination' as const;

  async setup(): Promise<undefined> {
    return undefined;
  }

  async execute(event: AmplitudeEvent): Promise<AmplitudeResult> {
    const result: AmplitudeResult = { code: 200, event, message: 'Event forwarded to Chameleon' };

    if (event.event_type !== '$identify') return result;
    if (!event.user_id) return result;

    const properties = mergeUserProperties(event.user_properties);
    if (Object.keys(properties).length === 0) return result;

    if (win.chmln) {
      win.chmln.identify(event.user_id, properties);
    } else {
      await new Promise<void>((resolve) => {
        queue.push({ uid: event.user_id!, properties, resolve });
        startPolling();
      });
    }

    return result;
  }
}
