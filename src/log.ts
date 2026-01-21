declare const DEBUG: boolean

export const log = (...args: any[]) => {
    if (DEBUG) {
        console.log('[SyncFolds]', ...args)
    }
}
