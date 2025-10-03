import { Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";

interface FoldSyncSettings {
	syncFilePath: string;
	enableSync: boolean;
}

const DEFAULT_SETTINGS: FoldSyncSettings = {
	syncFilePath: "",
	enableSync: true,
};

interface Fold {
	from: number;
	to: number;
}

interface FoldedProperties {
	folds: Fold[];
	lines: number;
}

interface FoldStateData {
	[filePath: string]: FoldedProperties;
}

export default class FoldSyncPlugin extends Plugin {
	settings: FoldSyncSettings;
	private debounceTimer: number | null = null;
	private originalSetItem: typeof Storage.prototype.setItem;
	private originalRemoveItem: typeof Storage.prototype.removeItem;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon for manual sync
		this.addRibbonIcon("sync", "Sync fold states", async () => {
			await this.exportFoldsToFile();
			new Notice("Fold states synced to file");
		});

		// Command: Export folds to file
		this.addCommand({
			id: "export-folds-to-file",
			name: "Export fold states to file",
			callback: async () => {
				await this.exportFoldsToFile();
				new Notice("Fold states exported to file");
			},
		});

		// // Command: Import folds from file
		// this.addCommand({
		//     id: 'import-folds-from-file',
		//     name: 'Import fold states from file',
		//     callback: async () => {
		//         await this.importFoldsFromFile()
		//         new Notice('Fold states imported from file')
		//     }
		// })

		// Add settings tab
		this.addSettingTab(new FoldSyncSettingTab(this.app, this));

		// Intercept localStorage changes to detect fold state changes
		if (this.settings.enableSync) {
			this.interceptLocalStorage();
		}

		// Initial export on load
		if (this.settings.enableSync) {
			// await this.exportFoldsToFile()
			await this.importFoldsFromFile();
		}

		this.registerEvent(
			this.app.workspace.on("file-open", async (file) => {
				if (file) {
					await this.applyFoldStateForFile(file.path);
				}
			}),
		);
	}

	onunload() {
		// Restore original localStorage methods
		this.restoreLocalStorage();

		// Clear any pending debounce
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
		// Set default sync file path to plugin directory if not set
		if (!this.settings.syncFilePath) {
			this.settings.syncFilePath = `${this.manifest.dir}/fold-states.json`;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	interceptLocalStorage() {
		const app = this.app as any;
		const appId = app.appId;
		const foldPrefix = `${appId}-note-fold-`;

		// Store original methods
		this.originalSetItem = localStorage.setItem.bind(localStorage);
		this.originalRemoveItem = localStorage.removeItem.bind(localStorage);

		// Override setItem
		localStorage.setItem = (key: string, value: string) => {
			this.originalSetItem(key, value);

			// Check if this is a fold state change
			if (key.startsWith(foldPrefix)) {
				this.debouncedSync();
			}
		};

		// Override removeItem
		localStorage.removeItem = (key: string) => {
			this.originalRemoveItem(key);

			// Check if this is a fold state removal
			if (key.startsWith(foldPrefix)) {
				this.debouncedSync();
			}
		};
	}

	restoreLocalStorage() {
		if (this.originalSetItem) {
			localStorage.setItem = this.originalSetItem;
		}
		if (this.originalRemoveItem) {
			localStorage.removeItem = this.originalRemoveItem;
		}
	}

	debouncedSync() {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = window.setTimeout(async () => {
			await this.exportFoldsToFile();
			this.debounceTimer = null;
		}, 500);
	}

	async exportFoldsToFile() {
		if (!this.settings.enableSync) {
			return;
		}

		const app = this.app as any;
		const appId = app.appId;
		const foldStates: FoldStateData = {};

		// Iterate through localStorage to find all fold states
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(`${appId}-note-fold-`)) {
				const filePath = key.replace(`${appId}-note-fold-`, "");
				const value = localStorage.getItem(key);
				if (value) {
					try {
						foldStates[filePath] = JSON.parse(value);
					} catch (e) {
						console.error(
							`Failed to parse fold state for ${filePath}:`,
							e,
						);
					}
				}
			}
		}

		const content = JSON.stringify(foldStates);
		const filePath = this.settings.syncFilePath;

		try {
			await this.app.vault.adapter.write(filePath, content);
		} catch (e) {
			console.error("Failed to export fold states:", e);
			new Notice("Failed to export fold states");
		}
	}

	async importFoldsFromFile() {
		const filePath = this.settings.syncFilePath;

		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) {
				new Notice("Fold states file not found");
				return;
			}

			const content = await this.app.vault.adapter.read(filePath);
			const foldStates: FoldStateData = JSON.parse(content);
			const app = this.app as any;
			const appId = app.appId;

			// Temporarily disable interception to avoid triggering sync
			const syncEnabled = this.settings.enableSync;
			this.settings.enableSync = false;

			// Import each fold state into localStorage
			for (const [filePath, foldData] of Object.entries(foldStates)) {
				const key = `${appId}-note-fold-${filePath}`;
				localStorage.setItem(key, JSON.stringify(foldData));
			}

			// Re-enable sync
			this.settings.enableSync = syncEnabled;
		} catch (e) {
			console.error("Failed to import fold states:", e);
			new Notice("Failed to import fold states");
		}
	}

	async applyFoldStateForFile(filePath: string) {
		if (!this.settings.enableSync) {
			return;
		}

		const syncFilePath = this.settings.syncFilePath;

		try {
			// Check if fold states file exists
			const exists = await this.app.vault.adapter.exists(syncFilePath);
			if (!exists) {
				return;
			}

			// Read fold states file
			const content = await this.app.vault.adapter.read(syncFilePath);
			const foldStates: FoldStateData = JSON.parse(content);

			// Check if this file has fold states
			if (foldStates[filePath]) {
				const app = this.app as any;
				const appId = app.appId;
				const key = `${appId}-note-fold-${filePath}`;

				// Temporarily disable sync to avoid triggering export
				const syncEnabled = this.settings.enableSync;
				this.settings.enableSync = false;

				// Apply fold state to localStorage
				localStorage.setItem(key, JSON.stringify(foldStates[filePath]));

				// Re-enable sync
				this.settings.enableSync = syncEnabled;

				// Trigger Obsidian to reload folds (if file is currently open)
				const leaf = this.app.workspace.getActiveViewOfType(
					require("obsidian").MarkdownView,
				);
				if (leaf && leaf.file?.path === filePath) {
					// Force refresh of the editor view to apply folds
					app.foldManager.load(filePath);
				}
			}
		} catch (e) {
			console.error("Failed to apply fold state:", e);
		}
	}
}

class FoldSyncSettingTab extends PluginSettingTab {
	plugin: FoldSyncPlugin;

	constructor(app: any, plugin: FoldSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl("h2", { text: "Fold Sync Settings" });

		new Setting(containerEl)
			.setName("Sync file path")
			.setDesc("Path where fold states will be stored")
			.addText((text) =>
				text
					.setPlaceholder(
						`${this.plugin.manifest.dir}/fold-states.json`,
					)
					.setValue(this.plugin.settings.syncFilePath)
					.onChange(async (value) => {
						this.plugin.settings.syncFilePath = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Enable automatic sync")
			.setDesc("Automatically sync fold states when they change")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSync)
					.onChange(async (value) => {
						this.plugin.settings.enableSync = value;
						await this.plugin.saveSettings();

						if (value) {
							this.plugin.interceptLocalStorage();
							await this.plugin.exportFoldsToFile();
						} else {
							this.plugin.restoreLocalStorage();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Export now")
			.setDesc("Export current fold states to file")
			.addButton((button) =>
				button.setButtonText("Export").onClick(async () => {
					await this.plugin.exportFoldsToFile();
					new Notice("Fold states exported");
				}),
			);

		// new Setting(containerEl)
		//     .setName('Import now')
		//     .setDesc('Import fold states from file to localStorage')
		//     .addButton(button => button
		//         .setButtonText('Import')
		//         .onClick(async () => {
		//             await this.plugin.importFoldsFromFile()
		//             new Notice('Fold states imported')
		//         }))
	}
}
