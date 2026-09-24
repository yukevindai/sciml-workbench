import { test, expect } from '@playwright/test';
import path from 'node:path';

test('ordinary uploads keep declarations unknown and retain the request key after a failed response', async ({ page }) => {
  const requests: Record<string, string>[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/research-materials')) {
      requests.push(request.headers());
      return route.fulfill(requests.length === 1
        ? { status: 503, json: { error: 'Response interrupted; retry upload' } }
        : { status: 201, json: { id: 'material', project_id: 'project', filename: 'input.csv',
          media_type: 'text/csv', sha256: 'a'.repeat(64), dataset_id: 'dataset' } });
    }
    return route.fulfill({ json: request.url().endsWith('/projects')
      ? [{ id: 'project', name: 'Upload test', description: '' }] : [] });
  });
  await page.goto('/dataset-audit');
  const file = page.getByLabel('CSV file');
  await file.setInputFiles({ name: 'input.csv', mimeType: 'text/csv', buffer: Buffer.from('x,y\n1,2\n2,3\n3,4\n') });
  await expect(page.getByLabel('Citation', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Licence', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Kind of data', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Upload dataset' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Response interrupted' })).toBeVisible();
  await page.getByRole('button', { name: 'Upload dataset' }).click();
  await expect(page.getByRole('status')).toContainText('Blank declarations remain unknown');
  expect(JSON.parse(requests[0]['x-source'])).toEqual({});
  expect(requests[1]['idempotency-key']).toBe(requests[0]['idempotency-key']);
  await expect(page.getByRole('button', { name: 'Use bundled synthetic demo declarations' })).toBeDisabled();
  await file.setInputFiles(path.resolve(__dirname, '../../examples/demo.csv'));
  await page.getByRole('button', { name: 'Use bundled synthetic demo declarations' }).click();
  await expect(page.getByLabel('Kind of data', { exact: true })).toHaveValue('synthetic');
  await file.setInputFiles({ name: 'unrelated.csv', mimeType: 'text/csv', buffer: Buffer.from('z\n1\n2\n3\n') });
  await expect(page.getByLabel('Citation', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Kind of data', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Upload dataset' }).click();
  await expect(page.getByRole('status')).toContainText('Dataset uploaded');
  expect(requests[2]['idempotency-key']).not.toBe(requests[0]['idempotency-key']);
  expect(JSON.parse(requests[2]['x-source'])).toEqual({});
});
