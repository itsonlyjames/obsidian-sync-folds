import { FoldStateData } from "./types"

export interface SyncFoldSettings {
    enableSync: boolean,
	folds: FoldStateData
}

export const DEFAULT_SETTINGS: SyncFoldSettings = {
    enableSync: true,
	folds: {}
}
