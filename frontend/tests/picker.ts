import type { Page } from '@playwright/test';

export async function selectPicker(page: Page, label: string, value: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.locator(`.picker-option[value=${JSON.stringify(value)}]`).click();
}
