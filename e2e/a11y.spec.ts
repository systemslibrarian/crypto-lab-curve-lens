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
    const style = document.createElement('style');
    style.textContent =
      '.mode-body { display: block !important; }' +
      // Panel 1 has two class-toggled sub-views (Reals ℝ / Finite field 𝔽ₚ);
      // reveal both so both are scanned.
      '.field-view { display: block !important; }';
    document.head.appendChild(style);
    // Reveal all class-toggled panels so hidden content is scanned.
    for (const body of document.querySelectorAll('.mode-body, .field-view')) {
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

async function assertGradientContrast(page: Page, selector: string, bgColors: string[]): Promise<void> {
  const ratio = await page.evaluate(({ sel, bgColors }) => {
    function getLuminance(r: number, g: number, b: number) {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }
    function parseRGB(c: string) {
      const match = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.fillStyle = c;
      const computed = ctx.fillStyle;
      if (computed.startsWith('#')) {
        const r = parseInt(computed.slice(1, 3), 16);
        const g = parseInt(computed.slice(3, 5), 16);
        const b = parseInt(computed.slice(5, 7), 16);
        return [r, g, b];
      }
      return [0, 0, 0];
    }
    function blend(fg: number[], bg: number[], alpha: number) {
      return [
        Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
        Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
        Math.round(fg[2] * alpha + bg[2] * (1 - alpha))
      ];
    }
    function parseColorWithAlpha(c: string, bgHex: string) {
      const match = c.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (match) {
        const fg = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        const alpha = parseFloat(match[4]);
        const bg = parseRGB(bgHex);
        return blend(fg, bg, alpha);
      }
      return parseRGB(c);
    }
    function getContrastRatio(c1: string, c2: string, bgHex: string) {
      const [r1, g1, b1] = parseColorWithAlpha(c1, bgHex);
      const [r2, g2, b2] = parseColorWithAlpha(c2, bgHex);
      const l1 = getLuminance(r1, g1, b1);
      const l2 = getLuminance(r2, g2, b2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }
    
    const el = document.querySelector(sel);
    if (!el) return 99;
    const style = window.getComputedStyle(el);
    const color = style.color;
    
    let minRatio = 99;
    // bgColors[0] is the base page bg
    for (let i = 1; i < bgColors.length; i++) {
      const r = getContrastRatio(color, bgColors[i], bgColors[0]);
      if (r < minRatio) minRatio = r;
    }
    return minRatio;
  }, { sel: selector, bgColors });

  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  await expect(page.locator('.cl-hero-title')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await revealAll(page);
  await scan(page);
  // --bg: #11171c, Hero gradient stops #161c24 and #11171c plus radial accents
  await assertGradientContrast(page, '.cl-hero-desc', ['#11171c', 'rgba(255, 140, 87, 0.22)', 'rgba(92, 209, 240, 0.18)', 'rgba(22, 28, 36, 0.98)', 'rgba(17, 23, 28, 0.84)']);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  await expect(page.locator('.cl-hero-title')).toBeVisible();
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.waitForLoadState('networkidle');
  await revealAll(page);
  await scan(page);
  // --bg: #f6f1e7, Hero gradient stops #fff8ee and #f6f1e7 plus radial accents
  await assertGradientContrast(page, '.cl-hero-desc', ['#f6f1e7', 'rgba(190, 90, 42, 0.28)', 'rgba(28, 75, 100, 0.22)', 'rgba(255, 248, 238, 0.95)', 'rgba(246, 241, 231, 0.72)']);
});
