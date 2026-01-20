export interface SyncFoldSettings {
    syncFilePath: string
    enableSync: boolean
}

export const DEFAULT_SETTINGS: SyncFoldSettings = {
    syncFilePath: '',
    enableSync: true
}
