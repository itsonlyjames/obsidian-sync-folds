export interface Fold {
    from: number
    to: number
}

export interface FoldedProperties {
    folds: Fold[]
    lines: number
}

export interface FoldStateData {
    [filePath: string]: FoldedProperties
}
