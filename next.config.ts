import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // This project sits inside a directory tree that has other lockfiles above it.
  // Pinning the root stops the bundler from inferring the wrong one.
  turbopack: { root: __dirname },
  // The README is the documentation for this project; generated agent files
  // would only drift away from it.
  agentRules: false,
}

export default nextConfig
