import {
  type GlobalPoint,
  type LocalPoint,
  pointDistance,
} from "@excalidraw/math";
import type {
  ExcalidrawElement,
  ExcalidrawLinearElement,
} from "@excalidraw/element/types";

/**
 * Calculates the perpendicular distance of a point from a line segment.
 */
const perpendicularDistance = (
  point: GlobalPoint | LocalPoint | [number, number],
  lineStart: GlobalPoint | LocalPoint | [number, number],
  lineEnd: GlobalPoint | LocalPoint | [number, number],
) => {
  const x = point[0];
  const y = point[1];
  const x1 = lineStart[0];
  const y1 = lineStart[1];
  const x2 = lineEnd[0];
  const y2 = lineEnd[1];

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }

  const numerator = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1);
  const denominator = Math.hypot(dx, dy);

  return numerator / denominator;
};

/**
 * Ramer-Douglas-Peucker algorithm for curve simplification.
 *
 * @param points The array of points to simplify.
 * @param epsilon The distance threshold.
 * @returns A simplified array of points.
 */
export const ramerDouglasPeucker = (
  points: readonly (GlobalPoint | LocalPoint | [number, number])[],
  epsilon: number,
): (GlobalPoint | LocalPoint | [number, number])[] => {
  if (points.length < 3) {
    return [...points];
  }

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
    const recResults2 = ramerDouglasPeucker(points.slice(index), epsilon);

    return [...recResults1.slice(0, -1), ...recResults2];
  }

  return [points[0], points[end]];
};

type RecognizedShape =
  | {
      type: "rectangle";
      x: number;
      y: number;
      width: number;
      height: number;
      angle: number;
    }
  | {
      type: "ellipse";
      x: number;
      y: number;
      width: number;
      height: number;
      angle: number;
    }
  | {
      type: "diamond";
      x: number;
      y: number;
      width: number;
      height: number;
      angle: number;
    }
  | {
      type: "arrow";
      points: [number, number][];
      x: number;
      y: number;
    }
  | {
      type: "line";
      points: [number, number][];
      x: number;
      y: number;
    }
  | null;

const getBoundingBox = (points: readonly (GlobalPoint | LocalPoint | [number, number])[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const getPolygonArea = (points: readonly (GlobalPoint | LocalPoint | [number, number])[]) => {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    area += x1 * y2 - y1 * x2;
  }
  return Math.abs(area) / 2;
};

const isClosed = (points: readonly (GlobalPoint | LocalPoint | [number, number])[]) => {
  const start = points[0];
  const end = points[points.length - 1];
  const dist = Math.hypot(start[0] - end[0], start[1] - end[1]);
  return dist < 30; // 30px gap allowed
};

// Simplified detection logic
export const recognizeShape = (
  points: readonly (GlobalPoint | LocalPoint | [number, number])[],
): RecognizedShape => {
  if (points.length < 2) {
    return null;
  }

  // 1. Simplify
  const epsilon = 10; // Adjust sensitivity for better shape detection
  const simplified = ramerDouglasPeucker(points, epsilon) as [number, number][];

  // 2. Check for Line/Arrow (open shapes) vs Closed shapes
  const closed = isClosed(points);

  if (!closed) {
    // Check if it's a line or arrow
    if (simplified.length === 2) {
      // It's a line
      return {
        type: "line",
        points: simplified.map((p) => [p[0] - simplified[0][0], p[1] - simplified[0][1]]) as [number, number][],
        x: simplified[0][0],
        y: simplified[0][1],
      };
    }

    // Arrow recognition heuristic
    if (simplified.length >= 3 && simplified.length <= 5) {
      const start = simplified[0];
      const end = simplified[simplified.length - 1];
      return {
        type: "arrow",
        points: [[0, 0], [end[0] - start[0], end[1] - start[1]]],
        x: start[0],
        y: start[1],
      };
    }

    // Default to polyline for other open shapes
    return {
       type: "line",
       points: simplified.map((p) => [p[0] - simplified[0][0], p[1] - simplified[0][1]]) as [number, number][],
       x: simplified[0][0],
       y: simplified[0][1],
    };
  } else {
    // Closed shape
    const closedSimplified = ramerDouglasPeucker([...points, points[0]], epsilon) as [number, number][];

    // vertexCount is simplified points count minus 1 (since start repeats at end)
    const vertexCount = closedSimplified.length - 1;

    const bbox = getBoundingBox(points);
    const bboxArea = bbox.width * bbox.height;

    // Helper to determine Rect vs Diamond
    const checkRectVsDiamond = () => {
       const polyArea = getPolygonArea(closedSimplified);
       const ratio = polyArea / bboxArea;

       if (ratio < 0.65) {
         return {
           type: "diamond",
           x: bbox.minX,
           y: bbox.minY,
           width: bbox.width,
           height: bbox.height,
           angle: 0,
         } as const;
       }
       return {
         type: "rectangle",
         x: bbox.minX,
         y: bbox.minY,
         width: bbox.width,
         height: bbox.height,
         angle: 0,
       } as const;
    };

    if (vertexCount === 3) {
       // Triangle -> Line (Polygon)
       return {
          type: "line",
          points: closedSimplified.map((p) => [p[0] - closedSimplified[0][0], p[1] - closedSimplified[0][1]]) as [number, number][],
          x: closedSimplified[0][0],
          y: closedSimplified[0][1],
       };
    }

    if (vertexCount === 4 || vertexCount === 5) {
        return checkRectVsDiamond();
    }

    // For more vertices, check Ellipse
    const center = {
      x: (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2,
      y: (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2
    };

    const distances = points.map(p => Math.hypot(p[0] - center.x, p[1] - center.y));
    const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((a, b) => a + Math.pow(b - meanDist, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);

    // Stricter threshold for roundness to avoid capturing Squares/Diamonds
    if (stdDev / meanDist < 0.1) {
       return {
         type: "ellipse",
         x: bbox.minX,
         y: bbox.minY,
         width: bbox.width,
         height: bbox.height,
         angle: 0,
       };
    }

    // Fallback: It's a polygon but with too many points for exact 4-corner match
    // Check if it resembles a Diamond or Rectangle based on area
    // Use the simplified points for area calculation to smooth out jitter
    return checkRectVsDiamond();
  }

  return null;
};
