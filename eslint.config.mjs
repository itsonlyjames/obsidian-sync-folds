// eslint.config.mjs
import { defineConfig } from 'eslint/config'
import tsparser from '@typescript-eslint/parser'
import obsidianmd from 'eslint-plugin-obsidianmd'

export default defineConfig([
    // Obsidian-specific best practices
    ...obsidianmd.configs.recommended,

    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: './tsconfig.json',
                sourceType: 'module'
            }
        },
        rules: {
            // Optional tweaks
            'obsidianmd/sample-names': 'off',
            'obsidianmd/ui/sentence-case': 'warn'
        }
    },

    // Ignore bundled output
    {
        ignores: ['main.js', 'dist/**']
    }
])
