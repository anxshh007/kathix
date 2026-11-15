import { expect, test, type Page } from '@playwright/test';
import { openWith, sample, type Sample } from './fixtures';

/**
 * UI truth test: crawls every route, activates every visible control (and the
 * controls inside the menus and dialogs they open) against the sample project,
 * and fails if any control has no effect, errors, or shows placeholder content.
 */

const CONTROLS =
  'button, a[href], select, input[type=checkbox], [role=tab], [role=menuitem], [role=option]';
const PLACEHOLDER = /\b(TODO|FIXME|lorem ipsum|coming soon|not yet implemented)\b/i;

interface Ctl {
  index: number;
  label: string;
  /** Already-selected tabs and the current page link announce their state instead of changing it. */
  current: boolean;
  kind: 'select' | 'checkbox' | 'click';
}

async function settle(page: Page) {
  await page.waitForFunction(
    () => !document.querySelector('main')?.textContent?.includes('Loading…'),
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(250);
}

/** Visible controls, optionally only those inside an open menu or dialog. */
async function controls(page: Page, scope: 'page' | 'overlay', shell = false): Promise<Ctl[]> {
  return page.evaluate(
    ([sel, sc, withShell]) => {
      const overlay = '[role=menu], [role=dialog], [role=alertdialog]';
      const all = [...document.querySelectorAll<HTMLElement>(sel as string)];
      return all
        .map((el, index) => ({ el, index }))
        .filter(({ el }) => {
          const r = el.getBoundingClientRect();
          const visible =
            r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
          const inEditor = el.closest('.cm-editor');
          const inOverlay = Boolean(el.closest(overlay));
          const inShell = Boolean(el.closest('nav.sidebar'));
          return (
            visible &&
            !inEditor &&
            (sc === 'overlay' ? inOverlay : !inOverlay) &&
            !el.closest('.toasts') &&
            (withShell || !inShell)
          );
        })
        .map(({ el, index }) => ({
          index,
          label: (
            el.getAttribute('aria-label') ||
            el.textContent ||
            el.getAttribute('href') ||
            el.tagName
          )
            .trim()
            .slice(0, 60),
          current:
            el.getAttribute('aria-current') === 'page' ||
            el.getAttribute('aria-selected') === 'true',
          kind:
            el.tagName === 'SELECT'
              ? 'select'
              : el instanceof HTMLInputElement && el.type === 'checkbox'
                ? 'checkbox'
                : 'click',
        }));
    },
    [CONTROLS, scope, shell] as const,
  ) as Promise<Ctl[]>;
}

/** Activates one control and reports whether anything observable happened. */
async function activate(page: Page, c: Ctl): Promise<boolean> {
  await page.evaluate(() => {
    const w = window as unknown as { __mut: number };
    w.__mut = 0;
    new MutationObserver((m) => (w.__mut += m.length)).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  const url = page.url();
  let requests = 0;
  const onRequest = () => requests++;
  page.on('request', onRequest);
  let downloaded = false;
  const onDownload = () => (downloaded = true);
  page.on('download', onDownload);
  let chooser = false;
  const onChooser = () => (chooser = true);
  page.on('filechooser', onChooser);
  const handle = page.locator(CONTROLS).nth(c.index);
  let changedValue = false;
  if (c.kind === 'select') {
    const before = await handle.inputValue();
    const options = await handle
      .locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    const next = options.find((v) => v !== before);
    if (next !== undefined) {
      await handle.selectOption(next);
      changedValue = (await handle.inputValue()) !== before;
    } else changedValue = true; // a single-option select has nothing to change
  } else if (c.kind === 'checkbox') {
    const before = await handle.isChecked();
    await handle.click({ timeout: 5000 });
    changedValue = (await handle.isChecked()) !== before;
  } else {
    await handle.click({ timeout: 5000 });
  }
  await page.waitForTimeout(400);
  page.off('request', onRequest);
  page.off('download', onDownload);
  page.off('filechooser', onChooser);
  const mutations = await page
    .evaluate(() => (window as unknown as { __mut?: number }).__mut ?? 1)
    .catch(() => 1);
  return (
    c.current ||
    changedValue ||
    downloaded ||
    chooser ||
    requests > 0 ||
    mutations > 0 ||
    page.url() !== url
  );
}

let s: Sample;
const errors: string[] = [];

test.beforeAll(async ({ request }) => {
  s = await sample(request);
});

async function crawl(
  page: Page,
  route: string,
  projectId: string | null,
  shell: boolean,
  cleanup?: () => Promise<void>,
) {
  await openWith(page, projectId);
  page.on('pageerror', (e) => errors.push(`${route}: ${e.message}`));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/EventSource|ERR_ABORTED|net::/.test(m.text()) &&
      errors.push(`${route}: ${m.text()}`),
  );
  await page.goto(route);
  await settle(page);
  const text = await page.locator('main').innerText();
  expect(text, `${route} shows placeholder content`).not.toMatch(PLACEHOLDER);
  const total = (await controls(page, 'page', shell)).length;
  expect(total, `${route} has controls`).toBeGreaterThan(0);
  const inert: string[] = [];
  for (let i = 0; i < total; i++) {
    await page.goto(route);
    await settle(page);
    const list = await controls(page, 'page', shell);
    const c = list[i];
    if (!c) break;
    const ok = await activate(page, c);
    if (!ok) inert.push(c.label);
    const overlay = await controls(page, 'overlay');
    for (let j = 0; j < overlay.length; j++) {
      await page.goto(route);
      await settle(page);
      const again = (await controls(page, 'page', shell))[i];
      if (!again) break;
      await activate(page, again);
      const inner = (await controls(page, 'overlay'))[j];
      if (!inner) continue;
      if (!(await activate(page, inner))) inert.push(`${c.label} › ${inner.label}`);
    }
    await cleanup?.();
  }
  expect(inert, `${route}: controls with no effect`).toEqual([]);
  expect(errors.filter((e) => e.startsWith(route))).toEqual([]);
}

const ROUTES: {
  route: (s: Sample) => string;
  standalone?: boolean;
  router?: boolean;
  shell?: boolean;
}[] = [
  { route: () => '/', shell: true },
  { route: () => '/', standalone: true },
  { route: () => '/canon?tab=entries' },
  { route: () => '/canon?tab=review' },
  { route: () => '/canon?tab=import' },
  { route: () => '/canon?tab=timeline' },
  { route: () => '/canon?tab=graph' },
  { route: () => '/canon?tab=promises' },
  { route: () => '/script' },
  { route: (x) => `/script?id=${x.scripts[0]?.id}` },
  { route: () => '/continuity?mode=check' },
  { route: () => '/continuity?mode=compare', standalone: true },
  { route: () => '/continuity?mode=health' },
  { route: () => '/voice?tab=match' },
  { route: () => '/voice', standalone: true },
  { route: () => '/forge?tab=generate' },
  { route: () => '/forge?tab=shortlist' },
  { route: () => '/showrunner' },
  { route: () => '/ledger' },
  { route: (x) => `/ledger?script=${x.scripts[0]?.id}` },
  { route: () => '/router?tab=tiers', router: true },
  { route: () => '/router?tab=usage', router: true },
  { route: () => '/router?tab=providers', router: true },
  { route: () => '/voice?tab=profiles' },
];

for (const r of ROUTES) {
  test(`every control works: ${r.route({ projectId: 'p', scripts: [{ id: 'id', title: '', episode: 1 }] })}${r.standalone ? ' (no project)' : ''}`, async ({
    page,
    request,
  }) => {
    const cleanup = r.router
      ? async () => {
          await request.post('/api/m/router/providers/mock/enabled', { data: { enabled: true } });
          await request
            .post('/api/m/router/local-only', { data: { on: false } })
            .catch(() => undefined);
          await request.post('/api/capabilities/refresh');
        }
      : undefined;
    await crawl(page, r.route(s), r.standalone ? null : s.projectId, Boolean(r.shell), cleanup);
  });
}

test('with no model connected, only the setup screen is shown', async ({ page }) => {
  await page.route('**/api/state', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as {
      capabilities: Record<string, { available: boolean }>;
      setupRequired: boolean;
      probing: boolean;
    };
    for (const k of Object.keys(body.capabilities))
      if (k.startsWith('model.'))
        body.capabilities[k] = { ...body.capabilities[k], available: false } as {
          available: boolean;
        };
    await route.fulfill({ json: { ...body, setupRequired: true, probing: false } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connect a writing model' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Test and connect' }).click();
  await expect(page.getByText('Fill in what this needs first.')).toBeVisible();
});

test('no Adaption control is rendered without Adaption credentials', async ({ page }) => {
  await openWith(page, s.projectId);
  for (const route of ['/router', `/script?id=${s.scripts[0]?.id}`, '/voice?tab=profiles']) {
    await page.goto(route);
    await settle(page);
    await expect(page.getByText(/Adaption voice model/)).toHaveCount(0);
  }
});
