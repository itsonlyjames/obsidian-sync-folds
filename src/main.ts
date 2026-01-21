import { Notice, Plugin } from 'obsidian'
import { SyncFoldSettings, DEFAULT_SETTINGS } from './settings'
import { FoldStateData } from './types'
import { log } from './log'

export default class SyncFolds extends Plugin {
    settings: SyncFoldSettings
    private debounceTimer: number | null = null
    private originalSetItem: typeof Storage.prototype.setItem
    private originalRemoveItem: typeof Storage.prototype.removeItem
    private cachedFolds: FoldStateData = {}

    private getFoldsObject(): FoldStateData {
        try {
            return JSON.parse(this.settings.folds)
        } catch (e) {
            console.error('Failed to parse folds string:', e)
            return {}
        }
    }

    // Helper to set folds from object
    private setFoldsObject(folds: FoldStateData): void {
        this.settings.folds = JSON.stringify(folds)
    }

    public async onExternalSettingsChange(): Promise<void> {
        log('Fold states file changed externally: Syncing with localStorage')

        const previousFolds = { ...this.cachedFolds }
        await this.loadSettings()
        const currentFolds = this.getFoldsObject()

        const app = this.app as any
        const appId = app.appId

        // Remove folds that were deleted
        for (const filePath of Object.keys(previousFolds)) {
            if (!currentFolds[filePath]) {
                const key = `${appId}-note-fold-${filePath}`
                this.originalRemoveItem.call(localStorage, key)
                log('Removed fold from localStorage:', filePath)
            }
        }

        // Upsert folds
        for (const [filePath, foldData] of Object.entries(currentFolds)) {
            if (
                JSON.stringify(previousFolds[filePath]) !==
                JSON.stringify(foldData)
            ) {
                const key = `${appId}-note-fold-${filePath}`
                const value = JSON.stringify(foldData)
                this.originalSetItem.call(localStorage, key, value)
                log('Updated fold in localStorage:', filePath)
            }
        }

        this.cachedFolds = currentFolds
        log('localStorage sync complete')
    }

    async onload() {
        await this.loadSettings()
        log('Plugin loaded with settings:', this.settings)

        if (!this.settings.enableSync) {
            log('Sync disabled, skipping initialization')
            return
        }

        log('Intercepting localStorage')
        this.interceptLocalStorage()

        const folds = this.getFoldsObject()
        const hasSavedFolds = Object.keys(folds).length > 0

        if (hasSavedFolds) {
            log('Existing folds found in settings: importing to localStorage')
            await this.importFoldsToStorage()
        } else {
            log('No folds in settings: exporting from localStorage')
            await this.exportFoldsToFile()
        }

        this.cachedFolds = { ...this.getFoldsObject() }

        this.addCommand({
            id: 'export-fold-states',
            name: 'Export Folds from Local Storage',
            callback: async () => {
                await this.exportFoldsToFile()
                new Notice('Fold states saved to settings')
            }
        })

        this.addCommand({
            id: 'import-fold-states',
            name: 'Import Folds into Local Storage',
            callback: async () => {
                await this.importFoldsToStorage()
                new Notice('Fold states applied from settings')
            }
        })

        log('Plugin initialization complete')
    }

    onunload() {
        log('Plugin unloading')
        this.restoreLocalStorage()

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
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }

    interceptLocalStorage() {
        const app = this.app as any
        const appId = app.appId
        const foldPrefix = `${appId}-note-fold-`

        log('Setting up localStorage interception with prefix:', foldPrefix)

        this.originalSetItem = localStorage.setItem.bind(localStorage)
        this.originalRemoveItem = localStorage.removeItem.bind(localStorage)

        localStorage.setItem = (key: string, value: string) => {
            this.originalSetItem(key, value)

            if (key.startsWith(foldPrefix)) {
                const filePath = key.replace(foldPrefix, '')
                log('Fold state changed:', filePath)
                this.debouncedSyncFile(filePath, value)
            }
        }

        localStorage.removeItem = (key: string) => {
            this.originalRemoveItem(key)

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

    debouncedSyncFile(filePath: string, value: string | null) {
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer)
        }

        log('Debouncing file sync (150ms) for:', filePath)

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

        log('Exporting localStorage folds → settings.folds')

        const app = this.app as any
        const appId = app.appId
        const folds: FoldStateData = {}

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(`${appId}-note-fold-`)) {
                const filePath = key.replace(`${appId}-note-fold-`, '')
                const value = localStorage.getItem(key)

                if (!value) continue

                try {
                    folds[filePath] = JSON.parse(value)
                } catch (e) {
                    console.error(`Failed to parse fold for ${filePath}`, e)
                }
            }
        }

        this.setFoldsObject(folds)
        this.cachedFolds = { ...folds }
        await this.saveSettings()

        log('Saved', Object.keys(folds).length, 'fold states to settings')
    }

    async importFoldsToStorage() {
        const folds = this.getFoldsObject()

        log(
            'Importing',
            Object.keys(folds).length,
            'folds from settings → localStorage'
        )

        const app = this.app as any
        const appId = app.appId

        for (const [filePath, foldData] of Object.entries(folds)) {
            log(filePath, foldData)
            const key = `${appId}-note-fold-${filePath}`
            const value = JSON.stringify(foldData)
            this.originalSetItem.call(localStorage, key, value)
        }

        this.cachedFolds = { ...folds }
        log('Fold states imported successfully')
    }

    async upsertFoldStateForFile(filePath: string, value: string | null) {
        if (!this.settings.enableSync) {
            log('Sync disabled, skipping upsert')
            return
        }

        log('Upserting fold state for:', filePath)

        const folds = this.getFoldsObject()

        if (value === null) {
            delete folds[filePath]
            log('Removed fold state for:', filePath)
        } else {
            try {
                folds[filePath] = JSON.parse(value)
                log('Updated fold state for:', filePath)
            } catch (e) {
                console.error('Failed to parse fold JSON:', e)
                return
            }
        }

        this.setFoldsObject(folds)
        this.cachedFolds = { ...folds }
        await this.saveSettings()
    }
}
