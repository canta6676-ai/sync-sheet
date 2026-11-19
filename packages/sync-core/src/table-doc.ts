/**
 * 基于 Yjs 的表格文档模型
 *
 * 数据结构：
 *   rows:     Y.Map<行ID, Y.Map<"字段ID|设备ID", CellEntry>>
 *   rowOrder: Y.Array<行ID>
 *   meta:     Y.Map，存放表格结构
 *
 * 每台设备对同一个单元格的写入存在各自的键下，所以：
 * - 不同单元格的修改天然合并，互不覆盖；
 * - 同一单元格被多台设备修改时，所有写入都会保留，读取时按 HLC 取最新的一份，
 *   被覆盖的旧值可以提示给用户，并一键恢复。
 */

import * as Y from "yjs";
import { HybridLogicalClock, compareTimestamps, type Timestamp } from "./hlc";
import { validateRow, type CellValue, type Row, type TableSchema, type ValidationError } from "./schema";

export interface CellEntry {
  value: CellValue;
  ts: Timestamp;
}

type RowMap = Y.Map<CellEntry>;

const SEP = "|";

export class TableDoc {
  readonly doc: Y.Doc;
  private readonly rows: Y.Map<RowMap>;
  private readonly order: Y.Array<string>;
  private readonly meta: Y.Map<unknown>;
  private readonly clock: HybridLogicalClock;

  constructor(
    private readonly nodeId: string,
    doc: Y.Doc = new Y.Doc(),
  ) {
    this.doc = doc;
    this.rows = doc.getMap<RowMap>("rows");
    this.order = doc.getArray<string>("rowOrder");
    this.meta = doc.getMap<unknown>("meta");
    this.clock = new HybridLogicalClock(nodeId);

    // 收到其他设备的修改时推进本地时钟，保证之后的本地写入一定排在后面
    this.rows.observeDeep((events, transaction) => {
      if (transaction.local) return;
      for (const event of events) {
        const keys = (event as Y.YMapEvent<unknown>).keysChanged;
        if (event.target === this.rows) {
          for (const rowId of keys) this.rows.get(rowId)?.forEach((entry) => this.clock.receive(entry.ts));
        } else {
          const row = event.target as RowMap;
          for (const key of keys) {
            const entry = row.get(key);
            if (entry) this.clock.receive(entry.ts);
          }
        }
      }
    });
  }

  setSchema(schema: TableSchema): void {
    this.meta.set("schema", schema);
  }

  getSchema(): TableSchema | undefined {
    return this.meta.get("schema") as TableSchema | undefined;
  }

  /** 新增一行；不符合表格结构时返回错误列表，不写入 */
  addRow(rowId: string, cells: Record<string, CellValue>): ValidationError[] {
    const schema = this.getSchema();
    const errors = schema ? validateRow(schema, cells) : [];
    if (errors.length > 0) return errors;

    this.doc.transact(() => {
      const row: RowMap = new Y.Map();
      this.rows.set(rowId, row);
      this.order.push([rowId]);
      for (const [fieldId, value] of Object.entries(cells)) this.writeCell(row, fieldId, value);
    });
    return [];
  }

  /** 修改一个单元格 */
  setCell(rowId: string, fieldId: string, value: CellValue): boolean {
    const row = this.rows.get(rowId);
    if (!row) return false;
    this.doc.transact(() => this.writeCell(row, fieldId, value));
    return true;
  }

  /** 读取单元格当前生效的值（HLC 最新的一份） */
  getCell(rowId: string, fieldId: string): CellEntry | undefined {
    return this.cellEntries(rowId, fieldId)[0];
  }

  /** 被覆盖的其他设备写入，按时间从新到旧，用于冲突提示 */
  getOverwritten(rowId: string, fieldId: string): CellEntry[] {
    return this.cellEntries(rowId, fieldId).slice(1);
  }

  /** 一键恢复：把某个旧值重新写成最新值 */
  restore(rowId: string, fieldId: string, entry: CellEntry): boolean {
    return this.setCell(rowId, fieldId, entry.value);
  }

  getRows(): Row[] {
    const result: Row[] = [];
    const seen = new Set<string>();

    for (const rowId of this.order.toArray()) {
      if (seen.has(rowId)) continue;
      seen.add(rowId);

      const row = this.rows.get(rowId);
      if (!row) continue;

      const fieldIds = new Set<string>();
      for (const key of row.keys()) fieldIds.add(key.slice(0, key.indexOf(SEP)));

      const cells: Record<string, CellValue> = {};
      for (const fieldId of fieldIds) cells[fieldId] = this.getCell(rowId, fieldId)?.value ?? null;
      result.push({ id: rowId, cells });
    }
    return result;
  }

  /** 监听本地产生的增量：联网时推给 Hocuspocus，断网时存进 SQLite 待同步队列 */
  onLocalUpdate(handler: (update: Uint8Array) => void): () => void {
    const listener = (update: Uint8Array, _origin: unknown, _doc: Y.Doc, transaction: Y.Transaction) => {
      if (transaction.local) handler(update);
    };
    this.doc.on("update", listener);
    return () => this.doc.off("update", listener);
  }

  /** 应用来自服务器或其他设备的增量 */
  applyRemoteUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update, "remote");
  }

  private writeCell(row: RowMap, fieldId: string, value: CellValue): void {
    row.set(`${fieldId}${SEP}${this.nodeId}`, { value, ts: this.clock.tick() });
  }

  private cellEntries(rowId: string, fieldId: string): CellEntry[] {
    const row = this.rows.get(rowId);
    if (!row) return [];

    const prefix = fieldId + SEP;
    const entries: CellEntry[] = [];
    row.forEach((entry, key) => {
      if (key.startsWith(prefix)) entries.push(entry);
    });
    return entries.sort((a, b) => compareTimestamps(b.ts, a.ts));
  }
}
