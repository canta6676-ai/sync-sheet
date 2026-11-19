/**
 * 混合逻辑时钟（Hybrid Logical Clock，HLC）
 * 同一个单元格被多台设备修改时，用它判断谁是最后写入的。
 * 物理时间相同时，依次比较计数器和设备 ID，保证所有设备得出同一个结果。
 */

export interface Timestamp {
  wallTime: number;
  counter: number;
  nodeId: string;
}

export class HybridLogicalClock {
  private last: Timestamp;

  constructor(
    private readonly nodeId: string,
    private readonly now: () => number = Date.now,
  ) {
    this.last = { wallTime: 0, counter: 0, nodeId };
  }

  /** 本地产生一次修改时调用 */
  tick(): Timestamp {
    const physical = this.now();
    if (physical > this.last.wallTime) {
      this.last = { wallTime: physical, counter: 0, nodeId: this.nodeId };
    } else {
      this.last = { wallTime: this.last.wallTime, counter: this.last.counter + 1, nodeId: this.nodeId };
    }
    return { ...this.last };
  }

  /** 收到其他设备的修改时调用，让本地时钟不落后于对方 */
  receive(remote: Timestamp): void {
    const physical = this.now();
    const wallTime = Math.max(physical, this.last.wallTime, remote.wallTime);

    let counter = 0;
    if (wallTime === this.last.wallTime && wallTime === remote.wallTime) {
      counter = Math.max(this.last.counter, remote.counter) + 1;
    } else if (wallTime === this.last.wallTime) {
      counter = this.last.counter + 1;
    } else if (wallTime === remote.wallTime) {
      counter = remote.counter + 1;
    }

    this.last = { wallTime, counter, nodeId: this.nodeId };
  }
}

/** a 晚于 b 返回正数，早于 b 返回负数，相同返回 0 */
export function compareTimestamps(a: Timestamp, b: Timestamp): number {
  if (a.wallTime !== b.wallTime) return a.wallTime - b.wallTime;
  if (a.counter !== b.counter) return a.counter - b.counter;
  if (a.nodeId === b.nodeId) return 0;
  return a.nodeId > b.nodeId ? 1 : -1;
}
