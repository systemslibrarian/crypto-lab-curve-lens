import {
  COMPARISON_ANALOGS,
  SMALL_FIELD_CURVE,
  addPoints,
  enumeratePoints,
  explainScalarMultiply,
  formatPoint,
  groupOrder,
  pointOrder,
  pointsEqual,
  scalarMultiply,
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
}

const explorerPoints = enumeratePoints(SMALL_FIELD_CURVE);
const explorerGroupOrder = groupOrder(SMALL_FIELD_CURVE);
const explorerGeneratorOrder = pointOrder(SMALL_FIELD_CURVE, SMALL_FIELD_CURVE.generator);
const verificationSuite = runVerificationSuite();

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

function scalarPanelMarkup(state: AppState): string {
  const smallResult = scalarMultiply(SMALL_FIELD_CURVE, state.smallScalar, SMALL_FIELD_CURVE.generator);
  const smallSteps = explainScalarMultiply(SMALL_FIELD_CURVE, state.smallScalar, SMALL_FIELD_CURVE.generator);
  let realResultMarkup = '';

  try {
    const result = multiplyGenerator(state.realCurve, state.realScalar);
    realResultMarkup = `
      <div class="result-card">
        <p class="result-kicker">Real curve result</p>
        <p class="code-block">${result.resultHex}</p>
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
        <div class="result-card ${keysMatch ? '' : 'is-error'}">
          <p class="result-kicker">Shared secret</p>
          <p class="code-block" aria-live="polite">${transcript.aliceShared}</p>
          <p class="muted">Match: ${keysMatch ? 'Yes' : 'No'}</p>
        </div>
      </div>
      <div class="ecdh-columns">
        <article class="actor-card">
          <h3>Alice</h3>
          <p><strong>Private scalar</strong></p>
          <p class="code-block">${transcript.alicePrivate}</p>
          <p><strong>Public point / u-coordinate</strong></p>
          <p class="code-block">${transcript.alicePublic}</p>
          <p><strong>a · B</strong></p>
          <p class="code-block">${transcript.aliceShared}</p>
        </article>
        <article class="actor-card">
          <h3>Bob</h3>
          <p><strong>Private scalar</strong></p>
          <p class="code-block">${transcript.bobPrivate}</p>
          <p><strong>Public point / u-coordinate</strong></p>
          <p class="code-block">${transcript.bobPublic}</p>
          <p><strong>b · A</strong></p>
          <p class="code-block">${transcript.bobShared}</p>
        </article>
      </div>
    </div>
  `;
}

function buildAppMarkup(state: AppState): string {
  const selectionSummary = state.selectedPoints.length
    ? state.selectedPoints.map((point, index) => `P${index + 1} = ${formatPoint(point)}`).join(' · ')
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
          </div>
          <div class="stacked-cards">
            <article class="result-card">
              <p class="result-kicker">Equation</p>
              <p class="point-result">${SMALL_FIELD_CURVE.subtitle}</p>
              <p class="muted">Group order: ${explorerGroupOrder}. Generator G = ${selectedPointLabel(SMALL_FIELD_CURVE.generator)} has order ${explorerGeneratorOrder}.</p>
            </article>
            <article class="result-card">
              <p class="result-kicker">Selections</p>
              <p>${selectionSummary}</p>
              <p class="muted">${additionSummary}</p>
            </article>
            <article class="result-card">
              <p class="result-kicker">Result</p>
              <p class="point-result" aria-live="polite">${selectedPointLabel(state.additionResult)}</p>
              <p class="muted">The highlighted dot is the exact sum in the finite field, not a floating-point approximation.</p>
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
            <h2 id="panel3-heading">Curve Comparison</h2>
          </div>
          <p class="panel-note">All three are broken by Shor's algorithm on a sufficiently large fault-tolerant quantum computer. The mini-plots are small-field analogs that preserve equation family, not production-field coordinates.</p>
        </div>
        <div class="comparison-grid">
          ${comparisonCards()}
        </div>
      </section>

      <section class="panel" aria-labelledby="panel4-heading">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Panel 4</p>
            <h2 id="panel4-heading">ECDH Live Demo</h2>
          </div>
          <p class="panel-note">This shared point is the basis of X25519, ECDH P-256, and every protocol in the key-agreement category.</p>
        </div>
        ${ecdhPanelMarkup(state)}
        <p class="crosslink-note">See also <a href="https://github.com/systemslibrarian/crypto-lab-ratchet-wire" target="_blank" rel="noreferrer">crypto-lab-ratchet-wire</a> and <a href="https://github.com/systemslibrarian/crypto-lab-x3dh-wire" target="_blank" rel="noreferrer">crypto-lab-x3dh-wire</a>.</p>
      </section>

      </main>

      <footer class="footer" role="contentinfo">
        <p>So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31</p>
      </footer>
    </div>
  `;
}

function render(root: HTMLElement, state: AppState): void {
  root.innerHTML = buildAppMarkup(state);
  applyTheme(state.theme);

  const explorerPlot = root.querySelector<SVGSVGElement>('#curve-explorer-plot');
  if (explorerPlot) {
    renderCurvePlot(explorerPlot, SMALL_FIELD_CURVE, {
      points: explorerPoints,
      generator: SMALL_FIELD_CURVE.generator,
      selected: state.selectedPoints,
      result: state.additionResult,
      onSelect: (point) => {
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

        render(root, state);
      },
    });
  }

  (Object.entries(COMPARISON_ANALOGS) as Array<[RealCurveId, (typeof COMPARISON_ANALOGS)[string]]>).forEach(
    ([curveId, curve]) => {
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
    },
  );

  root.querySelector<HTMLButtonElement>('#theme-toggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    render(root, state);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-scalar-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset.scalarMode as ScalarMode;
      state.scalarMode = nextMode;
      render(root, state);
    });
  });

  root.querySelector<HTMLInputElement>('#small-scalar-input')?.addEventListener('input', (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isNaN(value)) {
      state.smallScalar = Math.max(1, Math.min(20, Math.trunc(value)));
      render(root, state);
    }
  });

  root.querySelector<HTMLSelectElement>('#real-curve-select')?.addEventListener('change', (event) => {
    state.realCurve = (event.currentTarget as HTMLSelectElement).value as RealCurveId;
    state.realScalar = defaultScalarForCurve(state.realCurve);
    render(root, state);
  });

  root.querySelector<HTMLInputElement>('#real-scalar-input')?.addEventListener('input', (event) => {
    state.realScalar = (event.currentTarget as HTMLInputElement).value;
    render(root, state);
  });

  root.querySelector<HTMLSelectElement>('#ecdh-curve-select')?.addEventListener('change', (event) => {
    state.ecdhCurve = (event.currentTarget as HTMLSelectElement).value as RealCurveId;
    state.ecdhTranscript = generateEcdhDemo(state.ecdhCurve);
    render(root, state);
  });

  root.querySelector<HTMLButtonElement>('#ecdh-generate')?.addEventListener('click', () => {
    state.ecdhTranscript = generateEcdhDemo(state.ecdhCurve);
    render(root, state);
  });
}

export function initApp(root: HTMLElement): void {
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
  };

  render(root, initialState);
}
