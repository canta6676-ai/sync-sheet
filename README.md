# SyncSheet

随手一拍、一说就进表：电脑、手机、网页三端同步的表格工具。

## 为什么做

平时我用电脑上的 Excel 记录和处理数据，但经常要外出，用手机看、改电脑上的表格很不方便。Google Sheets、Notion 在手机上录入也不够顺手。SyncSheet 想解决的就是"在外面也能三秒记完一条，回到电脑上马上能看到"。

## 核心功能（规划中）

- 自定义表格结构：字段支持文本、数字、日期、单选、附件
- 三种录入方式：拍照、语音、打字，统一自动填成一行
- 识别不准的字段会标出来，一键确认修改，并记住修改习惯
- 电脑、手机、网页三端实时同步，断网也能先记

## 技术方案

- 同步：Yjs（CRDT），按单元格粒度合并；同一单元格冲突用混合逻辑时钟（HLC）判定，被覆盖的旧值保留，可一键回滚
- 本地存储：SQLite + 离线待同步队列
- 前端：TypeScript 一套代码，手机端 React Native（Expo），网页端 React，桌面端 Tauri，三端共享 sync-core
- 后端：Postgres + Hocuspocus
- 拍照/语音录入：多模态模型 + JSON Schema 结构化输出

## 路线图

- [ ] packages/sync-core：Yjs + SQLite + 离线队列 + 断网冲突自动化测试
- [ ] 手机端（Expo）
- [ ] 桌面端（Tauri）
- [ ] 网页端（React）
- [ ] 拍照、语音录入

## 开发方式

使用 Devin Bot 协作开发：需求拆成 issue 分配给 Bot，由 Bot 开分支、写代码、跑 CI、提 PR，人工 review 后合并。
