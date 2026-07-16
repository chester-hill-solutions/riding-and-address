import { Database } from "bun:sqlite";
/**
 * In-memory SQLite test DB (via `bun:sqlite`) that stands in for Cloudflare D1
 * in unit tests — no Miniflare/Workers runtime required. Schema shape and DDL
 * mirror D1 (see `WORKSPACE_INVITATION_DDL` etc.); D1-specific behavior (e.g.
 * the lack of interactive transactions) is exercised by calling the exported
 * helpers sequentially, same as production code would.
 */
export interface TestDbConfig<T extends Record<string, unknown>> {
    schema: T;
    ddl: string;
}
export declare function createTestDb<T extends Record<string, unknown>>(config: TestDbConfig<T>): {
    db: T;
    sqlite: Database;
};
export declare function withTestDb<T, S extends Record<string, unknown>>(config: TestDbConfig<S>, fn: (ctx: {
    db: S;
}) => Promise<T>): Promise<T>;
