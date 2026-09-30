/** Enveloppe à fenêtre : le document se lit à travers la fenêtre */
export default function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 22" aria-hidden="true">
      <rect x="0.75" y="0.75" width="30.5" height="20.5" rx="2.5" fill="currentColor" />
      <rect x="4" y="9" width="15" height="8" rx="1.5" fill="var(--color-paper)" />
      <path d="M6.5 11.75h8M6.5 14.25h5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M22 4.5c1.5 0 1.5-1.2 3-1.2s1.5 1.2 3 1.2M22 7c1.5 0 1.5-1.2 3-1.2s1.5 1.2 3 1.2" stroke="var(--color-paper)" strokeWidth="0.9" fill="none" opacity="0.7" />
    </svg>
  )
}
