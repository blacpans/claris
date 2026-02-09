import fs from 'node:fs/promises';
import path from 'node:path';
import { Firestore } from '@google-cloud/firestore';

/**
 * Saved credentials type (for OAuth2)
 * googleapis の authorized_user 形式と互換性を保持
 */
export interface SavedCredentials {
  type?: 'authorized_user';
  client_id?: string;
  client_secret?: string;
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
}

/**
 * Interface for Credential Storage
 */
export interface CredentialStore {
  save(credentials: SavedCredentials, profile?: string): Promise<void>;
  load(profile?: string): Promise<SavedCredentials | null>;
}

/**
 * File-based Credential Store (Local)
 */
export class FileCredentialStore implements CredentialStore {
  private readonly baseFilePath: string;

  constructor(filePath = 'token.json') {
    this.baseFilePath = path.resolve(process.cwd(), filePath);
  }

  private getFilePath(profile?: string): string {
    if (!profile) return this.baseFilePath;
    const ext = path.extname(this.baseFilePath);
    const name = path.basename(this.baseFilePath, ext);
    const dir = path.dirname(this.baseFilePath);
    return path.join(dir, `${name}_${profile}${ext}`);
  }

  async save(credentials: SavedCredentials, profile?: string): Promise<void> {
    const payload = JSON.stringify(credentials);
    await fs.writeFile(this.getFilePath(profile), payload);
  }

  async load(profile?: string): Promise<SavedCredentials | null> {
    try {
      const content = await fs.readFile(this.getFilePath(profile), 'utf-8');
      return JSON.parse(content) as SavedCredentials;
    } catch (_error) {
      return null;
    }
  }
}

/**
 * Firestore-based Credential Store (Cloud)
 */
export class FirestoreCredentialStore implements CredentialStore {
  private readonly db: Firestore;
  private readonly collectionName: string;
  private readonly baseDocId: string;

  constructor(collectionName = 'claris-auth', docId = 'google-credentials') {
    this.db = new Firestore({ ignoreUndefinedProperties: true });
    this.collectionName = collectionName;
    this.baseDocId = docId;
  }

  private getDocId(profile?: string): string {
    if (!profile) return this.baseDocId;
    return `${this.baseDocId}-${profile}`;
  }

  async save(credentials: SavedCredentials, profile?: string): Promise<void> {
    // Remove undefined values to avoid Firestore errors
    const cleanCredentials = JSON.parse(JSON.stringify(credentials));
    await this.db.collection(this.collectionName).doc(this.getDocId(profile)).set(cleanCredentials);
  }

  async load(profile?: string): Promise<SavedCredentials | null> {
    const doc = await this.db.collection(this.collectionName).doc(this.getDocId(profile)).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as SavedCredentials;
  }
}

/**
 * Factory to get the appropriate store based on environment
 */
export function getCredentialStore(): CredentialStore {
  const type = process.env.TOKEN_STORE_TYPE || 'file'; // default to file

  if (type === 'firestore') {
    const collection = process.env.FIRESTORE_AUTH_COLLECTION || 'claris-auth';
    console.log(`[Auth] Using FirestoreCredentialStore (collection: ${collection})`);
    return new FirestoreCredentialStore(collection);
  }

  console.log('[Auth] Using FileCredentialStore');
  return new FileCredentialStore();
}
