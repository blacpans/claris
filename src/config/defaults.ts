/**
 * Default Style Mappings
 * 拡張子と思考スタイル（Soul）のデフォルト対応表
 */

export const DEFAULT_STYLES = {
  // 🟩 Guard Soul: 安全性・堅実重視
  guard: [
    '.ts', '.tsx',        // TypeScript
    '.go',                // Go
    '.rs',                // Rust
    '.java',              // Java
    '.kt', '.kts',        // Kotlin
    '.swift',             // Swift
    '.c', '.h',           // C (Strict usage)
    '.cpp', '.hpp',       // C++ (Strict usage)
  ],

  // 🟦 Logic Soul: 論理的・効率重視
  logic: [
    '.py',                // Python
    '.rb',                // Ruby
    '.php',               // PHP
    '.pl',                // Perl
    '.r',                 // R
    '.sql',               // SQL
    '.sh', '.bash', '.zsh', // Shell Script
    '.json', '.yaml', '.yml', // Config files
    '.toml', '.xml',
  ],

  // 🟥 Passion Soul: 感情的・勢い重視
  passion: [
    '.js', '.jsx',        // JavaScript (Loose)
    '.mjs', '.cjs',
    '.html', '.htm',      // HTML
    '.css', '.scss', '.sass', // CSS
    '.md', '.txt',        // Documentation
    '.vue', '.svelte',    // Frontend Frameworks (often requires creativity)
    '.astro',
  ],
} as const;

export type ThinkingStyle = keyof typeof DEFAULT_STYLES;

/**
 * Default Ignored Files for Diff
 * 巨大な差分やノイズになるファイルをここで定義する
 */
export const DEFAULT_IGNORED_FILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
] as const;
