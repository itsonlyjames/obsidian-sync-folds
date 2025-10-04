import {
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	MarkdownView,
} from "obsidian";

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
		console.log("[FoldSync] Plugin loaded with settings:", this.settings);

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

		// Command: Import folds from file
		this.addCommand({
			id: "import-folds-from-file",
			name: "Import fold states from file",
			callback: async () => {
				await this.importFoldsFromFile();
				new Notice("Fold states imported from file");
			},
		});

		// Add settings tab
		this.addSettingTab(new FoldSyncSettingTab(this.app, this));

		// Intercept localStorage changes to detect fold state changes
		if (this.settings.enableSync) {
			console.log("[FoldSync] Intercepting localStorage");
			this.interceptLocalStorage();
		}

		// Initial export to capture current localStorage state
		if (this.settings.enableSync) {
			console.log(
				"[FoldSync] Performing initial export of all fold states",
			);
			await this.exportFoldsToFile();
		}

		// Listen for file opens to apply fold states
		this.registerEvent(
			this.app.workspace.on("file-open", async (file) => {
				if (file) {
					console.log("[FoldSync] File opened event:", file.path);
					await this.applyFoldStateForFile(file.path);
				} else {
					console.log(
						"[FoldSync] File opened event: no file (closed)",
					);
				}
			}),
		);

		console.log("[FoldSync] Plugin initialization complete");
	}

	onunload() {
		console.log("[FoldSync] Plugin unloading");
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

		console.log(
			"[FoldSync] Setting up localStorage interception with prefix:",
			foldPrefix,
		);

		// Store original methods
		this.originalSetItem = localStorage.setItem.bind(localStorage);
		this.originalRemoveItem = localStorage.removeItem.bind(localStorage);

		// Override setItem
		localStorage.setItem = (key: string, value: string) => {
			this.originalSetItem(key, value);

			// Check if this is a fold state change
			if (key.startsWith(foldPrefix)) {
				const filePath = key.replace(foldPrefix, "");
				console.log("[FoldSync] Fold state changed:", filePath);
				this.debouncedSyncFile(filePath, value);
			}
		};

		// Override removeItem
		localStorage.removeItem = (key: string) => {
			this.originalRemoveItem(key);

			// Check if this is a fold state removal
			if (key.startsWith(foldPrefix)) {
				const filePath = key.replace(foldPrefix, "");
				console.log("[FoldSync] Fold state removed:", filePath);
				this.debouncedSyncFile(filePath, null);
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
		// Clear existing timer
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}

		console.log("[FoldSync] Debouncing full sync (500ms)...");

		// Set new timer to sync after 500ms of no changes
		this.debounceTimer = window.setTimeout(async () => {
			console.log("[FoldSync] Executing debounced full sync");
			await this.exportFoldsToFile();
			this.debounceTimer = null;
		}, 500);
	}

	debouncedSyncFile(filePath: string, value: string | null) {
		// Clear existing timer
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}

		console.log("[FoldSync] Debouncing file sync (500ms) for:", filePath);

		// Set new timer to sync after 500ms of no changes
		this.debounceTimer = window.setTimeout(async () => {
			console.log(
				"[FoldSync] Executing debounced file sync for:",
				filePath,
			);
			await this.upsertFoldStateForFile(filePath, value);
			this.debounceTimer = null;
		}, 500);
	}

	async exportFoldsToFile() {
		if (!this.settings.enableSync) {
			console.log("[FoldSync] Sync disabled, skipping export");
			return;
		}

		console.log("[FoldSync] Starting FULL export to file");

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
							`[FoldSync] Failed to parse fold state for ${filePath}:`,
							e,
						);
					}
				}
			}
		}

		console.log(
			"[FoldSync] Found fold states for",
			Object.keys(foldStates).length,
			"files",
		);

		// Write to file using adapter for direct file system access (minified)
		const content = JSON.stringify(foldStates);
		const filePath = this.settings.syncFilePath;

		try {
			await this.app.vault.adapter.write(filePath, content);
			console.log(
				"[FoldSync] Successfully exported ALL fold states to:",
				filePath,
			);
		} catch (e) {
			console.error("[FoldSync] Failed to export fold states:", e);
			new Notice("Failed to export fold states");
		}
	}

	async upsertFoldStateForFile(filePath: string, value: string | null) {
		if (!this.settings.enableSync) {
			console.log("[FoldSync] Sync disabled, skipping upsert");
			return;
		}

		console.log("[FoldSync] Starting upsert for single file:", filePath);
		const syncFilePath = this.settings.syncFilePath;

		try {
			let foldStates: FoldStateData = {};

			// Read existing fold states if file exists
			const exists = await this.app.vault.adapter.exists(syncFilePath);
			if (exists) {
				const content = await this.app.vault.adapter.read(syncFilePath);
				foldStates = JSON.parse(content);
				console.log(
					"[FoldSync] Loaded existing fold states, total files:",
					Object.keys(foldStates).length,
				);
			} else {
				console.log(
					"[FoldSync] No existing fold states file, creating new",
				);
			}

			// Update or remove the specific file's fold state
			if (value === null) {
				console.log("[FoldSync] Removing fold state for:", filePath);
				delete foldStates[filePath];
			} else {
				console.log("[FoldSync] Updating fold state for:", filePath);
				foldStates[filePath] = JSON.parse(value);
			}

			// Write back to file (minified)
			const content = JSON.stringify(foldStates);
			await this.app.vault.adapter.write(syncFilePath, content);
			console.log(
				"[FoldSync] ✓ Successfully upserted fold state for:",
				filePath,
			);
		} catch (e) {
			console.error("[FoldSync] Failed to upsert fold state:", e);
			new Notice("Failed to sync fold state");
		}
	}

	async importFoldsFromFile() {
		const filePath = this.settings.syncFilePath;
		console.log("[FoldSync] Starting import from:", filePath);

		try {
			// Check if file exists using adapter
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) {
				console.log("[FoldSync] Fold states file does not exist yet");
				return;
			}

			// Read file using adapter
			const content = await this.app.vault.adapter.read(filePath);
			const foldStates: FoldStateData = JSON.parse(content);
			console.log(
				"[FoldSync] Loaded fold states for",
				Object.keys(foldStates).length,
				"files",
			);

			const app = this.app as any;
			const appId = app.appId;

			// Temporarily disable interception to avoid triggering sync
			const syncEnabled = this.settings.enableSync;
			this.settings.enableSync = false;
			console.log("[FoldSync] Temporarily disabled sync for import");

			// Import each fold state into localStorage
			for (const [filePath, foldData] of Object.entries(foldStates)) {
				const key = `${appId}-note-fold-${filePath}`;
				localStorage.setItem(key, JSON.stringify(foldData));
				console.log("[FoldSync] Imported fold state for:", filePath);
			}

			// Re-enable sync
			this.settings.enableSync = syncEnabled;
			console.log("[FoldSync] Re-enabled sync after import");
		} catch (e) {
			console.error("[FoldSync] Failed to import fold states:", e);
			new Notice("Failed to import fold states");
		}
	}

	async applyFoldStateForFile(filePath: string) {
		if (!this.settings.enableSync) {
			console.log(
				"[FoldSync] Sync disabled, skipping apply for:",
				filePath,
			);
			return;
		}

		console.log("[FoldSync] ========== APPLYING FOLD STATE ==========");
		console.log("[FoldSync] File path:", filePath);

		const syncFilePath = this.settings.syncFilePath;
		console.log("[FoldSync] Sync file path:", syncFilePath);

		try {
			// Check if fold states file exists
			const exists = await this.app.vault.adapter.exists(syncFilePath);
			console.log("[FoldSync] Fold states file exists:", exists);

			if (!exists) {
				console.log(
					"[FoldSync] Fold states file does not exist, nothing to apply",
				);
				return;
			}

			// Read fold states file
			const content = await this.app.vault.adapter.read(syncFilePath);
			console.log(
				"[FoldSync] Read file content, length:",
				content.length,
			);

			const foldStates: FoldStateData = JSON.parse(content);
			console.log(
				"[FoldSync] Parsed fold states, total files:",
				Object.keys(foldStates).length,
			);

			// Check if this file has fold states
			if (foldStates[filePath]) {
				console.log(
					"[FoldSync] ✓ Found fold state for file:",
					filePath,
				);
				console.log("[FoldSync] Fold data:", foldStates[filePath]);

				const app = this.app as any;
				const file = this.app.vault.getAbstractFileByPath(filePath);

				if (!(file instanceof TFile)) {
					console.log("[FoldSync] File not found in vault");
					return;
				}

				// Check if file is currently open in any markdown view
				const leaves = this.app.workspace
					.getLeavesOfType("markdown")
					.filter(
						(leaf) =>
							leaf.view &&
							leaf.view instanceof MarkdownView &&
							leaf.view.file?.path === filePath,
					);

				console.log(
					"[FoldSync] File is open in",
					leaves.length,
					"views",
				);

				if (leaves.length) {
					const t = app.workspace.getActiveViewOfType(MarkdownView);
					console.log(t.currentMode);
					// File is open, apply directly to the view
					const view = leaves[0].view as MarkdownView;
					console.log(
						"view",
						view,
						view.currentMode.applyFoldInfo(foldStates[filePath]),
					);
					view.previewMode.renderer.applyFoldInfo(
						foldStates[filePath],
					);
					console.log(
						view.previewMode.renderer.applyFoldInfo(
							foldStates[filePath],
						),
					);

					console.log(
						"[FoldSync] ✓ Applied fold state via view.currentMode.applyFoldInfo()",
					);

					// Trigger onMarkdownFold to update localStorage
					view.onMarkdownFold();
					console.log("[FoldSync] ✓ Called view.onMarkdownFold()");
				} else {
					// File is not open, save to foldManager
					await app.foldManager.save(file, foldStates[filePath]);
					console.log(
						"[FoldSync] ✓ Applied fold state via foldManager.save()",
					);
				}

				console.log("[FoldSync] ========== APPLY COMPLETE ==========");
			} else {
				console.log(
					"[FoldSync] ✗ No fold state found for file:",
					filePath,
				);
				console.log(
					"[FoldSync] ========================================",
				);
			}
		} catch (e) {
			console.error("[FoldSync] ✗ Failed to apply fold state:", e);
			console.log("[FoldSync] ========================================");
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

		new Setting(containerEl)
			.setName("Import now")
			.setDesc("Import fold states from file to localStorage")
			.addButton((button) =>
				button.setButtonText("Import").onClick(async () => {
					await this.plugin.importFoldsFromFile();
					new Notice("Fold states imported");
				}),
			);
	}
}
