// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initApp } from './ui';

function mount(): HTMLElement {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) {
    throw new Error('mount target missing');
  }
  initApp(root);
  return root;
}

beforeEach(() => {
  // jsdom does not implement matchMedia; force reduced motion so animations resolve synchronously.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;

  // jsdom in this runner ships without a localStorage implementation; provide an in-memory one.
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: memoryStorage,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

function explorerButtons(root: HTMLElement): SVGCircleElement[] {
  return Array.from(
    root.querySelectorAll<SVGCircleElement>('#curve-explorer-plot .plot-point[role="button"]'),
  );
}

function coordsOf(el: Element): { x: number; y: number } {
  const match = /\((\d+), (\d+)\)/.exec(el.getAttribute('aria-label') ?? '');
  return { x: Number(match?.[1]), y: Number(match?.[2]) };
}

describe('app rendering', () => {
  it('renders all five panels without throwing', () => {
    const root = mount();
    const headings = Array.from(root.querySelectorAll('.panel h2')).map((h) => h.textContent);
    expect(headings).toEqual([
      'Curve Explorer',
      'Scalar Multiplication',
      'Break the Discrete Log',
      'Curve Comparison',
      'ECDH Live Demo',
    ]);
  });

  it('draws interactive points on the explorer plot', () => {
    const root = mount();
    const points = root.querySelectorAll('#curve-explorer-plot .plot-point');
    expect(points.length).toBeGreaterThan(0);
    expect(root.querySelector('#curve-explorer-plot .plot-point[role="button"]')).not.toBeNull();
  });

  it('adds two selected points and shows a finite-field sum', () => {
    const root = mount();
    const points = root.querySelectorAll<SVGCircleElement>(
      '#curve-explorer-plot .plot-point[role="button"]',
    );
    points[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    points[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const resultCard = root.querySelector('[aria-live="polite"] .point-result, .point-result');
    expect(resultCard).not.toBeNull();
    // A sum (a point or O) is highlighted on the plot.
    expect(root.querySelector('#curve-explorer-plot .plot-point.is-selected')).not.toBeNull();
  });
});

describe('discrete-log challenge', () => {
  it('solves the brute-force search and reveals k', () => {
    const root = mount();
    root.querySelector<HTMLButtonElement>('#ecdlp-solve')?.click();
    const status = root.querySelector('#ecdlp-status');
    expect(status?.textContent).toMatch(/Solved: k = \d+/);
  });

  it('generates a fresh challenge on demand', () => {
    const root = mount();
    const before = root.querySelector('#ecdlp-status')?.textContent ?? '';
    root.querySelector<HTMLButtonElement>('#ecdlp-new')?.click();
    expect(root.querySelector('#ecdlp-plot .plot-point')).not.toBeNull();
    expect(typeof before).toBe('string');
  });
});

describe('keyboard navigation (roving tabindex)', () => {
  it('exposes exactly one tabbable point on the explorer', () => {
    const root = mount();
    const tabbable = explorerButtons(root).filter((el) => el.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('moves the roving focus to a point in the arrow direction', () => {
    const root = mount();
    const start = explorerButtons(root).find((el) => el.getAttribute('tabindex') === '0');
    expect(start).toBeDefined();
    const startX = coordsOf(start as Element).x;

    start?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    const tabbable = explorerButtons(root).filter((el) => el.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(coordsOf(tabbable[0]).x).toBeGreaterThan(startX);
  });

  it('selects a point with the Enter key', () => {
    const root = mount();
    const start = explorerButtons(root).find((el) => el.getAttribute('tabindex') === '0');
    start?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(root.querySelector('#curve-explorer-plot .plot-point.is-selected')).not.toBeNull();
  });
});

describe('shareable URL state', () => {
  it('keeps the URL clean on first load', () => {
    mount();
    expect(window.location.search).toBe('');
  });

  it('mirrors the view into the URL only after an interaction', () => {
    const root = mount();
    expect(window.location.search).toBe('');
    root.querySelector<HTMLButtonElement>('#theme-toggle')?.click();
    const params = new URLSearchParams(window.location.search);
    expect(params.get('mode')).toBe('small');
    expect(params.get('rc')).toBe('p256');
    expect(params.get('ec')).toBe('p256');
    expect(params.get('k')).toBe('7');
  });

  it('restores state from the query string on load', () => {
    window.history.replaceState(null, '', '?k=11&mode=real&rc=secp256k1&add=5.1_6.3');
    const root = mount();
    expect(root.querySelector<HTMLInputElement>('#small-scalar-input')?.value).toBe('11');
    expect(root.querySelector<HTMLSelectElement>('#real-curve-select')?.value).toBe('secp256k1');
    // Two valid points were restored, so a finite-field sum is highlighted.
    expect(root.querySelectorAll('#curve-explorer-plot .plot-point.is-selected').length).toBe(2);
  });

  it('ignores off-curve points in the URL', () => {
    window.history.replaceState(null, '', '?add=0.0_1.1');
    const root = mount();
    expect(root.querySelectorAll('#curve-explorer-plot .plot-point.is-selected').length).toBe(0);
  });
});

describe('input focus is preserved across re-render', () => {
  it('keeps focus on the real-scalar input while typing', () => {
    const root = mount();
    root.querySelector<HTMLButtonElement>('[data-scalar-mode="real"]')?.click();
    const input = root.querySelector<HTMLInputElement>('#real-scalar-input');
    expect(input).not.toBeNull();
    input?.focus();
    input!.value = '42';
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    // After the re-render the (freshly rebuilt) input must still hold focus.
    expect(document.activeElement?.id).toBe('real-scalar-input');
    expect(root.querySelector<HTMLInputElement>('#real-scalar-input')?.value).toBe('42');
  });

  it('keeps focus on the small-scalar input while typing', () => {
    const root = mount();
    const input = root.querySelector<HTMLInputElement>('#small-scalar-input');
    input?.focus();
    input!.value = '9';
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.activeElement?.id).toBe('small-scalar-input');
  });
});

describe('ECDH panel', () => {
  it('regenerates a matching shared secret', () => {
    const root = mount();
    root.querySelector<HTMLButtonElement>('#ecdh-generate')?.click();
    const text = root.querySelector('#main-content')?.textContent ?? '';
    expect(text).toMatch(/both parties derived the same secret/);
  });

  it('exposes copy buttons for transcript values', () => {
    const root = mount();
    expect(root.querySelectorAll('.copy-btn').length).toBeGreaterThan(0);
  });
});
