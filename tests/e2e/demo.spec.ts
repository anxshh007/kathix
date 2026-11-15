import { expect, test } from '@playwright/test';
import { openWith, sample } from './fixtures';

/** The scripted demo path from docs/DEMO_SCRIPT.md, end to end, in under four minutes. */
test('demo path: import, approve, write, check, voice, showrunner, ledger', async ({
  page,
  request,
}) => {
  const started = Date.now();
  const s = await sample(request);
  const ep4 = s.scripts.find((x) => x.episode === 4);
  if (!ep4) throw new Error('sample episode 4 missing');
  await openWith(page, s.projectId);

  // 0:00 Studio Home
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'The Lantern Keepers (Sample project)' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Next best action' })).toBeVisible();

  // 0:20 Import a past episode and approve a proposal with its source passage
  await page.goto('/canon?tab=import');
  await page.getByLabel('Title').fill('Episode 3 notes');
  await page
    .getByPlaceholder('Paste a script, chapter or notes')
    .fill(
      'Wren Calloway found the brass key under the salt on Hollow Quay. Wren Calloway charges sea glass for everything.',
    );
  await page.getByRole('button', { name: 'Propose canon entries' }).click();
  await expect(page).toHaveURL(/tab=review/, { timeout: 30_000 });
  const card = page.getByRole('article', { name: /Proposal: Wren Calloway/ });
  await expect(card.getByText('Source passage, exactly as written')).toBeVisible();
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Added “Wren Calloway” to the canon')).toBeVisible();

  // 0:55 Write in Script Studio: accept one suggestion, reject one with a reason
  await page.goto(`/script?id=${ep4.id}`);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await page.getByRole('button', { name: 'Tighten' }).click();
  const suggestion = page.getByRole('article', { name: 'AI suggestion' });
  await expect(suggestion.getByText('Why:')).toBeVisible();
  await suggestion.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByText('Suggestion added to the script')).toBeVisible();
  await page.keyboard.press('Control+End');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await suggestion.getByRole('button', { name: 'Reject' }).click();
  await suggestion
    .getByPlaceholder('Too formal for this character')
    .fill('Wrong mood for the ending');
  await suggestion.getByRole('button', { name: 'Reject suggestion' }).click();
  await expect(suggestion).toHaveCount(0);

  // 1:35 Continuity Guard finds a planted contradiction with both passages quoted
  await page.getByRole('button', { name: 'Check continuity' }).click();
  await page.getByRole('button', { name: 'Run continuity check' }).click();
  const issue = page.getByRole('article', { name: /Continuity issue: Brannoch Hale speaks here/ });
  await expect(issue).toBeVisible({ timeout: 30_000 });
  await expect(issue.locator('.quote.draft')).toContainText('BRANNOCH: Good lad.');
  await expect(issue.locator('.quote.ref')).toContainText('Status: drowned');

  // 2:10 Voice Mirror flags a drifting line and fixes it
  await page.goto(`/voice?tab=match&script=${ep4.id}`);
  await page.getByLabel('Voice profile').selectOption({ label: 'Field notes (Bram Okafor)' });
  await page.getByRole('button', { name: 'Score this draft' }).click();
  await expect(page.getByText('/100')).toBeVisible();
  await expect(page.locator('.drift-line.drift').first()).toBeVisible();
  await page.getByRole('button', { name: 'Suggest rewrites for drifting lines' }).click();
  await page.getByRole('button', { name: 'Accept rewrite' }).first().click();
  await expect(page.getByText('Rewrite accepted')).toBeVisible();

  // 2:35 Showrunner runs the pipeline with approval checkpoints
  await page.goto('/showrunner?new=1');
  await page.getByLabel('New episode title').fill('Episode 5');
  await page.getByRole('button', { name: 'Episode 5 outline' }).click();
  await page.getByRole('button', { name: 'Plan and start' }).click();
  for (let i = 0; i < 5; i++) {
    const approve = page.getByRole('button', { name: /^Approve: / });
    await expect(approve).toBeVisible({ timeout: 30_000 });
    await approve.click();
  }
  await expect(page.getByRole('heading', { name: 'Run complete' })).toBeVisible({
    timeout: 30_000,
  });

  // 3:05 Provenance Ledger shows the human share
  await page.goto(`/ledger?script=${ep4.id}`);
  await expect(page.getByText(/% written by you/)).toBeVisible();
  await expect(page.locator('.authored .o-ai').first()).toBeVisible();

  expect(Date.now() - started).toBeLessThan(4 * 60_000);
});
