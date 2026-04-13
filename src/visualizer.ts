import type { FinitePoint, Point, SmallCurveConfig } from './curve';
import { formatPoint, isOnCurve, pointsEqual } from './curve';

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
  onSelect?: (point: FinitePoint) => void;
  compact?: boolean;
}

export function renderCurvePlot(
  svg: SVGSVGElement,
  curve: SmallCurveConfig,
  options: CurvePlotOptions,
): void {
  const size = options.compact ? 220 : 520;
  const padding = options.compact ? 20 : 34;
  const cell = (size - padding * 2) / (curve.p - 1);

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

  options.points.forEach((point) => {
    if (!isOnCurve(curve, point)) {
      return;
    }

    const circle = createSvgElement('circle');
    const cx = padding + point.x * cell;
    const cy = size - padding - point.y * cell;
    const isGenerator = options.generator !== null && pointsEqual(point, options.generator);
    const isSelected = options.selected.some((selectedPoint) => pointsEqual(selectedPoint, point));
    const isResult = options.result !== null && pointsEqual(options.result, point);
    const radius = options.compact ? 4.2 : 6.6;
    const classNames = ['plot-point'];

    if (isGenerator) {
      classNames.push('is-generator');
    }
    if (isSelected) {
      classNames.push('is-selected');
    }
    if (isResult) {
      classNames.push('is-result');
    }

    setAttributes(circle, {
      cx: `${cx}`,
      cy: `${cy}`,
      r: `${radius}`,
      class: classNames.join(' '),
      tabindex: options.onSelect ? '0' : '-1',
      role: options.onSelect ? 'button' : 'img',
      'aria-label': `Point ${formatPoint(point)}`,
    });

    if (options.onSelect) {
      circle.addEventListener('click', () => options.onSelect?.(point));
      circle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          options.onSelect?.(point);
        }
      });
    }

    svg.append(circle);

    if (isGenerator && !options.compact) {
      const generatorLabel = createSvgElement('text');
      setAttributes(generatorLabel, {
        x: `${cx + 9}`,
        y: `${cy - 8}`,
        class: 'plot-generator-label',
      });
      generatorLabel.textContent = 'G';
      svg.append(generatorLabel);
    }
  });
}
