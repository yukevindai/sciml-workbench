import {expect,test,type Page} from '@playwright/test';
import fixture from './fixtures/research-request.json';
import workflows from './fixtures/workflows.json';
const pid=fixture.project.id;
async function setup(page:Page) {
  const posts:{path:string;body:any;key:string|undefined}[]=[];
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()==='POST') {
      posts.push({path,body:req.postDataJSON(),key:req.headers()['idempotency-key']});
      if(path.endsWith('/agent-runs'))return route.fulfill({status:202,json:fixture.accepted});
      if(path.endsWith('/run'))return route.fulfill({status:503,json:{error:'Temporary service interruption'}});
    }
    const result=path==='/api/projects'?[fixture.project]:path==='/api/workflows'?workflows:
      path.endsWith('/job-index')?{items:[],next_cursor:null}:path.endsWith('/artifact-previews')?[]:
      path.endsWith('/workflow-runs')?{runs:[],scheduled_workflow_ids:[]}:
      path.endsWith('/execution-policy')?fixture.policy:path.endsWith('/research-materials')?fixture.materials:
      path.endsWith('/'+fixture.accepted.id)?{...fixture.details[fixture.accepted.id as keyof typeof fixture.details],answer:'Drag empty canvas space to pan.'}:undefined;
    return result===undefined?route.fulfill({status:404,json:{error:'Not mocked'}}):route.fulfill({json:result});
  });
  return posts;
}
test('support guides explain controls and AI support submits no research inputs',async({page})=>{
  const posts=await setup(page);
  await page.goto(`/stress-test?project=${pid}`);
  const launcher=page.getByRole('button',{name:'Open product support'});
  await launcher.click();
  await page.getByLabel('Your question',{exact:true}).fill('How do I pan and zoom the workflow canvas?');
  await page.getByText('Move around the workflow canvas',{exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Hold the mouse down on empty canvas space');
  await page.getByRole('button',{name:'Ask support agent',exact:true}).click();
  await expect(page.getByRole('region',{name:'Support answer'})).toContainText('Drag empty canvas space to pan.');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.inputs).toEqual({material_ids:[],artifact_ids:[]});
  expect(posts[0].body.agent_selection).toEqual({kind:'agent',id:'support-guide',exclusive:true});
  await page.keyboard.press('Escape');
  await expect(launcher).toBeFocused();
});
test('curated council preserves the exact scoped request and key across a lost response and reload',async({page})=>{
  const posts=await setup(page);
  await page.goto(`/stress-test?project=${pid}`);
  await page.getByRole('button',{name:/Independent council/}).click();
  await page.getByLabel('Claim and context').fill('Our results generalize to new material families.');
  await page.getByRole('checkbox',{name:fixture.materials[0].filename,exact:true}).check();
  await page.getByRole('checkbox',{name:'Review plans before the agents proceed'}).check();
  await page.getByRole('button',{name:'Start stress test',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry previous stress test'})).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].path).toBe(`/api/projects/${pid}/workflows/stress-council/run`);
  expect(posts[0].body.request.inputs.material_ids).toEqual([fixture.materials[0].id]);
  expect(posts[0].body.request.mode).toBe('review_plan');
  expect(posts[0].body.enable_schedule).toBe(false);
  await page.reload();
  await page.getByRole('button',{name:/Independent council/}).click();
  await page.getByRole('button',{name:'Retry previous stress test'}).click();
  await expect.poll(()=>posts.length).toBe(2);
  expect(posts[1]).toEqual(posts[0]);
});
test('support launcher never appears on public pages',async({page})=>{
  for(const path of ['/','/sign-in','/docs','/docs/stress-testing','/blog','/changelog']) {
    await page.goto(path);
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await expect(page.getByRole('button',{name:'Open product support'})).toHaveCount(0);
  }
});
