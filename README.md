# Obsidian Sync Folds

A plugin for Obsidian that syncs your fold states across devices by storing them in your plugin settings.

## What Does it Do?

Obsidian stores fold states in `localStorage`, which doesn't sync across devices. This plugin solves that by:

1. Storing all fold states in the plugin's `data.json` file (which syncs with your vault)
2. Automatically syncing changes as you fold/unfold content
3. Restoring fold states when you open files on different devices

## How it Works

- **On plugin load**: Imports existing fold states from settings to localStorage (or exports current localStorage state if no folds are saved)
- **When you fold/unfold content**: Automatically saves the change to settings (debounced to 150ms)
- **When settings change externally**: Automatically detects and syncs changes to localStorage

## Work in Progress

- [ ] Apply fold info to active leafs if fold state is changed externally (synced)

---

## Installation

### From Obsidian Community Plugins (Coming Soon)

1. Open Settings → Community Plugins
2. Search for "Sync Folds"
3. Click Install, then Enable

### Manual Installation

1. Download `main.js`, `manifest.json` from the latest release
2. Create a folder `VaultFolder/.obsidian/plugins/sync-folds/`
3. Copy the files into that folder
4. Reload Obsidian
5. Enable the plugin in Settings → Community Plugins

## How to Use with Sync

The plugin stores fold states in `.obsidian/plugins/sync-folds/data.json`, which syncs automatically with:

- Obsidian Sync
- iCloud
- Dropbox
- Git
- Self-hosted syncing solutions (Syncthing, CouchDB, etc.)
- Any other file syncing solution you use

Just make sure the plugin is installed and enabled on all devices!

## Commands

- **Export Folds from Local Storage**: Manually export all current fold states to settings
- **Import Folds into Local Storage**: Manually import fold states from settings to localStorage

## License

MIT
