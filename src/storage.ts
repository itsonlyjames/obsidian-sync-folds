import { Plugin } from 'obsidian'
import { log } from './log'

export class LocalStorageManager {
    private originalSetItem: typeof Storage.prototype.setItem
    private originalRemoveItem: typeof Storage.prototype.removeItem
    private onFoldChange: (filePath: string, value: string | null) => void

    constructor(
        private plugin: Plugin,
        onFoldChange: (filePath: string, value: string | null) => void
    ) {
        this.onFoldChange = onFoldChange
    }

    intercept() {
        const app = this.plugin.app as any
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
                this.onFoldChange(filePath, value)
            }
        }

        localStorage.removeItem = (key: string) => {
            this.originalRemoveItem(key)

            if (key.startsWith(foldPrefix)) {
                const filePath = key.replace(foldPrefix, '')
                log('Fold state removed:', filePath)
                this.onFoldChange(filePath, null)
            }
        }
    }

    restore() {
        if (this.originalSetItem) {
            localStorage.setItem = this.originalSetItem
        }
        if (this.originalRemoveItem) {
            localStorage.removeItem = this.originalRemoveItem
        }
    }

    getOriginalSetItem() {
        return this.originalSetItem
    }
}
