/** Minimal in-process counters, exposed as Prometheus text format. */
const counters = new Map<string, number>();

export function incrementCounter(name: string, labels: Record<string, string> = {}, by = 1): void {
  const key = labelsKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + by);
}

function labelsKey(name: string, labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  const labelStr = entries.map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`).join(",");
  return labelStr ? `${name}{${labelStr}}` : name;
}

export function renderMetrics(): string {
  const lines: string[] = [];
  for (const [key, value] of [...counters.entries()].sort()) {
    lines.push(`${key} ${value}`);
  }
  return `${lines.join("\n")}\n`;
}

export function resetMetrics(): void {
  counters.clear();
}
