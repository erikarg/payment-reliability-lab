/**
 * One transition: a state left behind, an edge, a state reached. The whole
 * product in three shapes, and it survives being 16 pixels wide.
 */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--color-raised)" />
      <circle cx="8.5" cy="16" r="3.6" fill="none" stroke="var(--color-faint)" strokeWidth="2.4" />
      <path d="M14.4 16h4.6" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M18.2 12.9 21.6 16l-3.4 3.1"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="16" r="3.2" fill="var(--color-accent)" />
    </svg>
  )
}
