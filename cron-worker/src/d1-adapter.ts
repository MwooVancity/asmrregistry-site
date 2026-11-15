// cron-worker/src/d1-adapter.ts — libsql-compatible wrapper over D1

export interface D1Row { [key: string]: any }
export interface D1Result { rows: D1Row[]; columns: string[] }

export type Client = D1Adapter;

export class D1Adapter {
  constructor(private db: D1Database) {}

  async execute(query: string | { sql: string; args?: any[] }): Promise<D1Result> {
    const sql = typeof query === 'string' ? query : query.sql;
    const args = typeof query === 'string' ? [] : (query.args ?? []);
    const stmt = this.db.prepare(sql).bind(...args);
    const result = await stmt.all();
    return {
      rows: result.results ?? [],
      columns: result.results?.length ? Object.keys(result.results[0]) : [],
    };
  }

  async batch(stmts: Array<{ sql: string; args?: any[] }>, _mode?: string): Promise<D1Result[]> {
    const prepared = stmts.map(s => this.db.prepare(s.sql).bind(...(s.args ?? [])));
    const results = await this.db.batch(prepared);
    return results.map((r: any) => ({
      rows: r.results ?? [],
      columns: r.results?.length ? Object.keys(r.results[0]) : [],
    }));
  }
}
