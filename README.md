## Obsidian Sync Folds

A plugin for Obsidian that syncs your fold states across devices by storing them in a JSON file within your vault.

### What Does it Do?

Obsidian stores fold states in `localStorage`, which doesn't sync across devices. This plugin solves that by:

1. Storing all fold states in a `fold-states.json` file in your vault
2. Automatically syncing changes to this file as you fold/unfold content
3. Restoring fold states when you open files on different devices

### How it Works

- **On plugin load**: Imports existing fold states from `fold-states.json` to localStorage (or exports current localStorage state if the file doesn't exist)
- **When you fold/unfold content**: Automatically saves the change to `fold-states.json` (debounced)
- **When you open a file**: Applies the saved fold state from `fold-states.json`

### Installation

#### From Obsidian Community Plugins (Coming Soon)

1. Open Settings → Community Plugins
2. Search for "Sync Folds"
3. Click Install, then Enable

#### Manual Installation

1. Download `main.js`, `manifest.json` from the latest release
2. Create a folder `VaultFolder/.obsidian/plugins/obsidian-sync-folds/`
3. Copy the files into that folder
4. Reload Obsidian
5. Enable the plugin in Settings → Community Plugins

### Configuration

The plugin stores fold states in `.obsidian/plugins/obsidian-sync-folds/fold-states.json` by default.

You can change this location in the plugin settings if you want to store it elsewhere in your vault.

### How to Use with Sync

Since `fold-states.json` is stored in your vault, it will sync automatically with:

- Obsidian Sync
- iCloud
- Dropbox
- Git
- Any other file syncing solution you use

Just make sure the plugin is installed and enabled on all devices!
