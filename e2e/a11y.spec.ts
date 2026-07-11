import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Deploys are already gated on the curve-arithmetic unit
 * tests; this gates them on accessibility the same way. Scans the full page in
 * both themes with every collapsible region revealed.
 *
 * This lab has no <details>; it uses class-toggled .mode-body panels
 * (display:none until .is-active). We reveal all of them (plus any <details>,
 * just in case) and neutralize animations/transitions before scanning so
 * nothing is measured mid-transition.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function revealAll(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Expand any native disclosure widgets.
    for (const details of document.querySelectorAll('details')) {
      (details as HTMLDetailsElement).open = true;
    }
    // Neutralize animations/transitions/opacity so nothing is scanned
    // mid-transition (settled state is what a user actually sees).
    const style = document.createElement('style');
    style.textContent =
      '*, *::before, *::after { animation: none !important; transition: none !important; }' +
      '.mode-body { display: block !important; }';
    document.head.appendChild(style);
    // Reveal all class-toggled panels so hidden content is scanned.
    for (const body of document.querySelectorAll('.mode-body')) {
      body.classList.add('is-active');
    }
    for (const panel of document.querySelectorAll('[hidden]')) {
      panel.removeAttribute('hidden');
    }
  });
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await revealAll(page);
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await revealAll(page);
  await scan(page);
});
