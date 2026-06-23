import type { FinitePoint, Point, SmallCurveConfig } from './curve';
import { chordSlope, formatPoint, isOnCurve, mod, negatePoint, pointsEqual } from './curve';

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
    const radius = options.compact ? 4.2 : 6.6;
    const classNames = ['plot-point'];

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
 * Renders the chord (or tangent) through the two selected points and the
 * vertical reflection that maps the third intersection −(P+Q) to the sum P+Q.
 * The straight line is the line over the rationals; on the finite field it
 * "wraps" modulo p, which is why the third point can reappear elsewhere.
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

  const line = createSvgElement('line');
  if (slope === null) {
    // Vertical line: P + Q = O (point at infinity).
    setAttributes(line, {
      x1: `${geom.toX(p.x)}`,
      y1: `${geom.toY(min)}`,
      x2: `${geom.toX(p.x)}`,
      y2: `${geom.toY(max)}`,
      class: 'plot-chord',
    });
  } else {
    const intercept = mod(p.y - slope * p.x, curve.p);
    // Evaluate the real-valued line y = slope·x + intercept at the field edges.
    const yAtMin = slope * min + intercept;
    const yAtMax = slope * max + intercept;
    setAttributes(line, {
      x1: `${geom.toX(min)}`,
      y1: `${geom.toY(yAtMin)}`,
      x2: `${geom.toX(max)}`,
      y2: `${geom.toY(yAtMax)}`,
      class: 'plot-chord',
    });
  }
  svg.append(line);

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

function labelAt(x: number, y: number, text: string, className: string): SVGTextElement {
  const label = createSvgElement('text');
  setAttributes(label, { x: `${x}`, y: `${y}`, class: className });
  label.textContent = text;
  return label;
}
