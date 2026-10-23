// Cloudflare Workers/Pages environment types
declare global {
  interface LaunchParams {
    readonly files: readonly FileSystemFileHandle[];
  }

  interface LaunchQueue {
    setConsumer(consumer: (params: LaunchParams) => void): void;
  }

  interface CloudflareEnv {
    ZKETCH_SHARES: KVNamespace;
    ZKETCH_SHARE_FILES?: unknown;
    ZKETCH_B2_ENDPOINT?: string;
    ZKETCH_B2_KEY_ID?: string;
    ZKETCH_B2_APP_KEY?: string;
    ZKETCH_B2_BUCKET?: string;
  }

  interface KVNamespace {
    get(
      key: string,
      options?: { type?: "text" | "json" | "arrayBuffer" | "stream" }
    ): Promise<string | null>;
    put(
      key: string,
      value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
      options?: {
        expiration?: number;
        expirationTtl?: number;
        metadata?: any;
      }
    ): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      keys: Array<{ name: string; expiration?: number; metadata?: any }>;
      list_complete: boolean;
      cursor?: string;
    }>;
  }
}

export {};
