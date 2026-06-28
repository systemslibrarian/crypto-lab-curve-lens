import {
  COMPARISON_ANALOGS,
  SMALL_FIELD_CURVE,
  addPoints,
  chordSlope,
  enumeratePoints,
  explainScalarMultiply,
  formatPoint,
  groupOrder,
  mod,
  multiplesOfPoint,
  pointOrder,
  scalarMultiply,
  solveDiscreteLog,
  type FinitePoint,
  type Point,
} from './curve';
import {
  REAL_CURVES,
  defaultScalarForCurve,
  generateEcdhDemo,
  multiplyGenerator,
  normalizeScalarLabel,
  runVerificationSuite,
  type EcdhTranscript,
  type RealCurveId,
} from './realcurve';
import { renderCurvePlot } from './visualizer';

type ScalarMode = 'small' | 'real';
type Theme = 'light' | 'dark';

interface AppState {
  theme: Theme;
  selectedPoints: FinitePoint[];
  additionResult: Point;
  scalarMode: ScalarMode;
  smallScalar: number;
  realCurve: RealCurveId;
  realScalar: string;
  ecdhCurve: RealCurveId;
  ecdhTranscript: EcdhTranscript;
  /** Transient: a point to move keyboard focus to after the next render. */
  focusPoint: Point;
  /** Discrete-log challenge: the hidden scalar and the public target Q = k·G. */
  ecdlpSecret: number;
  ecdlpTarget: Point;
  /** How many multiples of the walk are currently revealed (0 = not started). */
  ecdlpRevealed: number;
  ecdlpSolved: boolean;
}

const explorerPoints = enumeratePoints(SMALL_FIELD_CURVE);
const explorerGroupOrder = groupOrder(SMALL_FIELD_CURVE);
const explorerGenerator = SMALL_FIELD_CURVE.generator as FinitePoint;
const explorerGeneratorOrder = pointOrder(SMALL_FIELD_CURVE, explorerGenerator);
const verificationSuite = runVerificationSuite();

/** A timer handle for the animated discrete-log walk, so it can be cancelled. */
let ecdlpTimer: ReturnType<typeof setInterval> | null = null;

/**
 * The URL is only mirrored once the user interacts, so a first visit stays clean
 * (and any params from a shared link are preserved untouched until then).
 */
let urlSyncEnabled = false;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Pick a fresh secret scalar k in [1, generator order] and its public point Q = k·G. */
function freshDiscreteLogChallenge(): { secret: number; target: Point } {
  const order = explorerGeneratorOrder;
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  // Keep k in [1, order-1] so the public point Q is always a finite point on the grid.
  const secret = (buffer[0] % (order - 1)) + 1;
  return { secret, target: scalarMultiply(SMALL_FIELD_CURVE, secret, explorerGenerator) };
}

function detectTheme(): Theme {
  const stored = window.localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return 'dark';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem('theme', theme);
}

const REAL_CURVE_IDS: RealCurveId[] = ['p256', 'curve25519', 'secp256k1'];

function parsePointParam(value: string | null): FinitePoint[] {
  if (!value) {
    return [];
  }

  const parsed: FinitePoint[] = [];
  for (const pair of value.split('_').slice(0, 2)) {
    const [xs, ys] = pair.split('.');
    const x = Number(xs);
    const y = Number(ys);
    if (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      explorerPoints.some((point) => point.x === x && point.y === y)
    ) {
      parsed.push({ x, y });
    }
  }
  return parsed;
}

/** Restore deterministic view state from the query string (validated against the actual curve). */
function applyUrlState(state: AppState): void {
  const params = new URLSearchParams(window.location.search);

  const selected = parsePointParam(params.get('add'));
  if (selected.length > 0) {
    state.selectedPoints = selected;
    if (selected.length === 2) {
      state.additionResult = addPoints(SMALL_FIELD_CURVE, selected[0], selected[1]);
    }
  }

  const scalar = Number(params.get('k'));
  if (Number.isInteger(scalar) && scalar >= 1 && scalar <= 20) {
    state.smallScalar = scalar;
  }

  const mode = params.get('mode');
  if (mode === 'small' || mode === 'real') {
    state.scalarMode = mode;
  }

  const realCurve = params.get('rc');
  if (realCurve && REAL_CURVE_IDS.includes(realCurve as RealCurveId)) {
    state.realCurve = realCurve as RealCurveId;
    state.realScalar = defaultScalarForCurve(state.realCurve);
  }

  const realScalar = params.get('rs');
  if (realScalar) {
    state.realScalar = realScalar;
  }

  const ecdhCurve = params.get('ec');
  if (ecdhCurve && REAL_CURVE_IDS.includes(ecdhCurve as RealCurveId)) {
    state.ecdhCurve = ecdhCurve as RealCurveId;
    state.ecdhTranscript = generateEcdhDemo(state.ecdhCurve);
  }
}

/** Mirror the current view into the URL (without a navigation) so it can be shared. */
function syncUrl(state: AppState): void {
  const params = new URLSearchParams();
  if (state.selectedPoints.length > 0) {
    params.set('add', state.selectedPoints.map((point) => `${point.x}.${point.y}`).join('_'));
  }
  params.set('k', String(state.smallScalar));
  params.set('mode', state.scalarMode);
  params.set('rc', state.realCurve);
  params.set('rs', state.realScalar);
  params.set('ec', state.ecdhCurve);

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}

function badgeLinks(): string {
  return `
    <a class="badge-link" href="https://github.com/systemslibrarian/crypto-lab-x3dh-wire" target="_blank" rel="noreferrer">crypto-lab-x3dh-wire</a>
    <a class="badge-link" href="https://github.com/systemslibrarian/crypto-lab-ratchet-wire" target="_blank" rel="noreferrer">crypto-lab-ratchet-wire</a>
    <a class="badge-link" href="https://github.com/systemslibrarian/crypto-lab-iron-letter" target="_blank" rel="noreferrer">crypto-lab-iron-letter</a>
    <a class="badge-link" href="https://github.com/systemslibrarian/crypto-compare" target="_blank" rel="noreferrer">crypto-compare · Elliptic Curves</a>
  `;
}

function primitiveChips(): string {
  return `
    <span class="primitive-chip">P-256</span>
    <span class="primitive-chip">Curve25519</span>
    <span class="primitive-chip">secp256k1</span>
    <span class="primitive-chip">ECDH</span>
  `;
}

function comparisonCards(): string {
  return (Object.values(REAL_CURVES) as Array<(typeof REAL_CURVES)[RealCurveId]>)
    .map(
      (curve) => `
        <article class="comparison-card" data-mini-curve="${curve.id}">
          <div class="comparison-head">
            <div>
              <p class="eyebrow">${curve.standards}</p>
              <h3>${curve.label}</h3>
            </div>
            <span class="status-pill">${curve.recommendedStatus}</span>
          </div>
          <svg class="mini-plot" id="mini-${curve.id}"></svg>
          <dl>
            <div>
              <dt>Equation</dt>
              <dd>${curve.equation}</dd>
            </div>
            <div>
              <dt>Prime / Field</dt>
              <dd>${curve.prime}</dd>
            </div>
            <div>
              <dt>Subgroup order</dt>
              <dd>${curve.subgroupOrder}</dd>
            </div>
            <div>
              <dt>Cofactor</dt>
              <dd>${curve.cofactor}</dd>
            </div>
            <div>
              <dt>Generator</dt>
              <dd>${curve.generator}</dd>
            </div>
            <div>
              <dt>SafeCurves</dt>
              <dd>${curve.safeCurves}</dd>
            </div>
            <div>
              <dt>Primary uses</dt>
              <dd>${curve.useCases}</dd>
            </div>
            <div>
              <dt>Post-quantum status</dt>
              <dd>${curve.shorStatus}</dd>
            </div>
          </dl>
        </article>
      `,
    )
    .join('');
}

function verificationMarkup(): string {
  return verificationSuite
    .map(
      (result) => `
        <li class="verification-item ${result.passed ? 'is-pass' : 'is-fail'}" role="status" aria-label="${result.title}: ${result.passed ? 'passed' : 'failed'}">
          <strong>${result.passed ? '✓' : '✗'} ${result.title}</strong>
          <span>${result.detail}</span>
        </li>
      `,
    )
    .join('');
}

function selectedPointLabel(point: Point): string {
  return point === null ? 'O' : formatPoint(point);
}

/** Live, step-by-step arithmetic for adding the two currently selected points. */
function explorerArithmetic(p: FinitePoint, q: FinitePoint): string {
  const { p: prime, a } = SMALL_FIELD_CURVE;
  const slope = chordSlope(SMALL_FIELD_CURVE, p, q);

  if (slope === null) {
    return `
      <p class="muted">P and Q share an x-coordinate with y-values summing to ${prime}, so the line through them is vertical and meets the curve only at O.</p>
      <p class="code-block">P + Q = O (point at infinity)</p>
    `;
  }

  const isDouble = p.x === q.x && p.y === q.y;
  const x3 = mod(slope * slope - p.x - q.x, prime);
  const y3 = mod(slope * (p.x - x3) - p.y, prime);
  const slopeFormula = isDouble
    ? `λ = (3·${p.x}² + ${a}) · (2·${p.y})⁻¹`
    : `λ = (${q.y} − ${p.y}) · (${q.x} − ${p.x})⁻¹`;

  return `
    <p class="code-block">${slopeFormula} = ${slope} (mod ${prime})</p>
    <p class="code-block">x₃ = λ² − ${p.x} − ${q.x} = ${x3} (mod ${prime})</p>
    <p class="code-block">y₃ = λ·(${p.x} − ${x3}) − ${p.y} = ${y3} (mod ${prime})</p>
  `;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** A monospace value with a one-click copy button. */
function copyable(value: string, label: string): string {
  return `
    <div class="copy-row">
      <p class="code-block">${value}</p>
      <button class="copy-btn" type="button" data-copy="${escapeAttr(value)}" aria-label="Copy ${escapeAttr(label)}">Copy</button>
    </div>
  `;
}

function plotLegend(): string {
  return `
    <ul class="plot-legend" aria-label="Plot legend">
      <li><span class="legend-dot is-generator"></span>Generator G</li>
      <li><span class="legend-dot is-selected"></span>Selected P, Q</li>
      <li><span class="legend-dot is-third"></span>Third intersection −(P+Q)</li>
      <li><span class="legend-dot is-result"></span>Sum P+Q</li>
    </ul>
  `;
}

function ecdlpPanelMarkup(state: AppState): string {
  const maxScalar = explorerGeneratorOrder - 1;
  return `
    <div class="panel-grid split-grid explorer-grid">
      <div>
        <svg id="ecdlp-plot" class="plot"></svg>
      </div>
      <div class="stacked-cards">
        <article class="result-card">
          <p class="result-kicker">Public challenge</p>
          <p>A secret scalar <strong>k</strong> was chosen at random in [1, ${maxScalar}]. Only its public point is shown:</p>
          <p class="point-result">Q = k · G = ${selectedPointLabel(state.ecdlpTarget)}</p>
          <p class="muted">Recovering k from Q is the elliptic-curve discrete logarithm problem (ECDLP).</p>
        </article>
        <article class="result-card" id="ecdlp-status" aria-live="polite">
          <p class="result-kicker">Brute-force search</p>
          <p>${
            state.ecdlpSolved
              ? `Solved: <strong>k = ${state.ecdlpSecret}</strong> after ${state.ecdlpSecret} point additions.`
              : 'Press “Solve” to walk G, 2·G, 3·G, … until the public point appears.'
          }</p>
          <p class="muted">On P-256 the same brute force needs about 2<sup>256</sup> additions — more than the number of atoms in the observable universe.</p>
        </article>
        <div class="button-row">
          <button class="primary-button" type="button" id="ecdlp-solve">Solve by brute force</button>
          <button class="ghost-button" type="button" id="ecdlp-new">New secret</button>
        </div>
      </div>
    </div>
  `;
}

function scalarPanelMarkup(state: AppState): string {
  const smallResult = scalarMultiply(
    SMALL_FIELD_CURVE,
    state.smallScalar,
    SMALL_FIELD_CURVE.generator,
  );
  const smallSteps = explainScalarMultiply(
    SMALL_FIELD_CURVE,
    state.smallScalar,
    SMALL_FIELD_CURVE.generator,
  );
  let realResultMarkup = '';

  try {
    const result = multiplyGenerator(state.realCurve, state.realScalar);
    realResultMarkup = `
      <div class="result-card">
        <p class="result-kicker">Real curve result</p>
        ${copyable(result.resultHex, 'public point')}
        <p class="muted">Scalar: ${normalizeScalarLabel(state.realCurve, state.realScalar)}</p>
        <p class="muted">Steps shown conceptually: ${result.stepCount}. ${result.explanation}</p>
      </div>
    `;
  } catch (error) {
    realResultMarkup = `
      <div class="result-card is-error">
        <p class="result-kicker">Real curve result</p>
        <p>${(error as Error).message}</p>
      </div>
    `;
  }

  return `
    <div class="panel-grid split-grid">
      <div>
        <div class="mode-toggle">
          <button class="segment ${state.scalarMode === 'small' ? 'is-active' : ''}" data-scalar-mode="small" aria-pressed="${state.scalarMode === 'small'}">Small field</button>
          <button class="segment ${state.scalarMode === 'real' ? 'is-active' : ''}" data-scalar-mode="real" aria-pressed="${state.scalarMode === 'real'}">Real curve</button>
        </div>

        <div class="mode-body ${state.scalarMode === 'small' ? 'is-active' : ''}" id="small-scalar-mode">
          <label>
            <span>Small-field scalar k (1-20)</span>
            <input id="small-scalar-input" type="number" min="1" max="20" value="${state.smallScalar}" />
          </label>
          <div class="result-card">
            <p class="result-kicker">${state.smallScalar} · G</p>
            <p class="point-result">${selectedPointLabel(smallResult)}</p>
            <p class="muted">Generator order on the demo curve: ${explorerGeneratorOrder}. Larger scalars wrap modulo the subgroup order.</p>
          </div>
        </div>

        <div class="mode-body ${state.scalarMode === 'real' ? 'is-active' : ''}" id="real-scalar-mode">
          <label>
            <span>Curve</span>
            <select id="real-curve-select">
              ${Object.values(REAL_CURVES)
                .map(
                  (curve) =>
                    `<option value="${curve.id}" ${curve.id === state.realCurve ? 'selected' : ''}>${curve.label}</option>`,
                )
                .join('')}
            </select>
          </label>
          <label>
            <span>Scalar</span>
            <input id="real-scalar-input" value="${state.realScalar}" spellcheck="false" />
          </label>
          <p class="muted">Use decimal for P-256 and secp256k1, or 32-byte hex for Curve25519/X25519.</p>
          ${realResultMarkup}
        </div>
      </div>

      <div>
        <h3 class="subheading">Double-and-add trace</h3>
        <ol class="step-list">
          ${smallSteps
            .map(
              (step, index) => `
                <li>
                  <span class="step-index">${index + 1}</span>
                  <div>
                    <strong>${step.type === 'double' ? 'Double' : 'Add'}</strong>
                    <p>${step.description}</p>
                    <p class="muted">Before: ${selectedPointLabel(step.accumulatorBefore)} | After: ${selectedPointLabel(step.accumulatorAfter)}</p>
                  </div>
                </li>
              `,
            )
            .join('')}
        </ol>
      </div>
    </div>
  `;
}

function ecdhPanelMarkup(state: AppState): string {
  const transcript = state.ecdhTranscript;
  const keysMatch = transcript.aliceShared === transcript.bobShared;

  return `
    <div class="panel-grid split-grid">
      <div>
        <label>
          <span>User-selected curve</span>
          <select id="ecdh-curve-select">
            ${Object.values(REAL_CURVES)
              .map(
                (curve) =>
                  `<option value="${curve.id}" ${curve.id === state.ecdhCurve ? 'selected' : ''}>${curve.label}</option>`,
              )
              .join('')}
          </select>
        </label>
        <button class="primary-button" id="ecdh-generate" aria-label="Generate fresh ECDH keypairs for Alice and Bob">Generate fresh keypairs</button>
        <p class="panel-note">Alice computes a · B, Bob computes b · A, and both land on the same shared point or u-coordinate.</p>
        <div class="result-card ${keysMatch ? '' : 'is-error'}" aria-live="polite">
          <p class="result-kicker">Shared secret</p>
          ${copyable(transcript.aliceShared, 'shared secret')}
          <p class="muted">Match: ${keysMatch ? '✓ Yes — both parties derived the same secret' : '✗ No'}</p>
          <p class="muted">In production this raw value is run through a KDF (HKDF) before use as a symmetric key.</p>
        </div>
      </div>
      <div class="ecdh-columns">
        <article class="actor-card">
          <h3>Alice</h3>
          <p><strong>Private scalar</strong></p>
          ${copyable(transcript.alicePrivate, "Alice's private scalar")}
          <p><strong>Public point / u-coordinate</strong></p>
          ${copyable(transcript.alicePublic, "Alice's public point")}
          <p><strong>a · B</strong></p>
          ${copyable(transcript.aliceShared, "Alice's shared value")}
        </article>
        <article class="actor-card">
          <h3>Bob</h3>
          <p><strong>Private scalar</strong></p>
          ${copyable(transcript.bobPrivate, "Bob's private scalar")}
          <p><strong>Public point / u-coordinate</strong></p>
          ${copyable(transcript.bobPublic, "Bob's public point")}
          <p><strong>b · A</strong></p>
          ${copyable(transcript.bobShared, "Bob's shared value")}
        </article>
      </div>
    </div>
  `;
}

function buildAppMarkup(state: AppState): string {
  const selectionSummary = state.selectedPoints.length
    ? state.selectedPoints
        .map((point, index) => `P${index + 1} = ${formatPoint(point)}`)
        .join(' · ')
    : 'Click two visible points to add them.';

  const additionSummary =
    state.selectedPoints.length === 2
      ? `${formatPoint(state.selectedPoints[0])} + ${formatPoint(state.selectedPoints[1])} = ${selectedPointLabel(state.additionResult)}`
      : 'Select two points to see the sum in the elliptic-curve group.';

  return `
    <div class="app-shell">
      <header class="hero" role="banner">
        <div>
          <div class="hero-topline">
            <span class="category-chip">Elliptic Curves</span>
            <a class="github-badge" href="https://github.com/systemslibrarian/crypto-lab-curve-lens" target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <h1>Curve Lens</h1>
          <p class="subtitle">Interactive elliptic-curve math with exact finite-field arithmetic for the toy model and @noble/curves for the production curves.</p>
          <div class="primitive-row" aria-label="Primitives used">${primitiveChips()}</div>
        </div>
        <button
          id="theme-toggle"
          class="theme-toggle-btn"
          aria-label="${state.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}"
        >${state.theme === 'dark' ? '🌙' : '☀️'}</button>
      </header>

      <main id="main-content">

      <section class="why-card" aria-labelledby="why-heading">
        <div>
          <p class="eyebrow">Why this matters</p>
          <h2 id="why-heading">ECC underpins TLS, Signal, SSH, and Bitcoin</h2>
        </div>
        <p>Point addition and scalar multiplication are the core operations behind signatures, key agreement, and public-key compression. This demo keeps the toy arithmetic small enough to see while using real curve implementations for P-256, Curve25519, and secp256k1.</p>
      </section>

      <nav class="badge-row" aria-label="Related demos">
        ${badgeLinks()}
      </nav>

      <section class="panel" aria-labelledby="panel1-heading">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Panel 1</p>
            <h2 id="panel1-heading">Curve Explorer</h2>
          </div>
          <p class="panel-note">Real curves use roughly 256-bit primes. This small field shows the same group law on a grid you can inspect.</p>
        </div>
        <div class="panel-grid split-grid explorer-grid">
          <div>
            <svg id="curve-explorer-plot" class="plot"></svg>
            ${plotLegend()}
            <p class="muted plot-hint">Tip: press Tab to focus the grid, use the arrow keys to move between points, and Enter to select.</p>
          </div>
          <div class="stacked-cards">
            <article class="result-card">
              <p class="result-kicker">Equation</p>
              <p class="point-result">${SMALL_FIELD_CURVE.subtitle}</p>
              <p class="muted">Group order: ${explorerGroupOrder}. Generator G = ${selectedPointLabel(SMALL_FIELD_CURVE.generator)} has order ${explorerGeneratorOrder}.</p>
            </article>
            <article class="result-card">
              <p class="result-kicker">The group law</p>
              <p class="muted">To add P + Q, draw the line through them; it meets the curve at a third point −(P+Q). Reflect that across the horizontal mid-line (y → p−y) to get the sum. Over a finite field the line wraps modulo p, so the third point can reappear elsewhere on the grid.</p>
            </article>
            <article class="result-card">
              <p class="result-kicker">Selections</p>
              <p>${selectionSummary}</p>
              <p class="muted">${additionSummary}</p>
              <button class="ghost-button share-btn" type="button" id="share-link" aria-label="Copy a shareable link to this view">Copy shareable link</button>
            </article>
            <article class="result-card">
              <p class="result-kicker">Result</p>
              <p class="point-result" aria-live="polite">${selectedPointLabel(state.additionResult)}</p>
              ${
                state.selectedPoints.length === 2
                  ? explorerArithmetic(state.selectedPoints[0], state.selectedPoints[1])
                  : '<p class="muted">The highlighted dot is the exact sum in the finite field, not a floating-point approximation.</p>'
              }
            </article>
          </div>
        </div>
      </section>

      <section class="panel" aria-labelledby="panel2-heading">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Panel 2</p>
            <h2 id="panel2-heading">Scalar Multiplication</h2>
          </div>
          <p class="panel-note">The hard problem is reversing k · G back to k when the field size and scalar space are huge.</p>
        </div>
        ${scalarPanelMarkup(state)}
        <ul class="verification-list" aria-label="Curve parameter verification results">
          ${verificationMarkup()}
        </ul>
      </section>

      <section class="panel" aria-labelledby="panel3-heading">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Panel 3</p>
            <h2 id="panel3-heading">Break the Discrete Log</h2>
          </div>
          <p class="panel-note">Scalar multiplication is easy; reversing it is not. Here you can actually brute-force k on the toy curve — then see why that brute force is hopeless at production scale.</p>
        </div>
        ${ecdlpPanelMarkup(state)}
      </section>

      <section class="panel" aria-labelledby="panel4-heading">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Panel 4</p>
            <h2 id="panel4-heading">Curve Comparison</h2>
          </div>
          <p class="panel-note">All three are broken by Shor's algorithm on a sufficiently large fault-tolerant quantum computer. The mini-plots are small-field analogs that preserve equation family, not production-field coordinates.</p>
        </div>
        <div class="comparison-grid">
          ${comparisonCards()}
        </div>
      </section>

      <section class="panel" aria-labelledby="panel5-heading">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Panel 5</p>
            <h2 id="panel5-heading">ECDH Live Demo</h2>
          </div>
          <p class="panel-note">This shared point is the basis of X25519, ECDH P-256, and every protocol in the key-agreement category.</p>
        </div>
        ${ecdhPanelMarkup(state)}
        <p class="crosslink-note">See also <a href="https://github.com/systemslibrarian/crypto-lab-ratchet-wire" target="_blank" rel="noreferrer">crypto-lab-ratchet-wire</a> and <a href="https://github.com/systemslibrarian/crypto-lab-x3dh-wire" target="_blank" rel="noreferrer">crypto-lab-x3dh-wire</a>.</p>
      </section>

      </main>

      <footer class="footer" role="contentinfo">
        <p class="related-demos">Related demos: <a href="https://systemslibrarian.github.io/crypto-lab-key-exchange/">key-exchange</a> · <a href="https://systemslibrarian.github.io/crypto-lab-curve448/">curve448</a> · <a href="https://systemslibrarian.github.io/crypto-lab-x3dh-wire/">x3dh-wire</a> · <a href="https://systemslibrarian.github.io/crypto-lab-ratchet-wire/">ratchet-wire</a> · <a href="https://systemslibrarian.github.io/crypto-lab-hybrid-wire/">hybrid-wire</a></p>
        <p>So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31</p>
      </footer>
    </div>
  `;
}

/** Redraw only the discrete-log plot and status card (used during the animated walk). */
function updateEcdlpView(root: HTMLElement, state: AppState): void {
  const walk = multiplesOfPoint(SMALL_FIELD_CURVE, explorerGenerator, state.ecdlpRevealed);
  const active = walk.length ? walk[walk.length - 1] : null;
  const trail = walk.slice(0, -1);

  const plot = root.querySelector<SVGSVGElement>('#ecdlp-plot');
  if (plot) {
    renderCurvePlot(plot, SMALL_FIELD_CURVE, {
      points: explorerPoints,
      generator: explorerGenerator,
      selected: [],
      result: state.ecdlpTarget,
      trail,
      active,
    });
  }

  const status = root.querySelector<HTMLElement>('#ecdlp-status');
  if (status) {
    if (state.ecdlpSolved) {
      status.innerHTML = `
        <p class="result-kicker">Brute-force search</p>
        <p>Solved: <strong>k = ${state.ecdlpSecret}</strong> after ${state.ecdlpSecret} point additions.</p>
        <p class="muted">On P-256 the same brute force needs about 2<sup>256</sup> additions — more than the number of atoms in the observable universe.</p>
      `;
    } else if (state.ecdlpRevealed > 0 && active) {
      status.innerHTML = `
        <p class="result-kicker">Brute-force search</p>
        <p>Trying <strong>k = ${state.ecdlpRevealed}</strong>: ${state.ecdlpRevealed} · G = ${selectedPointLabel(active)}</p>
        <p class="muted">Walking the subgroup one addition at a time…</p>
      `;
    }
  }
}

/** Animate the brute-force discrete-log search; jumps straight to the answer if reduced motion is set. */
function startEcdlpSolve(root: HTMLElement, state: AppState): void {
  if (ecdlpTimer !== null) {
    clearInterval(ecdlpTimer);
    ecdlpTimer = null;
  }

  const { steps } = solveDiscreteLog(SMALL_FIELD_CURVE, explorerGenerator, state.ecdlpTarget);

  if (prefersReducedMotion()) {
    state.ecdlpRevealed = steps;
    state.ecdlpSolved = true;
    updateEcdlpView(root, state);
    return;
  }

  state.ecdlpRevealed = 0;
  state.ecdlpSolved = false;
  ecdlpTimer = setInterval(() => {
    state.ecdlpRevealed += 1;
    if (state.ecdlpRevealed >= steps) {
      state.ecdlpRevealed = steps;
      state.ecdlpSolved = true;
      updateEcdlpView(root, state);
      if (ecdlpTimer !== null) {
        clearInterval(ecdlpTimer);
        ecdlpTimer = null;
      }
      return;
    }
    updateEcdlpView(root, state);
  }, 280);
}

/**
 * Capture the focused form field (by id) and its caret so a full re-render does
 * not interrupt typing — render() replaces innerHTML, which would otherwise drop
 * focus and reset the cursor after every keystroke.
 */
function captureFocus(): { id: string; start: number | null; end: number | null } | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.id) {
    return null;
  }
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    let start: number | null = null;
    let end: number | null = null;
    try {
      // Some input types (e.g. number) throw when reading selection; ignore those.
      start = active.selectionStart;
      end = active.selectionEnd;
    } catch {
      start = null;
      end = null;
    }
    return { id: active.id, start, end };
  }
  return { id: active.id, start: null, end: null };
}

function restoreFocus(
  root: HTMLElement,
  saved: { id: string; start: number | null; end: number | null } | null,
): void {
  if (!saved) {
    return;
  }
  const el = root.ownerDocument.getElementById(saved.id);
  if (!el) {
    return;
  }
  el.focus();
  if (
    saved.start !== null &&
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
  ) {
    try {
      el.setSelectionRange(saved.start, saved.end);
    } catch {
      // Selection is not supported on this element type; focus alone is enough.
    }
  }
}

function render(root: HTMLElement, state: AppState): void {
  const savedFocus = captureFocus();
  root.innerHTML = buildAppMarkup(state);
  applyTheme(state.theme);

  const explorerPlot = root.querySelector<SVGSVGElement>('#curve-explorer-plot');
  if (explorerPlot) {
    renderCurvePlot(explorerPlot, SMALL_FIELD_CURVE, {
      points: explorerPoints,
      generator: SMALL_FIELD_CURVE.generator,
      selected: state.selectedPoints,
      result: state.additionResult,
      geometry: true,
      focusKey: state.focusPoint,
      onSelect: (point, viaKeyboard) => {
        if (state.selectedPoints.length === 2) {
          state.selectedPoints = [point];
          state.additionResult = null;
        } else {
          state.selectedPoints = [...state.selectedPoints, point];
          if (state.selectedPoints.length === 2) {
            state.additionResult = addPoints(
              SMALL_FIELD_CURVE,
              state.selectedPoints[0],
              state.selectedPoints[1],
            );
          }
        }

        state.focusPoint = viaKeyboard ? point : null;
        render(root, state);
      },
    });
  }

  // focusPoint is consumed once per render so unrelated re-renders don't steal focus.
  state.focusPoint = null;

  (
    Object.entries(COMPARISON_ANALOGS) as Array<[RealCurveId, (typeof COMPARISON_ANALOGS)[string]]>
  ).forEach(([curveId, curve]) => {
    const svg = root.querySelector<SVGSVGElement>(`#mini-${curveId}`);
    if (!svg) {
      return;
    }

    renderCurvePlot(svg, curve, {
      points: enumeratePoints(curve),
      generator: null,
      selected: [],
      result: null,
      compact: true,
    });
  });

  updateEcdlpView(root, state);

  root.querySelector<HTMLButtonElement>('#ecdlp-solve')?.addEventListener('click', () => {
    startEcdlpSolve(root, state);
  });

  root.querySelector<HTMLButtonElement>('#ecdlp-new')?.addEventListener('click', () => {
    if (ecdlpTimer !== null) {
      clearInterval(ecdlpTimer);
      ecdlpTimer = null;
    }
    const challenge = freshDiscreteLogChallenge();
    state.ecdlpSecret = challenge.secret;
    state.ecdlpTarget = challenge.target;
    state.ecdlpRevealed = 0;
    state.ecdlpSolved = false;
    render(root, state);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => {
      const text = button.dataset.copy ?? '';
      const restore = button.textContent;
      void navigator.clipboard?.writeText(text).then(
        () => {
          button.textContent = 'Copied ✓';
          button.classList.add('is-copied');
          window.setTimeout(() => {
            button.textContent = restore;
            button.classList.remove('is-copied');
          }, 1200);
        },
        () => {
          button.textContent = 'Copy failed';
          window.setTimeout(() => {
            button.textContent = restore;
          }, 1200);
        },
      );
    });
  });

  root.querySelector<HTMLButtonElement>('#share-link')?.addEventListener('click', (event) => {
    syncUrl(state);
    const button = event.currentTarget as HTMLButtonElement;
    const restore = button.textContent;
    void navigator.clipboard?.writeText(window.location.href).then(
      () => {
        button.textContent = 'Link copied ✓';
        button.classList.add('is-copied');
        window.setTimeout(() => {
          button.textContent = restore;
          button.classList.remove('is-copied');
        }, 1400);
      },
      () => {
        button.textContent = 'Copy failed';
        window.setTimeout(() => {
          button.textContent = restore;
        }, 1400);
      },
    );
  });

  root.querySelector<HTMLButtonElement>('#theme-toggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    render(root, state);
  });

  if (urlSyncEnabled) {
    syncUrl(state);
  }

  root.querySelectorAll<HTMLButtonElement>('[data-scalar-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset.scalarMode as ScalarMode;
      state.scalarMode = nextMode;
      render(root, state);
    });
  });

  root
    .querySelector<HTMLInputElement>('#small-scalar-input')
    ?.addEventListener('input', (event) => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      if (!Number.isNaN(value)) {
        state.smallScalar = Math.max(1, Math.min(20, Math.trunc(value)));
        render(root, state);
      }
    });

  root
    .querySelector<HTMLSelectElement>('#real-curve-select')
    ?.addEventListener('change', (event) => {
      state.realCurve = (event.currentTarget as HTMLSelectElement).value as RealCurveId;
      state.realScalar = defaultScalarForCurve(state.realCurve);
      render(root, state);
    });

  root.querySelector<HTMLInputElement>('#real-scalar-input')?.addEventListener('input', (event) => {
    state.realScalar = (event.currentTarget as HTMLInputElement).value;
    render(root, state);
  });

  root
    .querySelector<HTMLSelectElement>('#ecdh-curve-select')
    ?.addEventListener('change', (event) => {
      state.ecdhCurve = (event.currentTarget as HTMLSelectElement).value as RealCurveId;
      state.ecdhTranscript = generateEcdhDemo(state.ecdhCurve);
      render(root, state);
    });

  root.querySelector<HTMLButtonElement>('#ecdh-generate')?.addEventListener('click', () => {
    state.ecdhTranscript = generateEcdhDemo(state.ecdhCurve);
    render(root, state);
  });

  restoreFocus(root, savedFocus);
}

export function initApp(root: HTMLElement): void {
  const challenge = freshDiscreteLogChallenge();
  const initialState: AppState = {
    theme: detectTheme(),
    selectedPoints: [],
    additionResult: null,
    scalarMode: 'small',
    smallScalar: 7,
    realCurve: 'p256',
    realScalar: defaultScalarForCurve('p256'),
    ecdhCurve: 'p256',
    ecdhTranscript: generateEcdhDemo('p256'),
    focusPoint: null,
    ecdlpSecret: challenge.secret,
    ecdlpTarget: challenge.target,
    ecdlpRevealed: 0,
    ecdlpSolved: false,
  };

  applyUrlState(initialState);
  // Keep the first render from touching the URL; enable mirroring for later interactions.
  urlSyncEnabled = false;
  render(root, initialState);
  urlSyncEnabled = true;
}
