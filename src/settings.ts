export interface SyncFoldSettings {
    enableSync: boolean
    folds: string
}

export const DEFAULT_SETTINGS: SyncFoldSettings = {
    enableSync: true,
    folds: '{}'
}
