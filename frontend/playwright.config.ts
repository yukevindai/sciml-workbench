import { defineConfig } from '@playwright/test';

// The login gate never challenges (so browsers show no pop-up), which means
// httpCredentials would never be sent. Send the same login up front instead.
const login = process.env.WB_LOGIN_USERNAME && process.env.WB_LOGIN_PASSWORD ? `${process.env.WB_LOGIN_USERNAME}:${process.env.WB_LOGIN_PASSWORD}` : '';

export default defineConfig({ testDir: './tests', timeout: 120000, use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', trace: 'retain-on-failure', extraHTTPHeaders: login ? { Authorization: `Basic ${Buffer.from(login).toString('base64')}` } : undefined, launchOptions: process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : undefined }, workers: 1 });
