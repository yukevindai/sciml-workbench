import { expect, test } from '@playwright/test';

// Exercise the actual production UI and its local transport. Never mock a successful API.
test.use({ extraHTTPHeaders: {} });
test.beforeEach(async ({page})=>{
  await page.route('**/api/**',route=>route.abort());
});

test('anonymous visitors explore every product screen without API requests', async ({page})=>{
  const calls:string[]=[], errors:string[]=[];
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByRole('link',{name:'Try the demo',exact:true}).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole('heading',{name:'What would you like to find out?'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Example: audit/})).toBeVisible();
  for(const label of ['Projects','Workflows','Stress test','Agent market','Tools','Ask']) {
    await page.getByRole('navigation',{name:'Workbench sections'}).getByRole('link',{name:label,exact:true}).click();
    await expect(page).toHaveURL(/\/demo\//);
    await expect(page.getByRole('region',{name:'Demo workspace'})).toBeVisible();
    await expect(page.locator('.alert--error')).toHaveCount(0);
  }
  for(const label of ['Research activity','Check data','Split data','Test models','Papers & sources','Lessons learned','History','Export']) {
    if(!await page.locator('.demo-explore').getAttribute('open').then(value=>value!==null)) await page.getByText('Explore sample results & product guidance',{exact:true}).click();
    await page.getByRole('region',{name:'Demo workspace'}).getByRole('link',{name:label,exact:true}).click();
    await expect(page.locator('#main h1')).toBeVisible();
    await expect(page.locator('.alert--error')).toHaveCount(0);
  }
  await expect(page.getByRole('button',{name:'Open product support'})).toHaveCount(0);
  await page.getByRole('button',{name:'Download ZIP',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Demo download'})).toBeVisible();
  await page.getByRole('button',{name:'Keep exploring'}).click();
  expect(calls).toEqual([]);expect(errors).toEqual([]);
});

test('Ask simulates progress, review and completion without model traffic',async({page})=>{
  const calls:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url());});
  await page.goto('/demo');
  await page.getByRole('button',{name:'Check my data for problems',exact:true}).click();
  await page.getByRole('checkbox',{name:'Show me the plan first'}).check();
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Looks good, go ahead',exact:true}).click();
  await expect(page.getByRole('timer',{name:'Elapsed',exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Pause',exact:true}).first().click();
  await page.getByRole('button',{name:'Resume',exact:true}).first().click();
  await expect(page.getByRole('region',{name:'Answer'})).toContainText('Scripted demo response',{timeout:20000});
  const result=page.locator('.result-card').first();
  await expect(result).toHaveAttribute('href',/^\/demo\//);
  await result.click();
  await expect(page).toHaveURL(/\/demo\/dataset-audit/);
  expect(calls).toEqual([]);
});

test('demo agents, tools and workflows can be edited and reset locally',async({page})=>{
  const calls:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url());});
  await page.goto('/demo/agent-market');
  const card=page.locator('.market-card').filter({has:page.getByRole('heading',{name:'Principal Investigator',exact:true})});
  await card.getByRole('button',{name:'Customize a copy'}).click();
  await page.getByLabel('Name',{exact:true}).fill('Demo investigator');
  await page.getByRole('button',{name:'Save agent',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Demo investigator',exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Workbench sections'}).getByRole('link',{name:'Tools',exact:true}).click();
  await page.getByRole('button',{name:'Create tool',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Sample comparison');
  await page.getByLabel('Research instructions').fill('Compare the sample conditions.');
  await page.getByRole('checkbox',{name:/inspect project/}).check();
  await page.getByRole('button',{name:'Save tool',exact:true}).click();
  const tool=page.locator('.market-card').filter({has:page.getByRole('heading',{name:'Sample comparison',exact:true})});
  await tool.getByRole('link',{name:'Use in workflow'}).click();
  await expect(page.getByRole('region',{name:'Workflow designer'})).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('.alert--success')).toContainText('Workflow saved');
  await page.getByRole('button',{name:'All workflows',exact:true}).click();
  await page.getByRole('button',{name:'New workflow',exact:true}).click();
  await page.getByRole('button',{name:'Cancel creation',exact:true}).click();
  await expect(page.getByRole('region',{name:'Workflow designer'})).toHaveCount(0);
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Reset demo',exact:true}).click();
  await expect(page).toHaveURL(/\/demo$/);
  await page.getByRole('navigation',{name:'Workbench sections'}).getByRole('link',{name:'Agent market',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Principal Investigator',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Demo investigator',exact:true})).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('council demo has independent sample critiques and local simulated runs',async({page})=>{
  const calls:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url());});
  await page.goto('/demo/stress-test');
  await expect(page.getByLabel('Claim and context')).toHaveValue(/Example claim:/);
  await page.locator('.stress-review summary').first().click();
  await expect(page.locator('.review-answer').first()).toContainText('Scripted methods review');
  await page.getByRole('button',{name:/Independent council/}).click();
  await page.getByRole('button',{name:'Start stress test',exact:true}).click();
  await expect(page.getByRole('button',{name:'Stop test',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Stop test',exact:true})).toHaveCount(0,{timeout:20000});
  await expect(page.locator('.stress-review')).toHaveCount(6);
  expect(calls).toEqual([]);
});

test('signed-in demo stays isolated, refuses uploads, and fits mobile themes',async({browser,baseURL})=>{
  const login=`${process.env.WB_LOGIN_USERNAME}:${process.env.WB_LOGIN_PASSWORD}`;
  const context=await browser.newContext({baseURL,extraHTTPHeaders:{Authorization:`Basic ${Buffer.from(login).toString('base64')}`},reducedMotion:'reduce'});
  const page=await context.newPage(), calls:string[]=[];
  await page.addInitScript(()=>localStorage.setItem('sciml-project','real-project-untouched'));
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url());});
  await page.route('**/api/**',r=>r.abort());
  await page.goto('/demo');
  await page.locator('input[type=file]').setInputFiles({name:'private.csv',mimeType:'text/csv',buffer:Buffer.from('private,value\n1,2')});
  await page.getByLabel('What would you like to find out?',{exact:true}).fill('Audit this file');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.alert--error')).toContainText('Uploads are disabled in this demo');
  for(const width of [1440,375,812]) {
    await page.setViewportSize({width,height:width===812?375:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.goto('/demo');
  await expect(page.getByRole('heading',{name:'What would you like to find out?'})).toBeVisible();
  await page.setViewportSize({width:1440,height:1050});
  await page.screenshot({path:'test-results/demo-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:1000});
  await page.screenshot({path:'test-results/demo-mobile.png',fullPage:true});
  await page.getByRole('button',{name:/Switch to light/}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/demo-mobile-light.png',fullPage:true});
  await page.getByText('Explore sample results & product guidance',{exact:true}).click();
  await page.getByRole('button',{name:'Demo guide',exact:true}).click();
  await page.getByLabel('Search product guidance').fill('pan');
  await page.getByText('Move around the workflow canvas',{exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Hold the mouse down on empty canvas space');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Demo guide',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>localStorage.getItem('sciml-project'))).toBe('real-project-untouched');
  expect(calls).toEqual([]);
  await context.close();
});
