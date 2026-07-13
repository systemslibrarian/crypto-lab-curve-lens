import type { FinitePoint, Point, SmallCurveConfig } from './curve';
import { chordSlope, formatPoint, isOnCurve, mod, negatePoint, pointsEqual } from './curve';
import {
  REAL_PLANE_CURVE,
  addRealPoints,
  sampleBranches,
  upperY,
  type RealCurveParams,
} from './realplane';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function setAttributes(element: Element, attributes: Record<string, string>): void {
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
}

interface CurvePlotOptions {
  points: FinitePoint[];
  generator: Point;
  selected: Point[];
  result: Point;
  onSelect?: (point: FinitePoint, viaKeyboard?: boolean) => void;
  /** Point to move keyboard focus to after rendering (for keyboard-driven selection). */
  focusKey?: Point;
  compact?: boolean;
  /** Draw the chord/tangent line and the reflection that produce the sum. */
  geometry?: boolean;
  /** Faint trail of already-visited points (used by the discrete-log walk). */
  trail?: Point[];
  /** The point currently under inspection in an animated walk. */
  active?: Point;
  /** Alice's public point A = a·G (toy ECDH lane). */
  alice?: Point;
  /** Bob's public point B = b·G (toy ECDH lane). */
  bob?: Point;
}

export function renderCurvePlot(
  svg: SVGSVGElement,
  curve: SmallCurveConfig,
  options: CurvePlotOptions,
): void {
  const size = options.compact ? 220 : 520;
  const padding = options.compact ? 20 : 34;
  const cell = (size - padding * 2) / (curve.p - 1);

  const toX = (x: number): number => padding + x * cell;
  const toY = (y: number): number => size - padding - y * cell;

  svg.replaceChildren();
  setAttributes(svg, {
    viewBox: `0 0 ${size} ${size}`,
    role: options.onSelect ? 'group' : 'img',
    'aria-label': `${curve.name} finite field plot`,
  });

  const background = createSvgElement('rect');
  setAttributes(background, {
    x: '0',
    y: '0',
    width: `${size}`,
    height: `${size}`,
    rx: options.compact ? '16' : '24',
    fill: 'var(--plot-bg)',
  });
  svg.append(background);

  for (let index = 0; index < curve.p; index += 1) {
    const position = padding + cell * index;

    const vertical = createSvgElement('line');
    setAttributes(vertical, {
      x1: `${position}`,
      y1: `${padding}`,
      x2: `${position}`,
      y2: `${size - padding}`,
      class: 'plot-grid-line',
    });

    const horizontal = createSvgElement('line');
    setAttributes(horizontal, {
      x1: `${padding}`,
      y1: `${position}`,
      x2: `${size - padding}`,
      y2: `${position}`,
      class: 'plot-grid-line',
    });

    svg.append(vertical, horizontal);

    if (!options.compact) {
      const bottomLabel = createSvgElement('text');
      setAttributes(bottomLabel, {
        x: `${position}`,
        y: `${size - 10}`,
        'text-anchor': 'middle',
        class: 'plot-axis-label',
      });
      bottomLabel.textContent = `${index}`;

      const leftLabel = createSvgElement('text');
      setAttributes(leftLabel, {
        x: '12',
        y: `${size - padding - cell * index + 4}`,
        'text-anchor': 'middle',
        class: 'plot-axis-label',
      });
      leftLabel.textContent = `${index}`;

      svg.append(bottomLabel, leftLabel);
    }
  }

  // Draw the group-law geometry (chord/tangent + reflection) beneath the points.
  if (options.geometry && !options.compact) {
    drawAdditionGeometry(svg, curve, options, { toX, toY, size, padding });
  }

  const thirdPoint = options.geometry ? negatePoint(curve, options.result) : null;
  const interactive: Array<{ el: SVGCircleElement; point: FinitePoint }> = [];

  options.points.forEach((point) => {
    if (!isOnCurve(curve, point)) {
      return;
    }

    const circle = createSvgElement('circle');
    const cx = toX(point.x);
    const cy = toY(point.y);
    const isGenerator = options.generator !== null && pointsEqual(point, options.generator);
    const isSelected = options.selected.some((selectedPoint) => pointsEqual(selectedPoint, point));
    const isResult = options.result !== null && pointsEqual(options.result, point);
    const isThird =
      thirdPoint !== null && pointsEqual(thirdPoint, point) && !isResult && !isSelected;
    const isActive = options.active != null && pointsEqual(options.active, point);
    const isTrail =
      !isActive && (options.trail?.some((visited) => pointsEqual(visited, point)) ?? false);
    const isAlice = options.alice != null && pointsEqual(options.alice, point) && !isResult;
    const isBob = options.bob != null && pointsEqual(options.bob, point) && !isResult;
    const radius = options.compact ? 4.2 : 6.6;
    const classNames = ['plot-point'];

    if (isAlice) {
      classNames.push('is-alice');
    }
    if (isBob) {
      classNames.push('is-bob');
    }
    if (isGenerator) {
      classNames.push('is-generator');
    }
    if (isTrail) {
      classNames.push('is-trail');
    }
    if (isThird) {
      classNames.push('is-third');
    }
    if (isSelected) {
      classNames.push('is-selected');
    }
    if (isResult) {
      classNames.push('is-result');
    }
    if (isActive) {
      classNames.push('is-active');
    }

    setAttributes(circle, {
      cx: `${cx}`,
      cy: `${cy}`,
      r: `${radius}`,
      class: classNames.join(' '),
      // Roving tabindex: a single point is tabbable; arrow keys move between the rest.
      tabindex: '-1',
      role: options.onSelect ? 'button' : 'img',
      'aria-label': `Point ${formatPoint(point)}`,
    });

    if (options.onSelect) {
      const select = options.onSelect;
      circle.addEventListener('click', () => select(point));
      interactive.push({ el: circle, point });
    }

    svg.append(circle);

    if (isGenerator && !options.compact) {
      svg.append(labelAt(cx + 9, cy - 8, 'G', 'plot-generator-label'));
    }
    if (isThird && !options.compact) {
      svg.append(labelAt(cx + 9, cy - 8, '−(P+Q)', 'plot-third-label'));
    }
    if (isAlice && !options.compact) {
      svg.append(labelAt(cx + 9, cy - 8, 'A', 'plot-alice-label'));
    }
    if (isBob && !options.compact) {
      svg.append(labelAt(cx + 9, cy - 8, 'B', 'plot-bob-label'));
    }
    if (isResult && options.alice != null && !options.compact) {
      // Toy ECDH shared point: label it so the convergence reads clearly.
      svg.append(labelAt(cx + 9, cy + 16, 'a·B = b·A', 'plot-third-label'));
    }
  });

  if (options.onSelect && interactive.length > 0) {
    setupKeyboardNavigation(interactive, options);
  }
}

/**
 * Implements a roving tabindex: only one point is in the tab order at a time,
 * and arrow keys move focus to the nearest point in that direction. This turns a
 * scatter of ~20 tab stops into a single, predictable keyboard target.
 */
function setupKeyboardNavigation(
  interactive: Array<{ el: SVGCircleElement; point: FinitePoint }>,
  options: CurvePlotOptions,
): void {
  const select = options.onSelect;
  if (!select) {
    return;
  }

  const sameKey = (a: FinitePoint, b: Point): boolean => b !== null && a.x === b.x && a.y === b.y;

  // The entry point for Tab: the focusKey, then a selected point, then the generator, else the first.
  const initial =
    interactive.find((entry) => sameKey(entry.point, options.focusKey ?? null)) ??
    interactive.find((entry) => options.selected.some((sel) => sameKey(entry.point, sel))) ??
    interactive.find((entry) => sameKey(entry.point, options.generator)) ??
    interactive[0];

  const setRovingFocus = (target: { el: SVGCircleElement; point: FinitePoint }): void => {
    interactive.forEach((entry) =>
      entry.el.setAttribute('tabindex', entry === target ? '0' : '-1'),
    );
  };

  setRovingFocus(initial);

  const nearestInDirection = (
    from: FinitePoint,
    key: string,
  ): { el: SVGCircleElement; point: FinitePoint } | null => {
    const passes = (p: FinitePoint): boolean => {
      if (key === 'ArrowRight') return p.x > from.x;
      if (key === 'ArrowLeft') return p.x < from.x;
      if (key === 'ArrowUp') return p.y > from.y; // data coords: y increases upward
      if (key === 'ArrowDown') return p.y < from.y;
      return false;
    };

    let best: { el: SVGCircleElement; point: FinitePoint } | null = null;
    let bestScore = Infinity;
    for (const entry of interactive) {
      if (entry.point === from || !passes(entry.point)) {
        continue;
      }
      const dx = entry.point.x - from.x;
      const dy = entry.point.y - from.y;
      const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
      // Prefer small movement along the axis, penalise drifting off it.
      const along = horizontal ? Math.abs(dx) : Math.abs(dy);
      const across = horizontal ? Math.abs(dy) : Math.abs(dx);
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return best;
  };

  interactive.forEach((entry) => {
    entry.el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(entry.point, true);
        return;
      }
      if (event.key.startsWith('Arrow')) {
        const target = nearestInDirection(entry.point, event.key);
        if (target) {
          event.preventDefault();
          setRovingFocus(target);
          target.el.focus();
        }
      }
    });
  });

  // Move focus to the requested point after a keyboard-driven re-render.
  if (options.focusKey != null) {
    const focusTarget = interactive.find((entry) => sameKey(entry.point, options.focusKey ?? null));
    if (focusTarget) {
      focusTarget.el.focus();
    }
  }
}

interface PlotGeometry {
  toX: (x: number) => number;
  toY: (y: number) => number;
  size: number;
  padding: number;
}

/**
 * Renders the group-law line through P and Q the way it actually behaves over a
 * finite field: as the SAME straight line y = λx + c, but wrapped modulo p so it
 * re-enters the grid each time it runs off the top or bottom edge. Because it is
 * the real congruence λx + c (mod p), the drawn segments genuinely pass through
 * P, Q, AND the third intersection −(P+Q) — no dot is left stranded off the line.
 * A newcomer sees the line literally connect all three points, which is the whole
 * point of the group law; the honest "it wraps" caption then matches the picture.
 * Finally the vertical reflection maps −(P+Q) down to the sum P+Q.
 */
function drawAdditionGeometry(
  svg: SVGSVGElement,
  curve: SmallCurveConfig,
  options: CurvePlotOptions,
  geom: PlotGeometry,
): void {
  const [p, q] = options.selected;
  if (p == null || q == null) {
    return;
  }

  const slope = chordSlope(curve, p, q);
  const min = 0;
  const max = curve.p - 1;

  if (slope === null) {
    // Vertical line: P + Q = O (point at infinity). No wrapping needed.
    const line = createSvgElement('line');
    setAttributes(line, {
      x1: `${geom.toX(p.x)}`,
      y1: `${geom.toY(min)}`,
      x2: `${geom.toX(p.x)}`,
      y2: `${geom.toY(max)}`,
      class: 'plot-chord',
    });
    svg.append(line);
    return;
  }

  drawWrappedLine(svg, curve, slope, p, geom);

  // Reflection: the third intersection −(P+Q) drops vertically to the sum P+Q.
  const third = negatePoint(curve, options.result);
  if (third !== null && options.result !== null && !pointsEqual(third, options.result)) {
    const reflect = createSvgElement('line');
    setAttributes(reflect, {
      x1: `${geom.toX(third.x)}`,
      y1: `${geom.toY(third.y)}`,
      x2: `${geom.toX(options.result.x)}`,
      y2: `${geom.toY(options.result.y)}`,
      class: 'plot-reflect',
    });
    svg.append(reflect);
  }
}

/**
 * Draw the congruence y ≡ λx + c (mod p) as a set of straight segments confined
 * to the grid. We sample x finely; wherever the wrapped y jumps across the p↔0
 * boundary we break the polyline and continue it on the opposite edge, so every
 * segment is a true chord of the modular line. Each on-grid integer x lands the
 * segment exactly on a lattice y-value, so P, Q and −(P+Q) all sit on a segment.
 */
function drawWrappedLine(
  svg: SVGSVGElement,
  curve: SmallCurveConfig,
  slope: number,
  through: FinitePoint,
  geom: PlotGeometry,
): void {
  const p = curve.p;
  const intercept = mod(through.y - slope * through.x, p);
  // Real-valued line value at x (before reducing mod p).
  const rawAt = (x: number): number => slope * x + intercept;
  const wrapAt = (x: number): number => {
    // Fractional modular reduction so the drawn curve is continuous between lattice points.
    const v = rawAt(x) % p;
    return v >= 0 ? v : v + p;
  };

  const samples = 480;
  let run: Array<{ x: number; y: number }> = [];
  const flush = (): void => {
    if (run.length >= 2) {
      const poly = createSvgElement('polyline');
      const pts = run.map((pt) => `${geom.toX(pt.x).toFixed(1)},${geom.toY(pt.y).toFixed(1)}`);
      setAttributes(poly, { points: pts.join(' '), class: 'plot-chord', fill: 'none' });
      svg.append(poly);
    }
    run = [];
  };

  let prevWrapped = wrapAt(0);
  run.push({ x: 0, y: prevWrapped });
  for (let i = 1; i <= samples; i += 1) {
    const x = ((p - 1) * i) / samples;
    const wrapped = wrapAt(x);
    // A wrap has occurred if the modular value jumped by more than half the field
    // between adjacent fine samples — i.e. it crossed the 0↔p seam.
    if (Math.abs(wrapped - prevWrapped) > p / 2) {
      flush();
    }
    run.push({ x, y: wrapped });
    prevWrapped = wrapped;
  }
  flush();
}

function labelAt(x: number, y: number, text: string, className: string): SVGTextElement {
  const label = createSvgElement('text');
  setAttributes(label, { x: `${x}`, y: `${y}`, class: className });
  label.textContent = text;
  return label;
}

export interface RealPlaneOptions {
  /** X position of point P along the curve; Q is derived so the pair is legible. */
  px: number;
  qx: number;
  /** Show the reflection step (third intersection dropping to P+Q). */
  curve?: RealCurveParams;
}

/**
 * Render the group law over ℝ: the smooth curve, the straight chord through P and
 * Q hitting a third point, and the vertical reflection down to P + Q. This is the
 * continuous picture the finite-field scatter is an exact analog of. It is purely
 * illustrative geometry (floating point), never a cryptographic computation.
 */
export function renderRealPlane(svg: SVGSVGElement, options: RealPlaneOptions): void {
  const curve = options.curve ?? REAL_PLANE_CURVE;
  const size = 520;
  const pad = 40;

  // Fixed data window chosen so the teaching curve and a typical chord both fit.
  const xMin = -3;
  const xMax = 4.2;
  const yMin = -7;
  const yMax = 7;

  const toX = (x: number): number => pad + ((x - xMin) / (xMax - xMin)) * (size - 2 * pad);
  const toY = (y: number): number => size - pad - ((y - yMin) / (yMax - yMin)) * (size - 2 * pad);

  svg.replaceChildren();
  setAttributes(svg, {
    viewBox: `0 0 ${size} ${size}`,
    role: 'img',
    'aria-label':
      'The elliptic-curve group law over the real numbers: a straight line through P and Q meets the smooth curve at a third point, which is reflected across the x-axis to give P + Q.',
  });

  const background = createSvgElement('rect');
  setAttributes(background, {
    x: '0',
    y: '0',
    width: `${size}`,
    height: `${size}`,
    rx: '24',
    fill: 'var(--plot-bg)',
  });
  svg.append(background);

  // Axes.
  const xAxis = createSvgElement('line');
  setAttributes(xAxis, {
    x1: `${toX(xMin)}`,
    y1: `${toY(0)}`,
    x2: `${toX(xMax)}`,
    y2: `${toY(0)}`,
    class: 'plot-grid-line',
  });
  const yAxis = createSvgElement('line');
  setAttributes(yAxis, {
    x1: `${toX(0)}`,
    y1: `${toY(yMin)}`,
    x2: `${toX(0)}`,
    y2: `${toY(yMax)}`,
    class: 'plot-grid-line',
  });
  svg.append(xAxis, yAxis);

  // The smooth curve, drawn as two branches (top and bottom).
  const { upper, lower } = sampleBranches(curve, xMin, xMax);
  const toPolyline = (pts: Array<{ x: number; y: number }>): string =>
    pts.map((pt) => `${toX(pt.x).toFixed(1)},${toY(pt.y).toFixed(1)}`).join(' ');
  for (const branch of [upper, lower]) {
    if (branch.length < 2) {
      continue;
    }
    const path = createSvgElement('polyline');
    setAttributes(path, { points: toPolyline(branch), class: 'real-curve-line', fill: 'none' });
    svg.append(path);
  }

  // Choose P and Q on the upper branch at the requested x positions.
  const pyRaw = upperY(curve, options.px);
  const qyRaw = upperY(curve, options.qx);
  if (pyRaw === null || qyRaw === null) {
    return;
  }
  const p = { x: options.px, y: pyRaw };
  const q = { x: options.qx, y: qyRaw };
  const { sum, third } = addRealPoints(curve, p, q);

  // The chord: extend it a little past P and Q so it visibly crosses the curve.
  const slope = (q.y - p.y) / (q.x - p.x);
  const chordX1 = xMin;
  const chordX2 = xMax;
  const chordY1 = p.y + slope * (chordX1 - p.x);
  const chordY2 = p.y + slope * (chordX2 - p.x);
  const chord = createSvgElement('line');
  setAttributes(chord, {
    x1: `${toX(chordX1)}`,
    y1: `${toY(chordY1)}`,
    x2: `${toX(chordX2)}`,
    y2: `${toY(chordY2)}`,
    class: 'plot-chord',
  });
  svg.append(chord);

  // The reflection: third intersection drops vertically to P + Q.
  const reflect = createSvgElement('line');
  setAttributes(reflect, {
    x1: `${toX(third.x)}`,
    y1: `${toY(third.y)}`,
    x2: `${toX(sum.x)}`,
    y2: `${toY(sum.y)}`,
    class: 'plot-reflect',
  });
  svg.append(reflect);

  const dot = (
    x: number,
    y: number,
    cls: string,
    label: string,
    labelDx: number,
    labelDy: number,
  ): void => {
    const circle = createSvgElement('circle');
    setAttributes(circle, { cx: `${toX(x)}`, cy: `${toY(y)}`, r: '7', class: cls });
    svg.append(circle);
    svg.append(labelAt(toX(x) + labelDx, toY(y) + labelDy, label, 'real-point-label'));
  };

  dot(third.x, third.y, 'plot-point is-third', '−(P+Q)', 9, -9);
  dot(p.x, p.y, 'plot-point is-selected', 'P', -18, -8);
  dot(q.x, q.y, 'plot-point is-selected', 'Q', 9, -8);
  dot(sum.x, sum.y, 'plot-point is-result', 'P+Q', 9, 16);
}
