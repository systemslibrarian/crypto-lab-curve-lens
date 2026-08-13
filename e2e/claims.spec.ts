import { expect, test as base, type Page } from '@playwright/test';

/**
 * Functional claims gate.
 *
 * The a11y spec proves the page is reachable; nothing proved it was *right*.
 * This suite drives the five panels and asserts the load-bearing states the
 * README promises a visitor can see for themselves:
 *
 *  - Panel 1: the finite-field sum is internally consistent — the λ / x₃ / y₃
 *    derivation, the "P + Q = …" summary and the headline Result point all name
 *    the same point, and that point is one the page actually plotted. The
 *    vertical-line case reaches O and says why.
 *  - Panel 2: the runtime verification suite passes, its ✓/✗ glyph agrees with
 *    the announcement a screen-reader user gets, the double-and-add trace chains
 *    (each step's Before = the previous step's After) and its last accumulator
 *    equals the headline k·G. Three distinct bad scalars each reach the error
 *    card naming their own cause, and a good scalar clears it.
 *  - Panel 3: the recovered k reproduces the published challenge point, the step
 *    count equals k, and "New secret" genuinely resets and re-arms the search.
 *  - Panel 5: toy ECDH's a·B, b·A and the "both reach" verdict are the same
 *    point; the real exchange's shared secret equals both parties' own values on
 *    every curve, and regenerating produces fresh keys that still agree.
 *
 * Every assertion is checked against a value the page computed and rendered —
 * no expected ciphertexts or point coordinates are hardcoded.
 */

/** Fail any test that provoked an uncaught page exception. */
const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, `uncaught page exceptions: ${errors.join(' | ')}`).toEqual([]);
    },
    { auto: true },
  ],
});

const POINT = /\((\d+),\s*(\d+)\)/;

/** Every point the page plotted on the 𝔽₁₇ explorer grid, as "(x, y)". */
async function plottedPoints(page: Page): Promise<string[]> {
  const labels = await page
    .locator('#curve-explorer-plot .plot-point')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label') ?? ''));
  return labels.map((label) => label.replace('Point ', '').trim());
}

async function selectPointByLabel(page: Page, label: string): Promise<void> {
  await page.locator(`#curve-explorer-plot [aria-label="Point ${label}"]`).click();
}

async function openFiniteFieldView(page: Page): Promise<void> {
  await page.locator('[data-field-view="field"]').click();
  await expect(page.locator('#field-view')).toHaveClass(/is-active/);
}

/* ------------------------------------------------------------------ Panel 1 */

test('Panel 1: the finite-field sum, its derivation and its summary all name the same plotted point', async ({
  page,
}) => {
  await page.goto('.');
  await openFiniteFieldView(page);

  const points = await plottedPoints(page);
  expect(points.length).toBeGreaterThan(4);

  // The Equation card states the group order; the grid draws every finite point.
  // Group order counts the point at infinity too, so it must be exactly one more.
  const equationCard = page.locator('.result-card', { hasText: 'Equation' }).first();
  const stated = (await equationCard.innerText()).match(/Group order:\s*(\d+)/);
  expect(stated, 'the Equation card must state a group order').not.toBeNull();
  expect(Number(stated![1])).toBe(points.length + 1);

  // Pick two points with distinct x so the chord is not the vertical case.
  const byX = new Map<string, string>();
  for (const label of points) {
    const [, x] = label.match(POINT)!;
    if (!byX.has(x)) byX.set(x, label);
  }
  const [first, second] = [...byX.values()].slice(0, 2);

  await selectPointByLabel(page, first);
  await selectPointByLabel(page, second);

  const selections = page.locator('.result-card', { hasText: 'Selections' });
  const summary = await selections.innerText();
  expect(summary).toContain(`P1 = ${first}`);
  expect(summary).toContain(`P2 = ${second}`);

  // The headline Result point.
  const resultCard = page.locator('#field-view .result-card').last();
  const headline = (await resultCard.locator('.point-result').innerText()).trim();

  // The one-line summary must name the same sum as the headline.
  expect(summary).toContain(`${first} + ${second} = ${headline}`);

  // The step-by-step derivation must reproduce the headline: x₃ and y₃ are the
  // page's own arithmetic, so a headline that disagreed with them would mean the
  // shown work and the shown answer came from different computations.
  const derivation = await resultCard.innerText();
  const x3 = derivation.match(/x₃[^=]*=[^=]*=\s*(\d+)\s*\(mod\s*(\d+)\)/);
  const y3 = derivation.match(/y₃[^=]*=[^=]*=\s*(\d+)\s*\(mod/);
  expect(x3, `no x₃ line in: ${derivation}`).not.toBeNull();
  expect(y3, `no y₃ line in: ${derivation}`).not.toBeNull();
  expect(headline).toBe(`(${x3![1]}, ${y3![1]})`);

  // λ must be reduced into the field the page says it is working in.
  const prime = Number(x3![2]);
  const lambda = derivation.match(/λ[^=]*=[^=]*=\s*(\d+)\s*\(mod\s*(\d+)\)/);
  expect(lambda).not.toBeNull();
  expect(Number(lambda![1])).toBeGreaterThanOrEqual(0);
  expect(Number(lambda![1])).toBeLessThan(prime);
  expect(Number(lambda![2])).toBe(prime);

  // The sum has to be a point the page itself plotted — i.e. actually on the curve.
  expect(points).toContain(headline);
});

test('Panel 1: adding a point to its own reflection reaches O and names the vertical line as the cause', async ({
  page,
}) => {
  await page.goto('.');
  await openFiniteFieldView(page);

  const points = await plottedPoints(page);
  // Find an x with two distinct y values — P and −P.
  const byX = new Map<string, string[]>();
  for (const label of points) {
    const [, x] = label.match(POINT)!;
    byX.set(x, [...(byX.get(x) ?? []), label]);
  }
  const pair = [...byX.values()].find((group) => group.length === 2);
  expect(pair, 'the curve must have some point with a distinct reflection').toBeDefined();

  await selectPointByLabel(page, pair![0]);
  await selectPointByLabel(page, pair![1]);

  const resultCard = page.locator('#field-view .result-card').last();
  await expect(resultCard.locator('.point-result')).toHaveText('O');
  // The failure state has to say *why*, not just show O.
  await expect(resultCard).toContainText('vertical');
  await expect(resultCard).toContainText('P + Q = O (point at infinity)');

  // And the summary must not still be advertising a finite sum.
  const summary = await page.locator('.result-card', { hasText: 'Selections' }).innerText();
  expect(summary).toContain(`${pair![0]} + ${pair![1]} = O`);
});

test('Panel 1: a shared link reproduces the selection and the sum it produced', async ({
  page,
}) => {
  await page.goto('.');
  await openFiniteFieldView(page);

  const points = await plottedPoints(page);
  const byX = new Map<string, string>();
  for (const label of points) {
    const [, x] = label.match(POINT)!;
    if (!byX.has(x)) byX.set(x, label);
  }
  const [first, second] = [...byX.values()].slice(0, 2);
  await selectPointByLabel(page, first);
  await selectPointByLabel(page, second);

  const headline = (
    await page.locator('#field-view .result-card').last().locator('.point-result').innerText()
  ).trim();

  await page.locator('#share-link').click();
  await expect(page.locator('#share-link')).toHaveText(/Link copied|Copy failed/);

  const search = await page.evaluate(() => window.location.search);
  expect(search).toContain('add=');

  // Reload from the URL alone: the restored view must show the same sum.
  await page.goto(`.${search}`);
  await openFiniteFieldView(page);
  const restored = await page.locator('.result-card', { hasText: 'Selections' }).innerText();
  expect(restored).toContain(`P1 = ${first}`);
  expect(restored).toContain(`P2 = ${second}`);
  expect(restored).toContain(`${first} + ${second} = ${headline}`);
});

/* ------------------------------------------------------------------ Panel 2 */

test('Panel 2: the runtime verification suite passes and its glyph matches its announcement', async ({
  page,
}) => {
  await page.goto('.');

  const items = page.locator('.verification-item');
  const count = await items.count();
  expect(count).toBeGreaterThanOrEqual(3);

  // No item may fail, and the ✓/✗ a sighted user reads must agree with the
  // "passed"/"failed" a screen-reader user is told and with the pass/fail class.
  for (let index = 0; index < count; index += 1) {
    const item = items.nth(index);
    const className = (await item.getAttribute('class')) ?? '';
    const announced = (await item.locator('[role="status"]').getAttribute('aria-label')) ?? '';
    const glyph = (await item.innerText()).trim().charAt(0);

    expect(className, `verification item ${index} rendered as a failure`).toContain('is-pass');
    expect(className).not.toContain('is-fail');
    expect(announced, `announcement disagrees with the pass class: ${announced}`).toMatch(
      /: passed$/,
    );
    expect(glyph, `glyph disagrees with the pass class: ${glyph}`).toBe('✓');
  }
  // All three README-promised checks are present by name.
  const all = (await items.allInnerTexts()).join('\n');
  expect(all).toContain('P-256 generator and order check');
  expect(all).toContain('secp256k1 generator and order check');
  expect(all).toContain('Curve25519 RFC 7748 vector check');
});

test('Panel 2: the double-and-add trace chains and its final accumulator is the headline k·G', async ({
  page,
}) => {
  await page.goto('.');
  await page.locator('#small-scalar-input').fill('13');
  await expect(page.locator('#small-scalar-mode .result-kicker')).toHaveText('13 · G');

  const steps = await page.locator('.step-list li').evaluateAll((nodes) =>
    nodes.map((node) => {
      const text = node.textContent ?? '';
      const before = text.match(/Before:\s*(O|\(\d+,\s*\d+\))/)?.[1] ?? '';
      const after = text.match(/After:\s*(O|\(\d+,\s*\d+\))/)?.[1] ?? '';
      const kind = /Double/.test(text) ? 'double' : 'add';
      return { before, after, kind };
    }),
  );

  expect(steps.length).toBeGreaterThan(1);
  // Every step must consume the previous step's output: a trace whose parts do
  // not chain is not the computation that produced the answer beside it.
  for (let index = 1; index < steps.length; index += 1) {
    expect(steps[index].before, `step ${index + 1} does not continue step ${index}`).toBe(
      steps[index - 1].after,
    );
  }
  expect(steps[0].before).toBe('O');

  // Double-and-add on k = 13 (binary 1101) walks one double per bit plus one
  // add per set bit: the trace's shape has to be the decomposition of the
  // scalar the page is displaying, not merely a plausible list of operations.
  const doubles = steps.filter((s) => s.kind === 'double').length;
  const adds = steps.filter((s) => s.kind === 'add').length;
  const bits = (13).toString(2);
  expect(doubles + adds).toBe(steps.length);
  expect(doubles).toBe(bits.length);
  expect(adds).toBe([...bits].filter((bit) => bit === '1').length);

  const headline = (await page.locator('#small-scalar-mode .point-result').innerText()).trim();
  expect(steps[steps.length - 1].after).toBe(headline);
});

test('Panel 2: each rejected scalar reaches the error card naming its own cause, and a good one clears it', async ({
  page,
}) => {
  await page.goto('.');
  await page.locator('[data-scalar-mode="real"]').click();
  await expect(page.locator('#real-scalar-mode')).toHaveClass(/is-active/);

  const realMode = page.locator('#real-scalar-mode');
  const errorCard = realMode.locator('.result-card.is-error');

  // 1. Out-of-range scalar on a short-Weierstrass curve.
  await page.locator('#real-scalar-input').fill('0');
  await expect(errorCard).toBeVisible();
  await expect(errorCard).toContainText('Scalar must be in [1, n-1] for P-256.');
  // The rejected input must not leave a stale success verdict beside the error.
  await expect(realMode).not.toContainText('Public point (x, y)');
  await expect(realMode.locator('.result-card:not(.is-error)')).toHaveCount(0);

  // 2. A scalar at or beyond the subgroup order n is rejected the same way.
  await page
    .locator('#real-scalar-input')
    .fill('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  await expect(errorCard).toContainText('Scalar must be in [1, n-1] for P-256.');

  // 3. Curve25519 rejects a scalar that is not 32 bytes, and says so.
  await page.locator('#real-curve-select').selectOption('curve25519');
  await page.locator('#real-scalar-input').fill('abcd');
  await expect(errorCard).toContainText('Curve25519 real mode expects a 32-byte scalar in hex.');

  // 4. Non-hex characters at the right length are rejected as hex, not silently coerced.
  await page.locator('#real-scalar-input').fill('z'.repeat(64));
  await expect(errorCard).toContainText('Hex input must contain an even number of hexadecimal');

  // 5. A valid scalar clears the error entirely and produces a u-coordinate.
  await page.locator('#real-scalar-input').fill('a'.repeat(64));
  await expect(realMode.locator('.result-card.is-error')).toHaveCount(0);
  await expect(realMode).toContainText('32-byte u-coordinate');
  const value = (await realMode.locator('.code-block').first().innerText()).trim();
  expect(value).toMatch(/^[0-9a-f]{64}$/);
});

/* ------------------------------------------------------------------ Panel 3 */

test('Panel 3: the recovered scalar reproduces the published challenge point and the step count equals k', async ({
  page,
}) => {
  await page.goto('.');

  const challenge = page.locator('.result-card', { hasText: 'Public challenge' });
  const bound = (await challenge.innerText()).match(/in \[1, (\d+)\]/);
  expect(bound).not.toBeNull();
  const publishedQ = (await challenge.locator('.point-result').innerText())
    .replace('Q = k · G =', '')
    .trim();
  expect(publishedQ).toMatch(POINT);

  const status = page.locator('#ecdlp-status');
  await expect(status).toContainText('Press');

  await page.locator('#ecdlp-solve').click();
  await expect(status).toContainText('Solved', { timeout: 30_000 });

  const solved = await status.innerText();
  const k = Number(solved.match(/k = (\d+)/)![1]);
  const additions = Number(solved.match(/after (\d+) point additions/)![1]);

  // The walk stops the moment it hits Q, so the work done is exactly k additions.
  expect(additions).toBe(k);
  expect(k).toBeGreaterThanOrEqual(1);
  expect(k).toBeLessThanOrEqual(Number(bound![1]));

  // The verdict is the page re-deriving k·G and comparing it to the point it
  // published before the search ran — assert against that value, not a constant.
  const recomputed = solved.match(/\d+ · G = (\((?:\d+, \d+)\))/);
  expect(recomputed, `no recomputation line in: ${solved}`).not.toBeNull();
  expect(recomputed![1]).toBe(publishedQ);
  expect(solved).toContain('= Q ✓');
  expect(solved).not.toContain('✗');
});

test('Panel 3: "New secret" clears the solved verdict and the search re-arms against the new challenge', async ({
  page,
}) => {
  await page.goto('.');

  const status = page.locator('#ecdlp-status');
  const challenge = page.locator('.result-card', { hasText: 'Public challenge' });

  await page.locator('#ecdlp-solve').click();
  await expect(status).toContainText('Solved', { timeout: 30_000 });

  await page.locator('#ecdlp-new').click();
  // A verdict must not outlive the challenge it was computed from.
  await expect(status).not.toContainText('Solved');
  await expect(status).toContainText('Press');

  const newQ = (await challenge.locator('.point-result').innerText())
    .replace('Q = k · G =', '')
    .trim();

  // The control still works after a completed run.
  await page.locator('#ecdlp-solve').click();
  await expect(status).toContainText('Solved', { timeout: 30_000 });
  const solved = await status.innerText();
  expect(solved.match(/\d+ · G = (\((?:\d+, \d+)\))/)![1]).toBe(newQ);
  expect(solved).toContain('= Q ✓');
});

/* ------------------------------------------------------------------ Panel 5 */

test('Panel 5 (toy): a·B, b·A and the shared-dot verdict are one and the same point', async ({
  page,
}) => {
  await page.goto('.');

  const card = page.locator('.toy-ecdh .result-card', { hasText: 'secret a =' });
  const seen = new Set<string>();

  for (let round = 0; round < 5; round += 1) {
    // .result-kicker is text-transform:uppercase, so innerText is upper-cased.
    const text = await card.innerText();
    const a = Number(text.match(/secret a = (\d+)/i)![1]);
    const b = Number(text.match(/secret b = (\d+)/i)![1]);
    seen.add(`${a}:${b}`);
    const aPublic = text.match(/A = a·G = (\(\d+, \d+\))/)![1];
    const bPublic = text.match(/B = b·G = (\(\d+, \d+\))/)![1];
    const aB = text.match(/a·B = (\(\d+, \d+\))/)![1];
    const bA = text.match(/b·A = (\(\d+, \d+\))/)![1];

    expect(a, 'the two toy secrets must differ').not.toBe(b);
    expect(aPublic, 'the two public points must differ').not.toBe(bPublic);

    // The whole claim of the panel: two different orders of the same
    // multiplication land on one point, and the verdict names that point.
    expect(bA, `a·B = ${aB} but b·A = ${bA}`).toBe(aB);
    const verdict = (await card.locator('.point-result').innerText()).trim();
    expect(verdict).toBe(`✓ Both reach ${aB}`);
    expect(verdict).not.toContain('mismatch');

    // And that point is drawn on the grid as the result dot.
    const plotted = await page
      .locator('#toy-ecdh-plot .plot-point.is-result, #toy-ecdh-plot .is-result')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label') ?? ''));
    if (plotted.length > 0) {
      expect(plotted.some((label) => label.includes(aB))).toBe(true);
    }

    await page.locator('#toy-ecdh-shuffle').click();
    await expect(card).toContainText('secret a =');
  }

  // "New secrets" has to actually draw new secrets, not redraw the same pair.
  expect(seen.size, `New secrets never changed the pair: ${[...seen]}`).toBeGreaterThan(1);
});

/**
 * The value under the shared-secret heading must be the secret the cited specs define.
 *
 * This test used to assert `expectedLength = { p256: 130, secp256k1: 130, curve25519: 64 }`,
 * under a comment reading "exactly what the panel says it is showing" — it pinned the
 * 65-byte uncompressed point `04||x||y` as the shared secret on two of the three curves.
 * SP 800-56A §5.7.1.2 and RFC 5903 §9 define Z as the x-coordinate alone; RFC 7748 §6.1
 * defines X25519's output as the u-coordinate. One label meant two different things
 * depending on the selector, and the page told the reader to feed the wrong one to HKDF.
 *
 * Z is now 32 bytes on all three curves, and what is asserted is the RELATIONSHIP: Z is the
 * x-half of the shared point the page also shows, on every curve that has a y to drop.
 */
test('Panel 5 (real): the shared secret equals both parties’ own values on every curve', async ({
  page,
}) => {
  await page.goto('.');

  let curvesWithADroppedCoordinate = 0;

  for (const curve of ['p256', 'curve25519', 'secp256k1']) {
    await page.locator('#ecdh-curve-select').selectOption(curve);

    const sharedCard = page.locator('#ecdh-shared-card');
    const alice = page.locator('.actor-card', { hasText: 'Alice' });
    const bob = page.locator('.actor-card', { hasText: 'Bob' });

    const headline = (await sharedCard.locator('.code-block').first().innerText()).trim();
    const aliceValues = await alice.locator('.code-block').allInnerTexts();
    const bobValues = await bob.locator('.code-block').allInnerTexts();
    const [alicePrivate, alicePublic, aliceShared] = aliceValues.map((v) => v.trim());
    const [bobPrivate, bobPublic, bobShared] = bobValues.map((v) => v.trim());

    // The verdict is only meaningful if the two sides really did compute
    // independently, so require every input to differ before believing the match.
    expect(alicePrivate, `${curve}: both parties drew the same private scalar`).not.toBe(
      bobPrivate,
    );
    expect(alicePublic).not.toBe(bobPublic);

    expect(aliceShared, `${curve}: a·B != b·A`).toBe(bobShared);
    expect(headline, `${curve}: the headline is not the value either party computed`).toBe(
      aliceShared,
    );
    await expect(sharedCard).toContainText('✓ Yes — both parties derived the same secret');
    await expect(sharedCard).not.toHaveClass(/is-error/);

    // Z is the coordinate the specs define: 32 bytes, on every curve.
    expect(headline).toMatch(/^[0-9a-f]{64}$/);
    expect(
      headline.startsWith('04') && headline.length === 130,
      `${curve}: the encoded point is being presented as the shared secret`,
    ).toBe(false);

    if (curve !== 'curve25519') {
      expect(alicePublic.startsWith('04')).toBe(true);
      expect(alicePublic.length).toBe(130);

      // The panel also shows the full shared point. Z must be its x half — that is the
      // claim, and it cannot hold vacuously because the y half is checked to differ.
      const sharedPoint = (await page.locator('#ecdh-shared-point').innerText()).trim();
      expect(sharedPoint, `${curve}: shared point is uncompressed`).toMatch(/^04[0-9a-f]{128}$/);
      expect(sharedPoint.slice(2, 66), `${curve}: Z is not the x-coordinate`).toBe(headline);
      expect(sharedPoint.slice(66), `${curve}: y half is not real data`).not.toBe(headline);
      await expect(page.locator('#ecdh-z-note')).toContainText('x-coordinate alone');
      curvesWithADroppedCoordinate += 1;
    } else {
      await expect(page.locator('#ecdh-z-note')).toContainText('there is no y to discard');
    }

    // The KDF instruction must name Z, not "this raw value" pointing at an encoded point.
    await expect(sharedCard).toContainText('In production Z is run through a KDF');

    // Fresh keypairs really are fresh — and still agree.
    await page.locator('#ecdh-generate').click();
    await expect(sharedCard.locator('.code-block').first()).not.toHaveText(headline);
    const regenerated = (await sharedCard.locator('.code-block').first().innerText()).trim();
    const nextAlice = (await alice.locator('.code-block').nth(2).innerText()).trim();
    const nextBob = (await bob.locator('.code-block').nth(2).innerText()).trim();
    expect(nextAlice).toBe(nextBob);
    expect(regenerated).toBe(nextAlice);
    await expect(sharedCard).toContainText('✓ Yes');
  }

  // Non-vacuity: the x-half relationship is the whole point of the fix, so it must actually
  // have been exercised on the curves that encode a y at all.
  expect(
    curvesWithADroppedCoordinate,
    'no short-Weierstrass curve was checked, so the x-coordinate claim was never tested',
  ).toBe(2);

  // The private scalars are on screen on purpose; the page has to say so.
  await expect(page.locator('#ecdh-teaching-note')).toContainText('Teaching view');
  await expect(page.locator('#ecdh-teaching-note')).toContainText(
    'never displays, logs or transmits',
  );
});

/* --------------------------------------------------------------- Regression */

test('the theme chosen in the shared top bar survives the next interaction', async ({ page }) => {
  await page.goto('.');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.locator('#cl-theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'light');

  // Regression: render() used to re-apply a stale state.theme on every update,
  // so any interaction snapped the page back to dark — and since this lab's own
  // toggle is display:none'd by the shared header, the only visible theme
  // control was dead after the first click.
  await page.locator('[data-field-view="field"]').click();
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.locator('#ecdlp-solve').click();
  await expect(page.locator('#ecdlp-status')).toContainText('Solved', { timeout: 30_000 });
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.locator('#ecdh-generate').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

  // And it toggles back.
  await page.locator('#cl-theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.locator('#toy-ecdh-shuffle').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

/**
 * The `[hidden]` override trap: any author `display` on an element beats the UA
 * `[hidden] { display: none }` rule, so a panel shipping the attribute renders
 * anyway and every `el.hidden = true` is a silent no-op.
 */
test('no element carrying the hidden attribute is actually rendered', async ({ page }) => {
  await page.goto('.');
  await page.waitForTimeout(200);

  const leaks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[hidden]'))
      .filter((el) => getComputedStyle(el as HTMLElement).display !== 'none')
      .map((el) => ({
        tag: (el as HTMLElement).tagName.toLowerCase(),
        cls: (el as HTMLElement).className?.toString().slice(0, 60) ?? '',
      })),
  );
  expect(leaks, `elements marked hidden that still render: ${JSON.stringify(leaks)}`).toEqual([]);
});

/* ------------------------------------------------------- Panel 1 (reals) */

type Dot = { cx: number; cy: number };

async function realPlaneDots(page: Page): Promise<Record<string, Dot>> {
  return page.locator('#real-plane-plot circle.plot-point').evaluateAll((nodes) => {
    const out: Record<string, { cx: number; cy: number }> = {};
    for (const node of nodes) {
      const cls = node.getAttribute('class') ?? '';
      const key = cls.includes('is-third') ? 'third' : cls.includes('is-result') ? 'sum' : '';
      const cx = Number(node.getAttribute('cx'));
      const cy = Number(node.getAttribute('cy'));
      if (key) out[key] = { cx, cy };
      else out[out.p ? 'q' : 'p'] = { cx, cy };
    }
    return out;
  });
}

test('Panel 1 (reals): the chord really passes through P, Q and the third point, which reflects onto the sum', async ({
  page,
}) => {
  await page.goto('.');
  // The reals sub-view is the one the page opens on.
  await expect(page.locator('[data-field-view="reals"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#reals-view')).toHaveClass(/is-active/);
  await expect(page.locator('#real-plane-plot')).toBeVisible();

  /**
   * Measure one slider configuration. Returns the four plotted dots plus the
   * chord's endpoints, all in the SVG's own pixel space — the picture is the
   * claim here, so the picture is what gets checked.
   */
  const measure = async (): Promise<{ dots: Record<string, Dot>; chord: number[] }> => {
    const dots = await realPlaneDots(page);
    const chord = await page
      .locator('#real-plane-plot line.plot-chord')
      .evaluateAll((nodes) =>
        nodes.flatMap((n) => ['x1', 'y1', 'x2', 'y2'].map((a) => Number(n.getAttribute(a)))),
      );
    return { dots, chord };
  };

  /** Signed distance of a point from the chord line, in pixels. */
  const offChord = (chord: number[], dot: Dot): number => {
    const [x1, y1, x2, y2] = chord;
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.abs(dy * (dot.cx - x1) - dx * (dot.cy - y1)) / Math.hypot(dx, dy);
  };

  const axes: number[] = [];

  for (const [px, qx] of [
    ['-1', '2'],
    ['-1.5', '3'],
    ['0.5', '3.5'],
  ]) {
    await page.locator('#real-px').fill(px);
    await page.locator('#real-qx').fill(qx);
    await expect(page.locator('#real-plane-plot')).toContainText('P+Q');

    const { dots, chord } = await measure();
    for (const key of ['p', 'q', 'third', 'sum']) {
      expect(dots[key], `no ${key} dot drawn at P.x=${px}, Q.x=${qx}`).toBeDefined();
    }
    expect(chord).toHaveLength(4);

    // "The straight chord through P and Q always meets the curve at exactly one
    // third point" — so all three must lie on that one drawn line.
    for (const key of ['p', 'q', 'third']) {
      expect(offChord(chord, dots[key]), `${key} is not on the drawn chord`).toBeLessThan(1.5);
    }
    // P and Q are distinct points, so the chord is a real line and not a dot.
    expect(Math.abs(dots.p.cx - dots.q.cx)).toBeGreaterThan(2);

    // "Reflect that point straight down across the x-axis and you land on P+Q":
    // the reflection is vertical, so the two share an x...
    expect(Math.abs(dots.third.cx - dots.sum.cx)).toBeLessThan(0.5);
    // ...and the drawn reflection segment connects exactly those two dots.
    const reflect = await page
      .locator('#real-plane-plot line.plot-reflect')
      .evaluateAll((nodes) =>
        nodes.map((n) => ['x1', 'y1', 'x2', 'y2'].map((a) => Number(n.getAttribute(a)))),
      );
    expect(reflect).toHaveLength(1);
    expect(Math.abs(reflect[0][0] - dots.third.cx)).toBeLessThan(0.5);
    expect(Math.abs(reflect[0][1] - dots.third.cy)).toBeLessThan(0.5);
    expect(Math.abs(reflect[0][2] - dots.sum.cx)).toBeLessThan(0.5);
    expect(Math.abs(reflect[0][3] - dots.sum.cy)).toBeLessThan(0.5);
    // ...and it is a genuine reflection, not a coincidence: the two sit on
    // opposite sides of the axis.
    expect(Math.abs(dots.third.cy - dots.sum.cy)).toBeGreaterThan(2);
    axes.push((dots.third.cy + dots.sum.cy) / 2);
  }

  // The mirror line is the x-axis, which does not move when the sliders do. If
  // the "reflection" were drawn to wherever the sum happened to be, this
  // midpoint would wander with the configuration.
  for (const axis of axes) {
    expect(Math.abs(axis - axes[0]), `reflection axis moved: ${axes.join(', ')}`).toBeLessThan(1);
  }

  // The legend names the two constructed points the picture is built around.
  const legend = await page.locator('.plot-legend').first().innerText();
  expect(legend).toContain('Third intersection −(P+Q)');
  expect(legend).toContain('Sum P+Q');
});

/* ------------------------------------------------------------------ Panel 3 */

test('Panel 3: the security-scale note is consistent with itself AND with arithmetic', async ({
  page,
}) => {
  await page.goto('.');

  const note = page.locator('.muted', { hasText: "Pollard's rho" }).first();
  await expect(note).toBeVisible();
  const text = (await note.innerText()).replace(/\s+/g, ' ');

  // Superscripts survive innerText as plain digits: "2256" and "2128".
  const brute = Number(text.match(/about 2(\d+) ≈/)?.[1]);
  const rho = Number(text.match(/about √n ≈ 2(\d+) group operations/)?.[1]);
  const rated = Number(text.match(/roughly (\d+)-bit security, not (\d+)/)?.[1]);
  const notRated = Number(text.match(/roughly \d+-bit security, not (\d+)/)?.[1]);

  expect(Number.isFinite(brute), `scale note read: ${text}`).toBe(true);
  // Pollard's rho is a square-root attack, so its exponent must be half.
  expect(rho).toBe(brute / 2);
  // ...and the quoted security level is that exponent, not the field size.
  expect(rated).toBe(rho);
  expect(notRated).toBe(brute);
  expect(rated).not.toBe(notRated);

  /**
   * Self-consistency is not correctness. This note also stated a fact about the world — it
   * said 2^256 additions is "more than the number of atoms in the observable universe" —
   * and every assertion above is equally true of that false sentence, because the note was
   * only ever checked against itself.
   *
   * 2^256 = 1.16 × 10^77. The atom count is usually put near 10^80 and the published range
   * starts at 10^78, so 2^256 is smaller than the low end by an order of magnitude.
   */
  const decimalExponent = Number(text.match(/≈ 10(\d+) additions/)?.[1]);
  expect(decimalExponent, `no decimal magnitude in: ${text}`).toBe(
    Math.floor(brute * Math.log10(2)),
  );
  const atomExponent = Number(text.match(/near 10(\d+)/)?.[1]);
  expect(Number.isFinite(atomExponent), `no atom-count magnitude in: ${text}`).toBe(true);
  expect(atomExponent, 'the atom count is larger than 2^256, not smaller').toBeGreaterThan(
    decimalExponent,
  );
  expect(text, 'the note must not claim 2^256 exceeds the atom count').not.toMatch(
    /more than the number of atoms/,
  );
});

/* ------------------------------------------------------------------ Panel 4 */

test('Panel 4: every comparison card is complete and agrees with the glossary', async ({
  page,
}) => {
  await page.goto('.');

  const cards = page.locator('.comparison-card');
  const ids = await cards.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('data-mini-curve') ?? ''),
  );
  // One card per curve the rest of the page offers — the comparison must cover
  // exactly the curves you can actually select in panels 2 and 5.
  const scalarCurves = await page
    .locator('#real-curve-select option')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  const ecdhCurves = await page
    .locator('#ecdh-curve-select option')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  expect([...ids].sort()).toEqual([...scalarCurves].sort());
  expect([...ids].sort()).toEqual([...ecdhCurves].sort());
  expect(ids).toHaveLength(3);

  const cofactors: Record<string, string> = {};
  for (const id of ids) {
    const card = cards.filter({ has: page.locator(`[id="mini-${id}"]`) });
    const rows = await card.locator('dl > div').evaluateAll((nodes) =>
      nodes.map((n) => ({
        term: (n.querySelector('dt')?.textContent ?? '').trim(),
        value: (n.querySelector('dd')?.textContent ?? '').trim(),
      })),
    );
    // Every field the README promises is present AND filled in — an empty <dd>
    // renders as a blank row that reads like a missing property, not a bug.
    const terms = rows.map((r) => r.term);
    for (const required of [
      'Equation',
      'Prime / Field',
      'Subgroup order',
      'Cofactor',
      'Generator',
      'SafeCurves',
      'Primary uses',
      'Post-quantum status',
    ]) {
      expect(terms, `${id} is missing "${required}"`).toContain(required);
    }
    for (const row of rows) {
      expect(row.value.length, `${id}: "${row.term}" rendered empty`).toBeGreaterThan(0);
    }

    // Every curve here is pre-quantum; none may be advertised otherwise.
    const shor = rows.find((r) => r.term === 'Post-quantum status')?.value ?? '';
    expect(shor.toLowerCase(), `${id} post-quantum status: ${shor}`).toContain('shor');

    cofactors[id] = rows.find((r) => r.term === 'Cofactor')?.value ?? '';
    await expect(card.locator('.status-pill')).not.toBeEmpty();

    // The mini plot is drawn, and its accessible name says which curve it is
    // the analog of. (renderCurvePlot rewrites the label the markup ships, so
    // this checks the label that actually survives to the user.)
    const heading = (await card.locator('h3').innerText()).trim();
    await expect(card.locator('svg.mini-plot')).toHaveAttribute(
      'aria-label',
      new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
    );
    await expect(card.locator('svg.mini-plot circle').first()).toBeAttached();
  }

  // Cross-render: the glossary states the cofactors in prose. The cards state
  // them as data. They have to be the same numbers.
  const disclosure = page.locator('details', { hasText: 'glossary' }).first();
  await disclosure.locator('summary').click();
  await expect(disclosure).toHaveAttribute('open', '');
  const glossary = (await disclosure.innerText()).replace(/\s+/g, ' ');
  expect(glossary).toContain('h = 1 for P-256 and secp256k1; h = 8 for Curve25519');
  expect(cofactors.p256).toBe('1');
  expect(cofactors.secp256k1).toBe('1');
  expect(cofactors.curve25519).toBe('8');
});

/* --------------------------------------------------------------- Chrome */

test('exactly one skip link exists, it is the first tab stop, and its target renders', async ({
  page,
}) => {
  await page.goto('.');
  await expect(page.locator('.cl-hero-title')).toBeVisible();

  // One skip link, not the former duplicated pair (#app + #main-content).
  const skipLinks = page.locator('a', { hasText: /skip to/i });
  await expect(skipLinks).toHaveCount(1);
  await expect(skipLinks.first()).toHaveAttribute('href', '#main-content');
  await expect(page.locator('#main-content')).toHaveCount(1);

  // It must be the first tab stop so keyboard users can bypass the sticky bar.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(
    () => (document.activeElement as HTMLAnchorElement | null)?.getAttribute('href') ?? '',
  );
  expect(focused).toBe('#main-content');
});

test('related-demo cross-links open the live labs, not their source repositories', async ({
  page,
}) => {
  await page.goto('.');
  await expect(page.locator('.cl-hero-title')).toBeVisible();

  const hrefs = await page
    .locator('.badge-row a, .crosslink-note a, .related-demos a')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href') ?? ''));
  expect(hrefs.length).toBeGreaterThanOrEqual(6);
  for (const href of hrefs) {
    expect(href, `cross-link must be a live demo page: ${href}`).toMatch(
      /^https:\/\/systemslibrarian\.github\.io\//,
    );
  }

  // The source link survives, in the shared top bar only.
  await expect(
    page.locator('.cl-topbar a[href="https://github.com/systemslibrarian/crypto-lab-curve-lens"]'),
  ).toHaveCount(1);
});
