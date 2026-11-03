# Pulse for the Hermes desktop app

A desktop plugin that shows Hermes Pulse cards in the Hermes desktop app, with the same actions as the Conduit app.

## Requirements
- Hermes with the `conduit_push` plugin (the Pulse API at `/api/plugins/conduit_push/pulse/...`).
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

## Status
Checked for syntax only. Loading the plugin and the actions have not yet been confirmed in a running app. Report problems as an issue.

## License
MIT, see [LICENSE](LICENSE).
