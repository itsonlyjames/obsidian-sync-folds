import { Notice, Plugin, MarkdownView } from 'obsidian'
import { SyncFoldSettings, DEFAULT_SETTINGS } from './settings'
import { LocalStorageManager } from './storage'
import { FoldSync } from './sync'
import { log } from './log'

export default class SyncFolds extends Plugin {
    settings: SyncFoldSettings
    private debounceTimer: number | null = null
    private storageManager: LocalStorageManager
    private foldSync: FoldSync

    async onload() {
        await this.loadSettings()
        log('Plugin loaded with settings:', this.settings)

        const syncFilePath = this.settings.syncFilePath
        const exists = await this.app.vault.adapter.exists(syncFilePath)

        this.storageManager = new LocalStorageManager(
            this,
            (filePath, value) => this.debouncedSyncFile(filePath, value)
        )
        
        this.foldSync = new FoldSync(this, this.settings, this.storageManager)

        if (this.settings.enableSync) {
            log('Intercepting localStorage')
            this.storageManager.intercept()
        }

        if (this.settings.enableSync && !exists) {
            log('Performing initial export of all fold states')
            await this.foldSync.exportFoldsToFile()
        } else if (this.settings.enableSync) {
            log('Importing fold states from file to localStorage')
            await this.foldSync.importFoldsToStorage()
        }

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async (leaf) => {
                if (leaf?.view instanceof MarkdownView && leaf.view.file) {
                    log('Active leaf changed:', leaf.view.file.path)
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    await this.foldSync.applyFoldStateForFile(leaf.view.file.path)
                }
            })
        )

        this.addCommand({
            id: 'export-fold-states',
            name: 'Export to Fold State File',
            callback: async () => {
                await this.foldSync.exportFoldsToFile()
                new Notice('Fold states exported successfully')
            }
        })

        this.addCommand({
            id: 'import-fold-states',
            name: 'Import Folds to Local Storage',
            callback: async () => {
                await this.foldSync.importFoldsToStorage()
                new Notice('Fold states imported successfully')
            }
        })

        log('Plugin initialization complete')
    }

    onunload() {
        log('Plugin unloading')
        this.storageManager.restore()

        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer)
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
        
        if (!this.settings.syncFilePath) {
            this.settings.syncFilePath = `${this.manifest.dir}/fold-states.json`
        }
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }

    debouncedSyncFile(filePath: string, value: string | null) {
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer)
        }

        log('Debouncing file sync (500ms) for:', filePath)

        this.debounceTimer = window.setTimeout(async () => {
            log('Executing debounced file sync for:', filePath)
            await this.foldSync.upsertFoldStateForFile(filePath, value)
            this.debounceTimer = null
        }, 500)
    }
}
