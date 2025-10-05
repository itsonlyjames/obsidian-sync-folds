import {
    Notice,
    Plugin,
    TFile,
    MarkdownView
} from 'obsidian'

interface SyncFoldSettings {
    syncFilePath: string
    enableSync: boolean
}

const DEFAULT_SETTINGS: SyncFoldSettings = {
    syncFilePath: '',
    enableSync: true
}

interface Fold {
    from: number
    to: number
}

interface FoldedProperties {
    folds: Fold[]
    lines: number
}

interface FoldStateData {
    [filePath: string]: FoldedProperties
}

export default class SyncFolds extends Plugin {
    settings: SyncFoldSettings
    private debounceTimer: number | null = null
    private originalSetItem: typeof Storage.prototype.setItem
    private originalRemoveItem: typeof Storage.prototype.removeItem

    async onload() {
        await this.loadSettings()
        console.log('[FoldSync] Plugin loaded with settings:', this.settings)

        // Intercept localStorage changes to detect fold state changes
        if (this.settings.enableSync) {
            console.log('[FoldSync] Intercepting localStorage')
            this.interceptLocalStorage()
        }

        // Initial export to capture current localStorage state
        if (this.settings.enableSync) {
            console.log(
                '[FoldSync] Performing initial export of all fold states'
            )
            await this.exportFoldsToFile()
        }

        // Listen for file opens to apply fold states
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async (leaf) => {
                if (
                    leaf &&
                    leaf.view instanceof MarkdownView &&
                    leaf.view.file
                ) {
                    console.log('[FoldSync] Active leaf event:', leaf)
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    await this.applyFoldStateForFile(leaf.view.file.path)
                } else {
                    console.log(
                        '[FoldSync] File opened event: no file (closed)'
                    )
                }
            })
        )

        console.log('[FoldSync] Plugin initialization complete')
    }

    onunload() {
        console.log('[FoldSync] Plugin unloading')
        // Restore original localStorage methods
        this.restoreLocalStorage()

        // Clear any pending debounce
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer)
        }
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        )
        // Set default sync file path to plugin directory if not set
        if (!this.settings.syncFilePath) {
            this.settings.syncFilePath = `${this.manifest.dir}/fold-states.json`
        }
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }

    interceptLocalStorage() {
        const app = this.app as any
        const appId = app.appId
        const foldPrefix = `${appId}-note-fold-`

        console.log(
            '[FoldSync] Setting up localStorage interception with prefix:',
            foldPrefix
        )

        // Store original methods
        this.originalSetItem = localStorage.setItem.bind(localStorage)
        this.originalRemoveItem = localStorage.removeItem.bind(localStorage)

        // Override setItem
        localStorage.setItem = (key: string, value: string) => {
            this.originalSetItem(key, value)

            // Check if this is a fold state change
            if (key.startsWith(foldPrefix)) {
                const filePath = key.replace(foldPrefix, '')
                console.log('[FoldSync] Fold state changed:', filePath)
                this.debouncedSyncFile(filePath, value)
            }
        }

        // Override removeItem
        localStorage.removeItem = (key: string) => {
            this.originalRemoveItem(key)

            // Check if this is a fold state removal
            if (key.startsWith(foldPrefix)) {
                const filePath = key.replace(foldPrefix, '')
                console.log('[FoldSync] Fold state removed:', filePath)
                this.debouncedSyncFile(filePath, null)
            }
        }
    }

    restoreLocalStorage() {
        if (this.originalSetItem) {
            localStorage.setItem = this.originalSetItem
        }
        if (this.originalRemoveItem) {
            localStorage.removeItem = this.originalRemoveItem
        }
    }

    debouncedSync() {
        // Clear existing timer
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer)
        }

        console.log('[FoldSync] Debouncing full sync (500ms)...')

        // Set new timer to sync after 500ms of no changes
        this.debounceTimer = window.setTimeout(async () => {
            console.log('[FoldSync] Executing debounced full sync')
            await this.exportFoldsToFile()
            this.debounceTimer = null
        }, 500)
    }

    debouncedSyncFile(filePath: string, value: string | null) {
        // Clear existing timer
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer)
        }

        console.log('[FoldSync] Debouncing file sync (500ms) for:', filePath)

        // Set new timer to sync after 500ms of no changes
        this.debounceTimer = window.setTimeout(async () => {
            console.log(
                '[FoldSync] Executing debounced file sync for:',
                filePath
            )
            await this.upsertFoldStateForFile(filePath, value)
            this.debounceTimer = null
        }, 500)
    }

    async exportFoldsToFile() {
        if (!this.settings.enableSync) {
            console.log('[FoldSync] Sync disabled, skipping export')
            return
        }

        console.log('[FoldSync] Starting FULL export to file')

        const app = this.app as any
        const appId = app.appId
        const foldStates: FoldStateData = {}

        // Iterate through localStorage to find all fold states
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith(`${appId}-note-fold-`)) {
                const filePath = key.replace(`${appId}-note-fold-`, '')
                const value = localStorage.getItem(key)
                if (value) {
                    try {
                        foldStates[filePath] = JSON.parse(value)
                    } catch (e) {
                        console.error(
                            `[FoldSync] Failed to parse fold state for ${filePath}:`,
                            e
                        )
                    }
                }
            }
        }

        console.log(
            '[FoldSync] Found fold states for',
            Object.keys(foldStates).length,
            'files'
        )

        // Write to file using adapter for direct file system access (minified)
        const content = JSON.stringify(foldStates)
        const filePath = this.settings.syncFilePath

        try {
            await this.app.vault.adapter.write(filePath, content)
            console.log(
                '[FoldSync] Successfully exported ALL fold states to:',
                filePath
            )
        } catch (e) {
            console.error('[FoldSync] Failed to export fold states:', e)
            new Notice('Failed to export fold states')
        }
    }

    async upsertFoldStateForFile(filePath: string, value: string | null) {
        if (!this.settings.enableSync) {
            console.log('[FoldSync] Sync disabled, skipping upsert')
            return
        }

        console.log('[FoldSync] Starting upsert for single file:', filePath)
        const syncFilePath = this.settings.syncFilePath

        try {
            let foldStates: FoldStateData = {}

            // Read existing fold states if file exists
            const exists = await this.app.vault.adapter.exists(syncFilePath)
            if (exists) {
                const content = await this.app.vault.adapter.read(syncFilePath)
                foldStates = JSON.parse(content)
                console.log(
                    '[FoldSync] Loaded existing fold states, total files:',
                    Object.keys(foldStates).length
                )
            } else {
                console.log(
                    '[FoldSync] No existing fold states file, creating new'
                )
            }

            // Update or remove the specific file's fold state
            if (value === null) {
                console.log('[FoldSync] Removing fold state for:', filePath)
                delete foldStates[filePath]
            } else {
                console.log('[FoldSync] Updating fold state for:', filePath)
                foldStates[filePath] = JSON.parse(value)
            }

            // Write back to file (minified)
            const content = JSON.stringify(foldStates)
            await this.app.vault.adapter.write(syncFilePath, content)
            console.log(
                '[FoldSync] ✓ Successfully upserted fold state for:',
                filePath
            )
        } catch (e) {
            console.error('[FoldSync] Failed to upsert fold state:', e)
            new Notice('Failed to sync fold state')
        }
    }

    async applyFoldStateForFile(filePath: string) {
        if (!this.settings.enableSync) {
            console.log(
                '[FoldSync] Sync disabled, skipping apply for:',
                filePath
            )
            return
        }

        console.log('[FoldSync] ========== APPLYING FOLD STATE ==========')
        console.log('[FoldSync] File path:', filePath)

        const syncFilePath = this.settings.syncFilePath
        console.log('[FoldSync] Sync file path:', syncFilePath)

        try {
            // Check if fold states file exists
            const exists = await this.app.vault.adapter.exists(syncFilePath)
            console.log('[FoldSync] Fold states file exists:', exists)

            if (!exists) {
                console.log(
                    '[FoldSync] Fold states file does not exist, nothing to apply'
                )
                return
            }

            // Read fold states file
            const content = await this.app.vault.adapter.read(syncFilePath)
            console.log('[FoldSync] Read file content, length:', content.length)

            const foldStates: FoldStateData = JSON.parse(content)
            console.log(
                '[FoldSync] Parsed fold states, total files:',
                Object.keys(foldStates).length
            )

            // Check if this file has fold states
            if (foldStates[filePath]) {
                console.log('[FoldSync] ✓ Found fold state for file:', filePath)
                console.log('[FoldSync] Fold data:', foldStates[filePath])

                const app = this.app as any
                const file = this.app.vault.getAbstractFileByPath(filePath)

                if (!(file instanceof TFile)) {
                    console.log('[FoldSync] File not found in vault')
                    return
                }

                // Check if file is currently open in any markdown view
                const leaves = this.app.workspace
                    .getLeavesOfType('markdown')
                    .filter(
                        (leaf) =>
                            leaf.view &&
                            leaf.view instanceof MarkdownView &&
                            leaf.view.file?.path === filePath
                    )

                console.log(
                    '[FoldSync] File is open in',
                    leaves.length,
                    'views'
                )

                if (leaves.length) {
                    const t = app.workspace.getActiveViewOfType(MarkdownView)
					t.currentMode.applyFoldInfo(foldStates[filePath])
					t.onMarkdownFold()
                    console.log('[FoldSync] ✓ Called applyFoldInfo and view.onMarkdownFold()')
                } else {
                    // File is not open, save to foldManager
                    await app.foldManager.save(file, foldStates[filePath])
                    console.log(
                        '[FoldSync] ✓ Applied fold state via foldManager.save()'
                    )
                }

                console.log('[FoldSync] ========== APPLY COMPLETE ==========')
            } else {
                console.log(
                    '[FoldSync] ✗ No fold state found for file:',
                    filePath
                )
                console.log(
                    '[FoldSync] ========================================'
                )
            }
        } catch (e) {
            console.error('[FoldSync] ✗ Failed to apply fold state:', e)
            console.log('[FoldSync] ========================================')
        }
    }
}

