# Obsidian Sync Folds

Keep your folded headings, lists and properties the same on every device.

![Sync Folds: fold a note on your laptop and the folds are already there on your phone](docs/hero.gif)

[Watch in full quality (MP4)](docs/hero.mp4)

## Why

Obsidian saves fold states in each device's `localStorage`, so they never leave the device they were made on. Fold a long note on your laptop, open it on your phone, and it's fully expanded again.

Sync Folds stores every fold in the plugin's `data.json` inside your vault, so your folds travel with your notes.

## How it works

| When                                 | Sync Folds…                                                                |
| ------------------------------------ | -------------------------------------------------------------------------- |
| The plugin loads                     | Applies the saved folds, or saves this device's folds if none exist yet    |
| You fold or unfold something         | Saves the change to `data.json` (debounced to 150 ms)                      |
| `data.json` changes from another device | Applies the new folds to this device                                    |

There's nothing to configure. Install it on every device that shares the vault.

## Works with your sync service

Fold states live in `.obsidian/plugins/sync-folds/data.json`, so anything that syncs your vault folder syncs them too:

- **Obsidian Sync**: turn on **Installed community plugins** under **Settings → Sync → Vault configuration sync**.
- iCloud, Dropbox, OneDrive or Google Drive
- Git
- Self-hosted options such as Syncthing, Nextcloud or CouchDB

## Commands

| Command                             | What it does                                                    |
| ----------------------------------- | --------------------------------------------------------------- |
| **Export folds from local storage** | Saves all of this device's current fold states to `data.json`   |
| **Import folds into local storage** | Applies the fold states in `data.json` to this device           |

You shouldn't normally need these. They're there if a device ever gets out of step.

## Installation

### From Community Plugins

1. Open **Settings → Community plugins**.
2. Turn off **Restricted mode** if prompted.
3. Click **Browse** and search for "Sync Folds".
4. Click **Install**, then **Enable**.

### Manual installation

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/itsonlyjames/obsidian-sync-folds/releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/sync-folds/`.
3. Reload Obsidian and enable **Sync Folds** under **Settings → Community plugins**.

## Compatibility

Works on desktop and mobile. Requires Obsidian 0.15.0 or later.

## Related plugins

- [Fold Properties](https://github.com/itsonlyjames/obsidian-fold-properties) folds the properties of a note, a folder or your whole vault in one click. Sync Folds carries those folds to your other devices.
- [Quick Select](https://github.com/itsonlyjames/obsidian-quick-select) lets you pick any item in any Obsidian list with <kbd>Mod</kbd> + number.

## Support

If your folds now follow you around, consider [sponsoring its development](https://github.com/sponsors/itsonlyjames).

## License

[MIT](LICENSE)
