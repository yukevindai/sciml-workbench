import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', timeout: 120000, use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', trace: 'retain-on-failure', launchOptions: process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : undefined }, workers: 1 });
