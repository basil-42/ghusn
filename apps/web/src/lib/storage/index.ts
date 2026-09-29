import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * تخزين الملفات خلف واجهة واحدة: محلياً الآن (مجلد uploads)، وCloudflare R2 عند النشر (D-32)
 * — يُضاف مشغّل R2 بنفس الواجهة دون تغيير بقية الكود.
 */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

/** مفاتيح آمنة فقط: حروف وأرقام وشرطات ونقاط ومسارات فرعية، بلا «..». */
export function isSafeKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9/_.-]{0,200}$/i.test(key) && !key.split("/").includes("..");
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!isSafeKey(key)) throw new Error(`Unsafe storage key: ${key}`);
    return path.join(this.root, key);
  }

  async put(key: string, body: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string) {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

export const storage: Storage = new LocalStorage(
  path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads")),
);
