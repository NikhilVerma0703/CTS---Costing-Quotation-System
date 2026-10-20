/** Shows how a figure is produced, e.g. "Sqft/Pc = L × W ÷ 144". */
export function Formula({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-mute-bg px-1.5 py-0.5 font-mono text-[12px] text-ink-2">{children}</code>;
}
