# @chamaeleonidae/amplitude-plugin

Amplitude Browser SDK destination plugin that intercepts `$identify` events and forwards user attributes to Chameleon via `chmln.identify()`.

## Install

```bash
npm install @chamaeleonidae/amplitude-plugin
```

## Usage

```javascript
import * as amplitude from '@amplitude/analytics-browser';
import { ChameleonPlugin } from '@chamaeleonidae/amplitude-plugin';

amplitude.add(new ChameleonPlugin());
amplitude.init('YOUR_AMPLITUDE_API_KEY');
```

The Chameleon SDK (`chmln.js`) must be loaded on the page. If `window.chmln` is not yet available when an `$identify` event fires, the plugin queues the call and polls with exponential backoff (~4 seconds total) until the SDK loads.

## How it works

When Amplitude dispatches an `$identify` event, the plugin:

1. Extracts `user_properties` operations (`$set`, `$setOnce`, `$unset`)
2. Merges them with the following precedence: `$unset` > `$set` > `$setOnce`
3. Prefixes every key with `amplitude_` (e.g. `plan` becomes `amplitude_plan`)
4. Calls `chmln.identify(user_id, prefixed_properties)`

### `$unset` handling

Keys in `$unset` are mapped to `null`, which tells Chameleon to clear those attributes. `$unset` has the highest precedence — if a key appears in both `$set` and `$unset`, it will be set to `null`.

## Limitations

- **`$add` is not supported.** Amplitude's `$add` operation (increment numeric values) is silently ignored. Only `$set`, `$setOnce`, and `$unset` are forwarded.
- **No backfill.** The plugin only captures users who trigger a new `$identify` call after installation. Existing Amplitude user attributes are not retroactively synced. To backfill a specific user, trigger an identify call:

```javascript
const identifyEvent = new amplitude.Identify();
identifyEvent.set('plan', 'enterprise');
amplitude.identify(identifyEvent);
```

## Development

```bash
bun install
bun run test
bun run build
```
