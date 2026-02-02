import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_STYLES, type ThinkingStyle } from './defaults.js';

/**
 * Navi Customizer Configuration
 */
export interface ClarisConfig {
  /** ⚔️ Attack: 回答の最大トークン数 (maxOutputTokens) */
  attack: number;
  /** ⚡ Rapid: 応答速度/モデル (Gemini Flash vs Pro) */
  rapid: 'flash' | 'pro';
  /** 🔋 Charge: 記憶力/コンテキスト数 (History length) */
  charge: number;
  /** 🎀 Humor: 創造性/人格 (Temperature) */
  humor: number;
  /** 🎭 Styles: 拡張子ごとのスタイル定義 (Custom) */
  styles?: Partial<Record<ThinkingStyle, string[]>>;
  /** 🔒 Preferred Style: 自動切り替えを無効化し、常にこのスタイルを使用する */
  preferredStyle?: ThinkingStyle;
}

const CONFIG_FILE_NAME = 'claris.config.json';
const DEFAULT_CONFIG: ClarisConfig = {
  attack: 1024,
  rapid: 'flash',
  charge: 10,
  humor: 0.8,
  styles: {},
  // preferredStyle is undefined by default (auto mode)
};

/**
 * 設定ファイルを読み込む
 */
export async function loadConfig(): Promise<ClarisConfig> {
  try {
    const configPath = path.resolve(process.cwd(), CONFIG_FILE_NAME);
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch (error) {
    console.warn('Could not load claris.config.json, using defaults.');
    return DEFAULT_CONFIG;
  }
}

/**
 * モデル名に変換する
 */
export function getModelName(rapid: ClarisConfig['rapid']): string {
  const proModel = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
  return rapid === 'pro' ? proModel : 'gemini-1.5-flash';
}

/**
 * 拡張子からスタイルを決定する
 */
export function getStyleForExtension(extension: string, config: ClarisConfig): ThinkingStyle {
  // 0. Check Preferred Style (Global Override)
  if (config.preferredStyle) {
    return config.preferredStyle;
  }

  if (!extension) return 'passion'; // Default to Passion if no extension provided

  let normalizedExt = extension;
  // If it looks like a path with extension, extract it
  const ext = path.extname(extension);
  if (ext) {
    normalizedExt = ext;
  } else if (!extension.startsWith('.')) {
    // If it's just "py" without dot
    normalizedExt = `.${extension}`;
  }

  // 1. Check User Config (Overrides defaults)
  if (config.styles) {
    for (const [style, extensions] of Object.entries(config.styles)) {
      if (Array.isArray(extensions) && extensions.includes(normalizedExt)) {
        return style as ThinkingStyle;
      }
    }
  }

  // 2. Check Defaults
  for (const [style, extensions] of Object.entries(DEFAULT_STYLES)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((extensions as readonly string[]).includes(normalizedExt)) {
      return style as ThinkingStyle;
    }
  }

  // 3. Fallback
  return 'passion';
}
