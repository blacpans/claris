import fs from 'node:fs/promises';
import path from 'node:path';
import { Firestore } from '@google-cloud/firestore';

/**
 * Saved credentials type (from auth.ts)
 */
export interface SavedCredentials {
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
  save(credentials: SavedCredentials): Promise<void>;
  load(): Promise<SavedCredentials | null>;
}

/**
 * File-based Credential Store (Local)
 */
export class FileCredentialStore implements CredentialStore {
  private readonly filePath: string;

  constructor(filePath: string = 'token.json') {
    this.filePath = path.resolve(process.cwd(), filePath);
  }

  async save(credentials: SavedCredentials): Promise<void> {
    const payload = JSON.stringify(credentials);
    await fs.writeFile(this.filePath, payload);
  }

  async load(): Promise<SavedCredentials | null> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as SavedCredentials;
    } catch (error) {
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
  private readonly docId: string;

  constructor(collectionName: string = 'claris-auth', docId: string = 'google-credentials') {
    this.db = new Firestore({ ignoreUndefinedProperties: true });
    this.collectionName = collectionName;
    this.docId = docId;
  }

  async save(credentials: SavedCredentials): Promise<void> {
    // Remove undefined values to avoid Firestore errors (handled by helper in session, but let's be safe here too)
    const cleanCredentials = JSON.parse(JSON.stringify(credentials));
    await this.db.collection(this.collectionName).doc(this.docId).set(cleanCredentials);
  }

  async load(): Promise<SavedCredentials | null> {
    const doc = await this.db.collection(this.collectionName).doc(this.docId).get();
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
