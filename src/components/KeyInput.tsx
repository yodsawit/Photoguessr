import { normalizeKey } from '../game/api'

/** 6-character key field: letters/digits only, shown uppercase (keys are case-insensitive). */
export function KeyInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <label className="block text-left">
      <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(normalizeKey(e.target.value))}
        autoFocus={autoFocus}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={6}
        placeholder="ABC123"
        className="mt-1 h-14 w-full rounded-2xl border border-sand bg-cream px-4 text-center font-mono text-2xl font-extrabold tracking-[0.4em] text-ink uppercase outline-none placeholder:text-sand focus:border-peach focus:ring-2 focus:ring-peach/40"
      />
    </label>
  )
}
