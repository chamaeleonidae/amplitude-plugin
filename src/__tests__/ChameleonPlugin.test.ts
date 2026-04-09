import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChameleonPlugin, addAmplitudePrefix } from '../ChameleonPlugin';
import type { AmplitudeEvent, ChameleonWindow } from '../types';

const win = globalThis as unknown as ChameleonWindow;

function makeIdentifyEvent(overrides: Partial<AmplitudeEvent> = {}): AmplitudeEvent {
  return {
    event_type: '$identify',
    user_id: 'user-123',
    user_properties: { $set: { plan: 'enterprise' } },
    ...overrides,
  };
}

describe('ChameleonPlugin', () => {
  let plugin: ChameleonPlugin;

  beforeEach(() => {
    plugin = new ChameleonPlugin('test-token');
    win.chmln = { identify: vi.fn() };
  });

  afterEach(() => {
    delete win.chmln;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('properties', () => {
    test('name equals chameleon', () => {
      expect(plugin.name).toBe('chameleon');
    });

    test('type equals destination', () => {
      expect(plugin.type).toBe('destination');
    });

    test('stores the token from the constructor', () => {
      expect(plugin.token).toBe('test-token');
    });

    test('token is undefined when not provided', () => {
      const noTokenPlugin = new ChameleonPlugin();
      expect(noTokenPlugin.token).toBeUndefined();
    });
  });

  describe('#setup', () => {
    test('returns undefined', async () => {
      const result = await plugin.setup();
      expect(result).toBeUndefined();
    });
  });

  describe('#execute', () => {
    test('calls chmln.identify with prefixed $set properties', async () => {
      const event = makeIdentifyEvent();

      const result = await plugin.execute(event);

      expect(win.chmln!.identify).toHaveBeenCalledWith('user-123', {
        amplitude_plan: 'enterprise',
      });
      expect(result).toEqual({ code: 200, event, message: 'Event forwarded to Chameleon' });
    });

    describe('when user_properties has $set and $setOnce', () => {
      test('merges both with $set winning on conflicts', async () => {
        const event = makeIdentifyEvent({
          user_properties: {
            $set: { plan: 'enterprise', source: 'web' },
            $setOnce: { plan: 'free', region: 'us' },
          },
        });

        await plugin.execute(event);

        expect(win.chmln!.identify).toHaveBeenCalledWith('user-123', {
          amplitude_plan: 'enterprise',
          amplitude_source: 'web',
          amplitude_region: 'us',
        });
      });
    });

    describe('when user_properties has $unset', () => {
      test('maps unset keys to null with highest precedence', async () => {
        const event = makeIdentifyEvent({
          user_properties: {
            $set: { plan: 'enterprise', source: 'web' },
            $setOnce: { region: 'us' },
            $unset: { plan: true, region: true },
          },
        });

        await plugin.execute(event);

        expect(win.chmln!.identify).toHaveBeenCalledWith('user-123', {
          amplitude_plan: null,
          amplitude_source: 'web',
          amplitude_region: null,
        });
      });
    });

    describe('when user_properties has only $setOnce', () => {
      test('calls chmln.identify with $setOnce values prefixed', async () => {
        const event = makeIdentifyEvent({
          user_properties: { $setOnce: { region: 'eu', signup_date: '2024-01-01' } },
        });

        await plugin.execute(event);

        expect(win.chmln!.identify).toHaveBeenCalledWith('user-123', {
          amplitude_region: 'eu',
          amplitude_signup_date: '2024-01-01',
        });
      });
    });

    describe('when user_properties has only $add', () => {
      test('returns success without calling chmln.identify', async () => {
        const event = makeIdentifyEvent({
          user_properties: { $add: { login_count: 1 } },
        });

        const result = await plugin.execute(event);

        expect(win.chmln!.identify).not.toHaveBeenCalled();
        expect(result).toEqual({ code: 200, event, message: 'Event forwarded to Chameleon' });
      });
    });

    describe('when user_id is missing', () => {
      test('does not call chmln.identify', async () => {
        const event = makeIdentifyEvent({ user_id: undefined });

        const result = await plugin.execute(event);

        expect(win.chmln!.identify).not.toHaveBeenCalled();
        expect(result).toEqual({ code: 200, event, message: 'Event forwarded to Chameleon' });
      });
    });

    describe('when user_id is empty string', () => {
      test('does not call chmln.identify', async () => {
        const event = makeIdentifyEvent({ user_id: '' });

        const result = await plugin.execute(event);

        expect(win.chmln!.identify).not.toHaveBeenCalled();
        expect(result).toEqual({ code: 200, event, message: 'Event forwarded to Chameleon' });
      });
    });

    describe('when user_properties is empty or all operations are empty', () => {
      test('does not call chmln.identify when user_properties is undefined', async () => {
        const event = makeIdentifyEvent({ user_properties: undefined });

        await plugin.execute(event);

        expect(win.chmln!.identify).not.toHaveBeenCalled();
      });

      test('does not call chmln.identify when all operations are empty', async () => {
        const event = makeIdentifyEvent({
          user_properties: { $set: {}, $setOnce: {}, $unset: {} },
        });

        await plugin.execute(event);

        expect(win.chmln!.identify).not.toHaveBeenCalled();
      });
    });

    describe('when event_type is not $identify', () => {
      test('does not call chmln.identify and returns passthrough result', async () => {
        const event = makeIdentifyEvent({ event_type: 'page_view' });

        const result = await plugin.execute(event);

        expect(win.chmln!.identify).not.toHaveBeenCalled();
        expect(result).toEqual({ code: 200, event, message: 'Event forwarded to Chameleon' });
      });
    });

    describe('when window.chmln is not loaded', () => {
      test('queues the identify call and flushes when chmln becomes available', async () => {
        vi.useFakeTimers();
        delete win.chmln;
        const identifyFn = vi.fn();

        const event = makeIdentifyEvent();
        const resultPromise = plugin.execute(event);

        setTimeout(() => {
          win.chmln = { identify: identifyFn };
        }, 150);

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(identifyFn).toHaveBeenCalledWith('user-123', { amplitude_plan: 'enterprise' });
        expect(result).toEqual({ code: 200, event, message: 'Event forwarded to Chameleon' });
      });
    });

    describe('when window.chmln becomes available after queued calls', () => {
      test('flushes all queued calls in order', async () => {
        vi.useFakeTimers();
        delete win.chmln;
        const calls: Array<[string, Record<string, unknown>]> = [];
        const identifyFn = vi.fn((...args: [string, Record<string, unknown>]) => calls.push(args));

        const event1 = makeIdentifyEvent({ user_properties: { $set: { plan: 'a' } } });
        const event2 = makeIdentifyEvent({ user_id: 'user-456', user_properties: { $set: { plan: 'b' } } });

        const p1 = plugin.execute(event1);
        const p2 = plugin.execute(event2);

        setTimeout(() => {
          win.chmln = { identify: identifyFn };
        }, 150);

        await vi.runAllTimersAsync();
        await Promise.all([p1, p2]);

        expect(calls).toEqual([
          ['user-123', { amplitude_plan: 'a' }],
          ['user-456', { amplitude_plan: 'b' }],
        ]);
      });
    });

    describe('when chmln never loads within the retry window', () => {
      test('stops polling and does not throw', async () => {
        vi.useFakeTimers();
        delete win.chmln;

        const event = makeIdentifyEvent();
        const resultPromise = plugin.execute(event);

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toEqual({ code: 200, event, message: 'Event forwarded to Chameleon' });
      });

      test('total elapsed time does not exceed 4s', async () => {
        vi.useFakeTimers();
        delete win.chmln;

        const event = makeIdentifyEvent();
        const resultPromise = plugin.execute(event);

        const start = Date.now();
        await vi.runAllTimersAsync();
        const elapsed = Date.now() - start;
        await resultPromise;

        expect(elapsed).toBeLessThanOrEqual(4000);
      });
    });
  });
});

describe('addAmplitudePrefix', () => {
  test('prefixes all keys with amplitude_', () => {
    const result = addAmplitudePrefix({ plan: 'enterprise', source: 'web' });
    expect(result).toEqual({ amplitude_plan: 'enterprise', amplitude_source: 'web' });
  });

  describe('when object is empty', () => {
    test('returns empty object', () => {
      expect(addAmplitudePrefix({})).toEqual({});
    });
  });

  describe('when value is null', () => {
    test('preserves null', () => {
      expect(addAmplitudePrefix({ plan: null })).toEqual({ amplitude_plan: null });
    });
  });
});
