/**
 * 断网冲突演示：手机和电脑同时离线修改第 3 行，重连后自动合并。
 * 运行：npx tsx examples/offline-conflict.ts
 */

import * as Y from "yjs";
import { TableDoc } from "../src/table-doc";
import type { TableSchema } from "../src/schema";

const schema: TableSchema = {
  id: "expenses",
  name: "记账",
  fields: [
    { id: "date", name: "日期", type: "date", required: true },
    { id: "amount", name: "金额", type: "number" },
    { id: "note", name: "备注", type: "text" },
  ],
};

const phone = new TableDoc("phone");
const pc = new TableDoc("pc");

// 手机建表并录入第 3 行，同步给电脑
phone.setSchema(schema);
phone.addRow("row-3", { date: "2026-11-20", amount: 10, note: "午饭" });
pc.applyRemoteUpdate(Y.encodeStateAsUpdate(phone.doc));

// 两边断网，各自修改第 3 行
phone.setCell("row-3", "amount", 25); // 手机改金额
pc.setCell("row-3", "note", "午饭+咖啡"); // 电脑改备注（不同单元格）
pc.setCell("row-3", "amount", 30); // 电脑也改金额（同一单元格，后写）

// 重新联网，互相交换增量
const fromPhone = Y.encodeStateAsUpdate(phone.doc);
const fromPc = Y.encodeStateAsUpdate(pc.doc);
phone.applyRemoteUpdate(fromPc);
pc.applyRemoteUpdate(fromPhone);

console.log("手机：", phone.getRows());
console.log("电脑：", pc.getRows());
console.log("金额被覆盖的旧值：", phone.getOverwritten("row-3", "amount").map((e) => e.value));
