declare const DEBUG: boolean

export const log = (...args: unknown[]) => {
    if (DEBUG) {
        console.debug('[SyncFolds]', ...args)
    }
}
