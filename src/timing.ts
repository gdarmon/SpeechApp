export class Timing {
  private start = performance.now();
  private times: Record<string, number> = {};
  async measure<T>(name: string, action: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await action(); }
    finally { this.times[name] = (this.times[name] || 0) + performance.now() - start; }
  }
  header() {
    return [...Object.entries(this.times), ["total", performance.now() - this.start] as const]
      .map(([key, ms]) => `${key};dur=${ms.toFixed(1)}`).join(", ");
  }
}
