import type { APIRequestContext, Page } from '@playwright/test';

export interface Sample {
  projectId: string;
  scripts: { id: string; title: string; episode: number | null }[];
}

/** Loads the sample project through the same route the Studio's button uses. */
export async function sample(request: APIRequestContext): Promise<Sample> {
  const { project } = (await (await request.post('/api/m/home/sample')).json()) as {
    project: { id: string };
  };
  const { scripts } = (await (
    await request.get(`/api/m/script/scripts?projectId=${project.id}`)
  ).json()) as { scripts: Sample['scripts'] };
  return { projectId: project.id, scripts };
}

/** Opens the Studio with a project selected (or none) and focus mode off. */
export async function openWith(page: Page, projectId: string | null): Promise<void> {
  await page.addInitScript(
    ([id]) => {
      try {
        if (id) window.localStorage.setItem('kathix.project', id);
        else window.localStorage.removeItem('kathix.project');
        window.localStorage.setItem('kathix.focus', 'off');
      } catch {
        // storage unavailable: defaults apply
      }
    },
    [projectId],
  );
}
