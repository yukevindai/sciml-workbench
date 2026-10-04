import { expect, test, type Page } from '@playwright/test';
import catalogFixture from './fixtures/agent-market.json';
import workflowsFixture from './fixtures/workflows.json';
import { selectPicker } from './picker';

async function studio(page: Page) {
  const market = structuredClone(catalogFixture) as any;
  const workflows = structuredClone(workflowsFixture) as any;
  const writes: { path: string; body: any }[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    let result: unknown;
    if (path === '/api/projects') result = [{ id:'p',name:'Battery research',description:'' }];
    else if (path.endsWith('/job-index')) result = { items:[], next_cursor:null };
    else if (path.endsWith('/artifact-previews') || path.endsWith('/research-materials')) result = [];
    else if (path.endsWith('/workflow-runs')) result = { runs:[],scheduled_workflow_ids:[] };
    else if (path === '/api/workflows' && body) { result = { ...body,id:'custom-workflow',revision:1,built_in:false,archived:false }; workflows.workflows.push(result); }
    else if (path === '/api/workflows') result = workflows;
    else if (path === '/api/agent-market') result = market;
    else if (path === '/api/agent-market/tools' && body) { result={...body,id:'custom-tool',revision:1,archived:false};market.custom_tools.push(result); }
    else if (path === '/api/agent-market/agents' && body) { result={...body,id:'custom-agent',revision:1,built_in:false,archived:false,custom_tools:[]};market.agents.push(result); }
    else return route.fulfill({ status:404,json:{error:'Unmocked route'} });
    if (body) writes.push({path,body});
    return route.fulfill({json:result});
  });
  return {market,workflows,writes};
}

test('customizing a built-in saves a copy and leaves its original unchanged', async ({page})=>{
  const {market,writes}=await studio(page);
  const original=structuredClone(market.agents[0]);
  await page.goto('/agent-market');
  const card=page.locator('.market-card').filter({has:page.getByRole('heading',{name:original.name,exact:true})});
  await card.getByRole('button',{name:'Customize a copy'}).click();
  await expect(page.getByText(`Customizing a copy of ${original.name}. The original stays available in your catalog.`)).toBeVisible();
  await page.getByLabel('Name',{exact:true}).fill('My investigator');
  await page.getByRole('button',{name:'Save agent',exact:true}).click();
  await expect(page.getByRole('heading',{name:'My investigator',exact:true})).toBeVisible();
  expect(writes[0].path).toBe('/api/agent-market/agents');
  expect(market.agents[0]).toEqual(original);
  await page.reload();
  await expect(page.getByRole('heading',{name:original.name,exact:true})).toBeVisible();
});

test('custom tool is reusable in a saved workflow and templates stay unchanged', async ({page})=>{
  const {market,workflows,writes}=await studio(page);
  const original=structuredClone(workflows.workflows[0]);
  await page.goto('/tools');
  await page.getByRole('button',{name:'Create tool',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Paper comparison');
  await page.getByLabel('Research instructions').fill('Compare conditions and cite the supporting evidence.');
  await page.getByRole('checkbox',{name:/inspect project/}).check();
  await page.getByRole('button',{name:'Save tool',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Paper comparison',exact:true})).toBeVisible();
  expect(market.custom_tools[0].capabilities).toEqual(['inspect_project']);
  await page.getByRole('link',{name:'Use in workflow'}).click();
  await expect(page.getByRole('region',{name:'Workflow designer'})).toBeVisible();
  await expect(page.getByLabel('Research tool',{exact:true})).toContainText('Paper comparison');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Workflow saved');
  expect(writes.at(-1)?.body.nodes.some((n:any)=>n.kind==='tool'&&n.tool_id==='custom-tool')).toBe(true);
  await page.getByRole('button',{name:'All workflows',exact:true}).click();
  await page.locator('.market-card').filter({has:page.getByRole('heading',{name:original.name,exact:true})}).getByRole('button',{name:'Open workflow'}).click();
  await page.getByLabel('Workflow name',{exact:true}).fill('My evidence workflow');
  await page.getByRole('button',{name:'Save a copy',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Workflow saved');
  expect(workflows.workflows[0]).toEqual(original);
});

test('graph settings and compact selectors work by keyboard and fit small screens', async ({page})=>{
  await studio(page);
  await page.goto('/workflows');
  await page.getByRole('button',{name:'New workflow',exact:true}).click();
  await page.getByRole('button',{name:'Workflow trigger',exact:true}).click();
  await page.getByRole('button',{name:'Daily Once per UTC day while enabled',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'Workflow trigger',exact:true})).toContainText('Daily');
  await page.getByRole('button',{name:'Workflow trigger',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Workflow trigger',exact:true})).toBeFocused();
  for (const width of [1440,375,812]) {
    await page.setViewportSize({width,height:width===812?375:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('html')).toHaveAttribute('data-motion','off');
  await expect(page.getByRole('button',{name:/animations|motion toggle/i})).toHaveCount(0);
  await page.screenshot({path:'test-results/research-studio-mobile.png',fullPage:true});
});

test('new workflow can be cancelled and edited drafts require discard confirmation', async ({page})=>{
  const {writes}=await studio(page);
  await page.goto('/workflows');
  await page.getByRole('button',{name:'New workflow',exact:true}).click();
  await page.getByRole('button',{name:'Cancel creation',exact:true}).click();
  await expect(page.getByRole('region',{name:'Workflow designer'})).toHaveCount(0);
  await page.getByRole('button',{name:'New workflow',exact:true}).click();
  await page.getByLabel('Workflow name',{exact:true}).fill('Keep this draft');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Cancel creation',exact:true}).click();
  await expect(page.getByLabel('Workflow name',{exact:true})).toHaveValue('Keep this draft');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Cancel creation',exact:true}).click();
  await expect(page.getByRole('region',{name:'Workflow designer'})).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('dragging empty canvas pans without editing nodes', async ({page})=>{
  await studio(page);
  await page.setViewportSize({width:1100,height:900});
  await page.goto('/workflows');
  await page.getByRole('button',{name:'New workflow',exact:true}).click();
  const canvas=page.getByLabel('Research graph canvas');
  // Raw mouse coordinates do not auto-scroll like locator actions. The canvas
  // can extend below the viewport after opening the designer.
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ratio:1});
  const box=(await canvas.boundingBox())!;
  const node=page.locator('.workflow-node').first();
  const position=await node.getAttribute('style');
  await page.mouse.move(box.x+box.width-50,box.y+box.height-60);
  await page.mouse.down();
  await expect(canvas).toHaveClass(/workflow-viewport--panning/);
  await page.mouse.move(box.x+box.width-200,box.y+box.height-120,{steps:8});
  await page.mouse.up();
  expect(await canvas.evaluate(el=>el.scrollLeft)).toBeGreaterThan(50);
  await expect(node).toHaveAttribute('style',position!);
  await expect(page.getByText(/New draft ·/)).toBeVisible();
  await canvas.focus();
  const before=await canvas.evaluate(el=>el.scrollLeft);
  await page.keyboard.press('ArrowRight');
  expect(await canvas.evaluate(el=>el.scrollLeft)).toBeGreaterThan(before);
});
