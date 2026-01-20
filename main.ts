import { Notice, Plugin, TFile, MarkdownView } from 'obsidian'

declare const DEBUG: boolean
const log = (...args: any[]) => {
    if (DEBUG) {
        console.log('[SyncFolds]', ...args)
    }
}

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
        log('Plugin loaded with settings:', this.settings)

        const syncFilePath = this.settings.syncFilePath
        const exists = await this.app.vault.adapter.exists(syncFilePath)

        // Intercept localStorage changes to detect fold state changes
        if (this.settings.enableSync) {
            log('Intercepting localStorage')
            this.interceptLocalStorage()
        }

        // Initial export to capture current localStorage state
        if (this.settings.enableSync && !exists) {
            log('No fold states file: Exporting Existing Local Storage Folds')
            await this.exportFoldsToFile()
        } else {
            log('Fold states file exists: Populating Local Storage')
            await this.importFoldsToStorage()
        }

        // Listen for file opens to apply fold states
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async (leaf) => {
                if (
                    leaf &&
                    leaf.view instanceof MarkdownView &&
                    leaf.view.file
                ) {
                    log('Active leaf event:', leaf)
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    await this.applyFoldStateForFile(leaf.view.file.path)
                } else {
                    log('File opened event: no file (closed)')
                }
            })
        )

        log('Plugin initialization complete')
    }

    onunload() {
        log('Plugin unloading')
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

        log('Setting up localStorage interception with prefix:', foldPrefix)

        // Store original methods
        this.originalSetItem = localStorage.setItem.bind(localStorage)
        this.originalRemoveItem = localStorage.removeItem.bind(localStorage)

        // Override setItem
        localStorage.setItem = (key: string, value: string) => {
            this.originalSetItem(key, value)

            // Check if this is a fold state change
            if (key.startsWith(foldPrefix)) {
                const filePath = key.replace(foldPrefix, '')
                log('Fold state changed:', filePath)
                this.debouncedSyncFile(filePath, value)
            }
        }

        // Override removeItem
        localStorage.removeItem = (key: string) => {
            this.originalRemoveItem(key)

            // Check if this is a fold state removal
            if (key.startsWith(foldPrefix)) {
                const filePath = key.replace(foldPrefix, '')
                log('Fold state removed:', filePath)
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

        log('Debouncing full sync (150ms)...')

        // Set new timer to sync after 150ms of no changes
        this.debounceTimer = window.setTimeout(async () => {
            log('Executing debounced full sync')
            await this.exportFoldsToFile()
            this.debounceTimer = null
        }, 150)
    }

    debouncedSyncFile(filePath: string, value: string | null) {
        // Clear existing timer
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer)
        }

        log('Debouncing file sync (150ms) for:', filePath)

        // Set new timer to sync after 150ms of no changes
        this.debounceTimer = window.setTimeout(async () => {
            log('Executing debounced file sync for:', filePath)
            await this.upsertFoldStateForFile(filePath, value)
            this.debounceTimer = null
        }, 150)
    }

    async exportFoldsToFile() {
        if (!this.settings.enableSync) {
            log('Sync disabled, skipping export')
            return
        }

        log('Starting FULL export to file')

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
                            `Failed to parse fold state for ${filePath}:`,
                            e
                        )
                    }
                }
            }
        }

        log('Found fold states for', Object.keys(foldStates).length, 'files')

        // Write to file using adapter for direct file system access (minified)
        const content = JSON.stringify(foldStates)
        const filePath = this.settings.syncFilePath

        try {
            await this.app.vault.adapter.write(filePath, content)
            log('Successfully exported ALL fold states to:', filePath)
        } catch (e) {
            console.error('Failed to export fold states:', e)
            new Notice('Failed to export fold states')
        }
    }

    async importFoldsToStorage() {
        const syncFilePath = this.settings.syncFilePath

        try {
            const content = await this.app.vault.adapter.read(syncFilePath)
            const foldStates: FoldStateData = JSON.parse(content)

            log(
                'Loaded',
                Object.keys(foldStates).length,
                'fold states from file'
            )

            const app = this.app as any
            const appId = app.appId

            for (const [filePath, foldData] of Object.entries(foldStates)) {
                const key = `${appId}-note-fold-${filePath}`
                const value = JSON.stringify(foldData)

                // Use original setItem to avoid triggering our interceptor
                this.originalSetItem.call(localStorage, key, value)
            }

            log('Successfully imported fold states to localStorage')
        } catch (e) {
            console.error('Failed to import fold states from file:', e)
            new Notice('Failed to load fold states from file')
        }
    }

    async upsertFoldStateForFile(filePath: string, value: string | null) {
        if (!this.settings.enableSync) {
            log('Sync disabled, skipping upsert')
            return
        }

        log('Starting upsert for single file:', filePath)
        const syncFilePath = this.settings.syncFilePath

        try {
            let foldStates: FoldStateData = {}

            // Read existing fold states if file exists
            const exists = await this.app.vault.adapter.exists(syncFilePath)
            if (exists) {
                const content = await this.app.vault.adapter.read(syncFilePath)
                foldStates = JSON.parse(content)
                log(
                    'Loaded existing fold states, total files:',
                    Object.keys(foldStates).length
                )
            } else {
                log('No existing fold states file, creating new')
            }

            // Update or remove the specific file's fold state
            if (value === null) {
                log('Removing fold state for:', filePath)
                delete foldStates[filePath]
            } else {
                log('Updating fold state for:', filePath)
                foldStates[filePath] = JSON.parse(value)
            }

            // Write back to file (minified)
            const content = JSON.stringify(foldStates)
            await this.app.vault.adapter.write(syncFilePath, content)
            log('✓ Successfully upserted fold state for:', filePath)
        } catch (e) {
            console.error('Failed to upsert fold state:', e)
            new Notice('Failed to sync fold state')
        }
    }

    async applyFoldStateForFile(filePath: string) {
        if (!this.settings.enableSync) {
            log('Sync disabled, skipping apply for:', filePath)
            return
        }

        log('========== APPLYING FOLD STATE ==========')
        log('File path:', filePath)

        const syncFilePath = this.settings.syncFilePath
        log('Sync file path:', syncFilePath)

        try {
            // Check if fold states file exists
            const exists = await this.app.vault.adapter.exists(syncFilePath)
            log('Fold states file exists:', exists)

            if (!exists) {
                log('Fold states file does not exist, nothing to apply')
                return
            }

            // Read fold states file
            const content = await this.app.vault.adapter.read(syncFilePath)
            log('Read file content, length:', content.length)

            const foldStates: FoldStateData = JSON.parse(content)
            log(
                'Parsed fold states, total files:',
                Object.keys(foldStates).length
            )

            // Check if this file has fold states
            if (foldStates[filePath]) {
                log('✓ Found fold state for file:', filePath)
                log('Fold data:', foldStates[filePath])

                const app = this.app as any
                const file = this.app.vault.getAbstractFileByPath(filePath)

                if (!(file instanceof TFile)) {
                    log('File not found in vault')
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

                log('File is open in', leaves.length, 'views')

                if (leaves.length) {
                    const t = app.workspace.getActiveViewOfType(MarkdownView)
                    t.currentMode.applyFoldInfo(foldStates[filePath])
                    t.onMarkdownFold()
                    log('✓ Called applyFoldInfo and view.onMarkdownFold()')
                } else {
                    // File is not open, save to foldManager
                    await app.foldManager.save(file, foldStates[filePath])
                    log('✓ Applied fold state via foldManager.save()')
                }

                log('========== APPLY COMPLETE ==========')
            } else {
                log('✗ No fold state found for file:', filePath)
                log('========================================')
            }
        } catch (e) {
            console.error('✗ Failed to apply fold state:', e)
            log('========================================')
        }
    }
}
