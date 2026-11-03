# Pulse for the Hermes desktop app

A desktop plugin that shows Hermes Pulse cards in the Hermes desktop app, with the same actions as the Conduit app.

## Requirements
- Hermes with the Conduit notifier plugin [`conduit_push`](https://github.com/kaishi00/hermes-conduit-notifier) (the Pulse API at `/api/plugins/conduit_push/pulse/...`).
- For the full feed (calendar, contacts, location), also a paired [Conduit](https://github.com/kaishi00/hermes-conduit) phone app. Without it, cards that depend on the phone are missing.
- The Hermes desktop app with plugin support (`desktop-plugins`).

## Installation
1. Find your Hermes folder. Check with `Test-Path` whether `%LOCALAPPDATA%\hermes\config.yaml` or `%USERPROFILE%\.hermes\config.yaml` exists.
2. Create the folder `desktop-plugins\pulse-page\` inside that Hermes folder.
3. Copy `pulse-page/plugin.js` into that folder. The folder name must equal the plugin `id`.
4. Reload the plugins: run "Reload desktop plugins", or restart the app.

A Pulse item appears in the sidebar, and the palette command "Open Pulse" is available.

## What it does
- **Open / Done / All**: a dropdown to choose the list view (default: open).
- **Morning brief** per day, pinned at the top under "Pinned".
- Per card: Done, Do it (copies the prompt to the clipboard and opens the chats, unless the app can start a chat itself), Not now, Good, Not good.
- **Settings** (gear button on the Pulse page): Pulse on/off, how often Pulse speaks up (Gentle / Balanced / Eager), look-through times, morning brief time, quiet days, quiet until the end of today, night hours, your own instructions for Pulse, and Memory / Deadlines from Shortcuts / Look things up first.
- **Pulse on/off is shared with the Conduit phone app.** Turning Pulse off here also turns it off in the Conduit app, and the other way around.
- Phone-only settings (lock screen privacy, location, shop watching, older-chat reading, model) are not in the desktop plugin; change them in the Conduit app.

## Status
Tested by the author in the Hermes desktop app on Windows: the plugin loads and works.

## License
MIT, see [LICENSE](LICENSE).
