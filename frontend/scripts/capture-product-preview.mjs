/** Capture actual production-rendered UI. Run against a local `next start` server.
 * Every API read is intercepted with synthetic fixtures; mutations fail closed.
 * npm run preview:capture (E2E_BASE_URL, local test login, optional CHROMIUM_EXECUTABLE).
 */
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/research-request.json', import.meta.url)));
const workflows = JSON.parse(await readFile(new URL('../tests/fixtures/workflows.json', import.meta.url)));
const market = JSON.parse(await readFile(new URL('../tests/fixtures/agent-market.json', import.meta.url)));
const project = {...fixture.project, name:'Battery research'};
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3100';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw Error('Capture only against a local server.');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || undefined, args:['--no-sandbox','--disable-dev-shm-usage']});
const destination = new URL('../public/images/', import.meta.url);
await mkdir(destination, {recursive:true});
try {
  for (const [size, viewport] of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:1150}]]) {
    for (const theme of ['dark','light']) {
      const login = `${process.env.WB_LOGIN_USERNAME}:${process.env.WB_LOGIN_PASSWORD}`;
      const context = await browser.newContext({baseURL, viewport, reducedMotion:'reduce', extraHTTPHeaders:{Authorization:`Basic ${Buffer.from(login).toString('base64')}`}});
      await context.addInitScript(value => localStorage.setItem('sciml-theme',value), theme);
      const page = await context.newPage();
      const failures=[];
      page.on('pageerror', error => failures.push(error.message));
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() !== 'GET') throw Error(`Unexpected mutation ${path}`);
        const result = path === '/api/projects' ? [project] : path === '/api/workflows' ? workflows : path === '/api/agent-market' ? market
          : path.endsWith('/agent-selection') ? {project_id:project.id,selection:{kind:'automatic',id:null,exclusive:true}}
          : path.endsWith('/job-index') ? {items:[],next_cursor:null}
          : path.endsWith('/workflow-runs') ? {runs:[],scheduled_workflow_ids:[]}
          : path.endsWith('/execution-policy') ? fixture.policy
          : path.endsWith('/artifact-previews') || path.endsWith('/research-materials') || path.endsWith('/agent-runs') ? [] : undefined;
        if (result === undefined) { failures.push(`Unmocked API ${path}`); return route.fulfill({status:404,json:{error:'Not part of the example'}}); }
        return route.fulfill({json:result});
      });
      for (const view of ['ask','workflows','stress-test']) {
        await page.goto(`/${view}`);
        await page.getByRole('button',{name:'Active project',exact:true}).filter({hasText:project.name}).waitFor();
        if(view==='ask') {
          await page.getByRole('heading',{name:'What would you like to find out?'}).waitFor();
          await page.waitForFunction(() => !document.querySelector('.agent-selector button[disabled]'));
        }
        if(view==='workflows') {
          await page.getByRole('button',{name:'Open workflow',exact:true}).first().click();
          await page.getByRole('region',{name:'Workflow designer'}).waitFor();
          await page.getByRole('button',{name:'Fit',exact:true}).click();
          await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
        }
        if(view==='stress-test') await page.getByRole('button',{name:/Independent council/}).click();
        // Support exists only inside the product; do not put even its launcher in public previews.
        await page.addStyleTag({content:'.support-launcher { visibility:hidden !important; }'});
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({path:new URL(`product-${view}-${theme}-${size}.jpg`,destination).pathname,type:'jpeg',quality:88,animations:'disabled'});
      }
      if (failures.length) throw Error(failures.join('\n'));
      await context.close();
    }
  }
} finally { await browser.close(); }
console.log('Captured 12 real workspace previews with synthetic data.');
