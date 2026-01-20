import { Notice, Plugin, TFile, MarkdownView } from 'obsidian'
import { FoldStateData } from './types'
import { SyncFoldSettings } from './settings'
import { LocalStorageManager } from './storage'
import { log } from './log'

export class FoldSync {
    constructor(
        private plugin: Plugin,
        private settings: SyncFoldSettings,
        private storageManager: LocalStorageManager
    ) {}

    async exportFoldsToFile() {
        if (!this.settings.enableSync) {
            log('Sync disabled, skipping export')
            return
        }

        log('Starting full export to file')

        const app = this.plugin.app as any
        const appId = app.appId
        const foldStates: FoldStateData = {}

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(`${appId}-note-fold-`)) {
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

        const content = JSON.stringify(foldStates)
        const filePath = this.settings.syncFilePath

        try {
            await this.plugin.app.vault.adapter.write(filePath, content)
            log('Successfully exported all fold states to:', filePath)
        } catch (e) {
            console.error('Failed to export fold states:', e)
            new Notice('Failed to export fold states')
            throw e
        }
    }

    async importFoldsToStorage() {
        const syncFilePath = this.settings.syncFilePath

        try {
            const content =
                await this.plugin.app.vault.adapter.read(syncFilePath)
            const foldStates: FoldStateData = JSON.parse(content)

            log(
                'Loaded',
                Object.keys(foldStates).length,
                'fold states from file'
            )

            const app = this.plugin.app as any
            const appId = app.appId

            for (const [filePath, foldData] of Object.entries(foldStates)) {
                const key = `${appId}-note-fold-${filePath}`
                const value = JSON.stringify(foldData)
                this.storageManager
                    .getOriginalSetItem()
                    .call(localStorage, key, value)
            }

            log('Successfully imported fold states to localStorage')
        } catch (e) {
            console.error('Failed to import fold states from file:', e)
            new Notice('Failed to load fold states from file')
            throw e
        }
    }

    async upsertFoldStateForFile(filePath: string, value: string | null) {
        if (!this.settings.enableSync) {
            log('Sync disabled, skipping upsert')
            return
        }

        log('Starting upsert for file:', filePath)
        const syncFilePath = this.settings.syncFilePath

        try {
            let foldStates: FoldStateData = {}

            const exists =
                await this.plugin.app.vault.adapter.exists(syncFilePath)
            if (exists) {
                const content =
                    await this.plugin.app.vault.adapter.read(syncFilePath)
                foldStates = JSON.parse(content)
                log(
                    'Loaded existing fold states, total files:',
                    Object.keys(foldStates).length
                )
            } else {
                log('No existing fold states file, creating new')
            }

            if (value === null) {
                log('Removing fold state for:', filePath)
                delete foldStates[filePath]
            } else {
                log('Updating fold state for:', filePath)
                foldStates[filePath] = JSON.parse(value)
            }

            const content = JSON.stringify(foldStates)
            await this.plugin.app.vault.adapter.write(syncFilePath, content)
            log('Successfully upserted fold state for:', filePath)
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

        log('Applying fold state for:', filePath)

        const syncFilePath = this.settings.syncFilePath

        try {
            const exists =
                await this.plugin.app.vault.adapter.exists(syncFilePath)
            if (!exists) {
                log('Fold states file does not exist')
                return
            }

            const content =
                await this.plugin.app.vault.adapter.read(syncFilePath)
            const foldStates: FoldStateData = JSON.parse(content)

            if (foldStates[filePath]) {
                log('Found fold state for file:', filePath)

                const app = this.plugin.app as any
                const file =
                    this.plugin.app.vault.getAbstractFileByPath(filePath)

                if (!(file instanceof TFile)) {
                    log('File not found in vault')
                    return
                }

                const leaves = this.plugin.app.workspace
                    .getLeavesOfType('markdown')
                    .filter(
                        (leaf) =>
                            leaf.view instanceof MarkdownView &&
                            leaf.view.file?.path === filePath
                    )

                log('File is open in', leaves.length, 'views')

                if (leaves.length) {
                    const view = app.workspace.getActiveViewOfType(MarkdownView)
                    view.currentMode.applyFoldInfo(foldStates[filePath])
                    view.onMarkdownFold()
                    log('Applied fold info to active view')
                } else {
                    await app.foldManager.save(file, foldStates[filePath])
                    log('Applied fold state via foldManager')
                }
            } else {
                log('No fold state found for file:', filePath)
            }
        } catch (e) {
            console.error('Failed to apply fold state:', e)
        }
    }
}
