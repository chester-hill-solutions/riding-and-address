import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
export function createTestDb(config) {
    const sqlite = new Database(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    if (config.ddl) {
        sqlite.exec(config.ddl);
    }
    const db = drizzle(sqlite, { schema: config.schema });
    return { db, sqlite };
}
export async function withTestDb(config, fn) {
    const { db, sqlite } = createTestDb(config);
    try {
        return await fn({ db });
    }
    finally {
        sqlite.close();
    }
}
