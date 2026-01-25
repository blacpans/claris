import fs from 'node:fs/promises';
import path from 'node:path';

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
}

const CONFIG_FILE_NAME = 'claris.config.json';
const DEFAULT_CONFIG: ClarisConfig = {
  attack: 1024,
  rapid: 'flash',
  charge: 10,
  humor: 0.8,
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
  const proModel = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
  return rapid === 'pro' ? proModel : 'gemini-3-flash-preview';
}
