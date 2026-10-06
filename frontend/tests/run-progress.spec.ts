import { expect, test, type Page } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import fixture from './fixtures/run-controls.json';
import workflows from './fixtures/workflows.json';
import { parseRunDetail } from '../app/lib/decode';

const now = new Date('2026-10-05T15:00:00Z');
async function mockRun(page: Page, support = false, clock: 'paused' | 'fixed' = 'paused') {
  const detail = parseRunDetail(structuredClone(fixture.partial_detail));
  detail.run.created_at = '2026-10-05T14:58:55Z';
  detail.run.finished_at = null;
  detail.run.state = 'running';
  detail.run.stop_reason = null;
  detail.run.result_artifact_ids = [];
  detail.assignments[0].state = 'running';
  detail.assignments[0].agent_name = 'Methods reviewer';
  detail.assignments[0].created_at = '2026-10-05T14:59:30Z';
  detail.plan!.steps[0].status = 'running';
  let offline = false;
  if (clock === 'fixed') {
    // Keep React's lazy-view rendering timers alive while asserting exact elapsed time.
    await page.clock.setFixedTime(now);
  } else {
    await page.clock.install({time: now});
    await page.clock.pauseAt(now);
  }
  await page.addInitScript(([pid,rid,support]) => {
    if (support) sessionStorage.setItem(`support-run:${pid}`, rid);
    else localStorage.setItem(`sciml-run:${pid}`, rid);
  }, [fixture.project.id, detail.run.id, support] as const);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (offline && path.includes(`/agent-runs/${detail.run.id}`)) return route.fulfill({status:503,json:{error:'Offline'}});
    const body = path === '/api/projects' ? [fixture.project]
      : path.endsWith('/job-index') ? {items:[],next_cursor:null}
      : path.endsWith('/artifact-previews') || path.endsWith('/research-materials') ? []
      : path.endsWith('/execution-policy') ? fixture.policy
      : path.endsWith('/agent-runs') ? (support ? [] : [detail.run])
      : path.endsWith('/events') ? []
      : path.endsWith(`/agent-runs/${detail.run.id}`) ? detail : null;
    await route.fulfill(body === null ? {status:503,json:{error:'Not mocked'}} : {json:body});
  });
  return {detail, disconnect:()=>{offline=true;}};
}

async function setup(page: Page, support = false) {
  const state = await mockRun(page, support);
  await page.goto('/ask');
  if(support) await page.getByRole('button',{name:'Open product support'}).click();
  const progress = page.getByRole('region',{name:'Run progress',exact:true});
  await expect(progress).toBeVisible();
  await expect(progress.getByRole('timer',{name:'Elapsed',exact:true})).toContainText('1m 5s');
  return {...state, progress};
}

test('lab-group activity is visible with elapsed time that survives reload', async ({page}) => {
  const {progress} = await setup(page);
  await expect(progress.getByRole('list',{name:'Agent status'})).toContainText('Methods reviewer');
  await expect(progress.getByRole('list',{name:'Current steps'})).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(progress.getByRole('timer',{name:'Elapsed',exact:true})).toContainText('1m 8s');
  await page.reload();
  await expect(progress.getByRole('timer',{name:'Elapsed',exact:true})).toContainText('1m 8s');
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/live-progress-mobile.png',fullPage:true});
});

test('queued, paused and terminal runs do not pretend to be actively working', async ({page}) => {
  const {detail,progress} = await setup(page);
  for(const [state,label] of [['queued','Queued'],['paused','Paused'],['waiting_for_input','Needs your input']] as const) {
    detail.run.state=state;
    await page.reload();
    await expect(progress.getByRole('status')).toContainText(label);
    await expect(progress.locator('.spin')).toHaveCount(0);
  }
  detail.run.state='completed'; detail.run.finished_at='2026-10-05T14:59:25Z';
  await page.reload();
  await expect(progress.getByRole('timer')).toHaveText('Total elapsed 30s');
  await page.clock.fastForward(5000);
  await expect(progress.getByRole('timer')).toHaveText('Total elapsed 30s');
});

test('support has a ticking timer and explicitly reports interrupted updates', async ({page}) => {
  const {progress,disconnect} = await setup(page,true);
  await page.clock.fastForward(2000);
  await expect(progress.getByRole('timer',{name:'Elapsed',exact:true})).toContainText('1m 7s');
  disconnect();
  await page.clock.fastForward(2000);
  await expect(progress.getByRole('status')).toHaveText('Updates interrupted');
  await expect(progress.locator('.spin')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.clock.fastForward(5000);
  await page.getByRole('button',{name:'Open product support'}).click();
  await expect(progress.getByRole('timer',{name:'Elapsed',exact:true})).toContainText('1m 14s');
});

test('public preview serves real UI captures anonymously without mounting support', async ({browser,baseURL}) => {
  const context=await browser.newContext({baseURL,extraHTTPHeaders:{}});
  const page=await context.newPage();
  const calls:string[]=[];
  await page.route('**/api/**', route=>{calls.push(route.request().url());return route.abort();});
  await page.goto('/');
  for(const [tab,view] of [['Ask a question','ask'],['Design a workflow','workflows'],['Challenge an idea','stress-test']]) {
    await page.getByRole('tab',{name:tab,exact:true}).click();
    await expect(page.locator('.preview-dark img')).toHaveAttribute('src',`/images/product-${view}-dark-desktop.jpg`);
    await expect.poll(()=>page.locator('.preview-dark img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(1440);
  }
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.locator('.preview-dark img').evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain('-mobile.jpg');
  await expect(page.getByRole('button',{name:'Open product support'})).toHaveCount(0);
  expect(calls).toEqual([]);
  await context.close();
});


for (const slowChunks of [false, true]) {
  test(`council workflow shows elapsed time and recorded step counts${slowChunks ? ' with delayed JavaScript' : ''}`, async ({page}) => {
    // Start on the council page: prior Ask polling must not count as a review read.
    const {detail}=await mockRun(page, false, 'fixed');
    let reviewReads=0;
    await page.route(`**/api/projects/*/agent-runs/${detail.run.id}`,route=>{reviewReads++;return route.fulfill({json:detail});});
    const run={id:'council-example',project_id:fixture.project.id,workflow_id:'stress-council',name:'Independent council',created_at:'2026-10-05T14:58:55Z',state:'running',error:null,nodes:{
      start:{state:'completed',run_ids:[],artifact_ids:[],branch:null},
      methods:{state:'running',run_ids:[detail.run.id],artifact_ids:[],branch:null},
      statistics:{state:'pending',run_ids:[],artifact_ids:[],branch:null},
    }};
    await page.route('**/api/workflows',route=>route.fulfill({json:workflows}));
    await page.route('**/api/projects/*/workflow-runs',route=>route.fulfill({json:{runs:[run],scheduled_workflow_ids:[]}}));
    if (slowChunks) {
      // Force the lazy view through its loading state, as on a cold CI browser.
      await page.route('**/_next/static/chunks/*.js', async route => {
        await delay(350);
        await route.continue();
      });
    }
    await page.goto('/stress-test');
    const progress=page.getByRole('region',{name:'Workflow progress'});
    await expect(progress).toContainText('1 of 3 workflow steps completed · 1 running');
    await expect(progress.getByRole('timer')).toContainText('1m 5s');
    await page.clock.setFixedTime(new Date(now.getTime() + 2000));
    await expect(progress.getByRole('timer')).toContainText('1m 7s');
    expect(reviewReads).toBe(0);
    await page.locator('.stress-review summary').click();
    await expect(page.getByRole('region',{name:'Run progress',exact:true})).toBeVisible();
    expect(reviewReads).toBeGreaterThan(0);
    await page.locator('.stress-review summary').click();
    await expect(page.getByRole('region',{name:'Run progress',exact:true})).toHaveCount(0);
  });
}
