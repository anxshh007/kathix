import { expect, test } from '@playwright/test';
import { openWith, sample } from './fixtures';

test('first screen is interactive in under 2 seconds', async ({ page, request }) => {
  const s = await sample(request);
  await openWith(page, s.projectId);
  const started = Date.now();
  await page.goto('/');
  await page
    .getByRole('button', { name: /Continue writing|Review|has \d+ open|Paste an episode/ })
    .first()
    .waitFor();
  const elapsed = Date.now() - started;
  console.log(`first screen interactive in ${elapsed} ms`);
  expect(elapsed).toBeLessThan(2000);
});

test('typing stays under 50 ms per keystroke on a 20,000-word script', async ({
  page,
  request,
}) => {
  const s = await sample(request);
  const paragraph =
    'NARRATOR: The lamp turned slowly over the harbour, and the water answered with a long grey hush that carried all the way to the quay. ';
  const words = paragraph.split(/\s+/).length;
  const scenes: string[] = [];
  for (let i = 0; scenes.join(' ').split(/\s+/).length < 20000; i++) {
    scenes.push(`SCENE ${i + 1} - THE LAMP ROOM. NIGHT.\n\n${paragraph.repeat(6)}\n`);
  }
  const text = scenes.join('\n');
  expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(20000 - words);
  const created = (await (
    await request.post('/api/m/script/scripts', {
      data: { projectId: s.projectId, title: 'Long script', text },
    })
  ).json()) as { script: { id: string } };
  await openWith(page, s.projectId);
  await page.goto(`/script?id=${created.script.id}`);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  // Warm up first (JIT, first re-render), as a creator would already be typing.
  await page.keyboard.type(' Warm.', { delay: 40 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const w = window as unknown as { __durations: number[] };
    w.__durations = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (e.name === 'keydown' || e.name === 'keypress' || e.name === 'input')
          w.__durations.push(e.duration);
    }).observe({
      type: 'event',
      buffered: false,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  });
  await page.keyboard.type(' The keeper waited at the window for the bell to ring.', { delay: 40 });
  await page.waitForTimeout(500);
  const durations = await page.evaluate(
    () => (window as unknown as { __durations: number[] }).__durations,
  );
  const worst = durations.length ? Math.max(...durations) : 0;
  console.log(`worst keystroke event duration: ${worst} ms; ${durations.length} slow events`);
  expect(worst).toBeLessThan(50);
});
