import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

/**
 * Both faces are served from this repository. A build-time download would be a
 * network dependency in a project whose whole claim is that it has none, and it
 * would fail on a machine that happens to be offline.
 */
const jetbrainsMono = localFont({
  src: '../fonts/jetbrains-mono.woff2',
  variable: '--font-jetbrains-mono',
  weight: '400 700',
  display: 'swap',
})

const inter = localFont({
  src: '../fonts/inter.woff2',
  variable: '--font-inter',
  weight: '400 600',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Payment Reliability Lab',
  description:
    'A simulation of how a payment system behaves when providers time out, webhooks repeat and captures go unanswered.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `lang` is corrected on the client once the stored locale is known; the
    // server has no way to know which one that is.
    <html lang="en" className={`${jetbrainsMono.variable} ${inter.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
