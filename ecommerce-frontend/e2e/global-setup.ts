import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FullConfig } from '@playwright/test'

export default async function globalSetup(config: FullConfig) {
  const authDirectory = fileURLToPath(new URL('../playwright/.auth', import.meta.url))
  const origin = String(config.projects[0]?.use.baseURL)
  await mkdir(authDirectory, { recursive: true })

  for (const role of ['customer', 'admin'] as const) {
    const token = role === 'admin' ? 'e2e-admin-token' : 'e2e-customer-token'
    const state = {
      cookies: [],
      origins: [{
        origin,
        localStorage: [
          { name: 'access_token', value: token },
          { name: 'refresh_token', value: `e2e-${role}-refresh-token` },
        ],
      }],
    }
    await writeFile(path.join(authDirectory, `${role}.json`), JSON.stringify(state, null, 2))
  }
}
