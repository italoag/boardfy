import {
  type GlobalPoint,
  type LocalPoint,
} from "@excalidraw/math";

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

// Filter out points that form a very obtuse angle (collinear)
const filterCollinearPoints = (points: (GlobalPoint | LocalPoint | [number, number])[]) => {
  if (points.length <= 3) return points;

  const result = [points[0]];
  const n = points.length;

  for (let i = 1; i < n - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const v1 = [curr[0] - prev[0], curr[1] - prev[1]];
    const v2 = [next[0] - curr[0], next[1] - curr[1]];

    const mag1 = Math.hypot(v1[0], v1[1]);
    const mag2 = Math.hypot(v2[0], v2[1]);

    if (mag1 === 0 || mag2 === 0) {
      continue;
    }

    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const angle = Math.acos(Math.min(Math.max(dot / (mag1 * mag2), -1), 1));

    if (angle > 0.35) { // Keep if turn is significant (> ~20 degrees)
      result.push(curr);
    }
  }

  result.push(points[n - 1]);

  return result;
}

// Check if a quadrilateral is a rectangle (approximately 90 degree angles)
const isLikelyRectangle = (points: (GlobalPoint | LocalPoint | [number, number])[]) => {
  if (points.length !== 5) return false; // 4 sides + closed

  for (let i = 0; i < 4; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[(i + 2) % 4]; // logic for 4 unique points
    // Actually points has 5 elements (0..4), 0==4.
    // Neighbors of p2 are p1 and p3.
    // Vectors: p2->p1, p2->p3

    // Let's use indices 0,1,2,3.
    // Angles at 0, 1, 2, 3.
    // Angle at 1: p0-p1-p2

    const prev = points[i];
    const curr = points[(i + 1) % 4];
    const next = points[(i + 2) % 4];

    const v1 = [prev[0] - curr[0], prev[1] - curr[1]];
    const v2 = [next[0] - curr[0], next[1] - curr[1]];

    const mag1 = Math.hypot(v1[0], v1[1]);
    const mag2 = Math.hypot(v2[0], v2[1]);

    if (mag1 === 0 || mag2 === 0) continue;

    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    // cos(theta) = dot / (mag1*mag2)
    // For 90 degrees, dot should be 0. cos(90) = 0.

    const cosTheta = Math.abs(dot / (mag1 * mag2));

    if (cosTheta > 0.3) { // Allow some deviation. 0.3 is approx 72-108 degrees range?
      // cos(72) = 0.309. cos(90)=0.
      return false;
    }
  }
  return true;
}

// Simplified detection logic
export const recognizeShape = (
  points: readonly (GlobalPoint | LocalPoint | [number, number])[],
): RecognizedShape => {
  if (points.length < 2) {
    return null;
  }

  // 1. Simplify
  const epsilon = 10;
  const simplified = ramerDouglasPeucker(points, epsilon) as [number, number][];

  // 2. Check for Line/Arrow (open shapes) vs Closed shapes
  const closed = isClosed(points);

  if (!closed) {
    if (simplified.length === 2) {
      return {
        type: "line",
        points: simplified.map((p) => [p[0] - simplified[0][0], p[1] - simplified[0][1]]) as [number, number][],
        x: simplified[0][0],
        y: simplified[0][1],
      };
    }

    // Arrow recognition
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

    return {
       type: "line",
       points: simplified.map((p) => [p[0] - simplified[0][0], p[1] - simplified[0][1]]) as [number, number][],
       x: simplified[0][0],
       y: simplified[0][1],
    };
  } else {
    // Closed shape
    let closedSimplified = ramerDouglasPeucker([...points, points[0]], epsilon) as [number, number][];
    closedSimplified = filterCollinearPoints(closedSimplified) as [number, number][];

    const vertexCount = closedSimplified.length - 1; // start repeats at end
    const bbox = getBoundingBox(points);
    const bboxArea = bbox.width * bbox.height;

    // 3 Vertices -> Triangle
    if (vertexCount === 3) {
       return {
          type: "line",
          points: closedSimplified.map((p) => [p[0] - closedSimplified[0][0], p[1] - closedSimplified[0][1]]) as [number, number][],
          x: closedSimplified[0][0],
          y: closedSimplified[0][1],
       };
    }

    // 4 Vertices -> Quad (Rect, Diamond, Trapezoid, Parallelogram)
    if (vertexCount === 4) {
       // Check if Rectangle
       if (isLikelyRectangle(closedSimplified)) {
          return {
             type: "rectangle",
             x: bbox.minX,
             y: bbox.minY,
             width: bbox.width,
             height: bbox.height,
             angle: 0,
          };
       }

       // Check Area Ratio for Diamond
       const polyArea = getPolygonArea(closedSimplified);
       const ratio = polyArea / bboxArea;

       if (ratio < 0.65) {
         // Likely Diamond (Rhombus)
         return {
           type: "diamond",
           x: bbox.minX,
           y: bbox.minY,
           width: bbox.width,
           height: bbox.height,
           angle: 0,
         };
       }

       // Fallback for 4-sided: return as Polygon (Parallelogram, Trapezoid, or Irregular)
       // This preserves the geometry of Trapezoid/Parallelogram better than forcing into Rect/Diamond
       return {
          type: "line",
          points: closedSimplified.map((p) => [p[0] - closedSimplified[0][0], p[1] - closedSimplified[0][1]]) as [number, number][],
          x: closedSimplified[0][0],
          y: closedSimplified[0][1],
       };
    }

    // 5 Vertices -> Pentagon
    if (vertexCount === 5) {
       return {
          type: "line",
          points: closedSimplified.map((p) => [p[0] - closedSimplified[0][0], p[1] - closedSimplified[0][1]]) as [number, number][],
          x: closedSimplified[0][0],
          y: closedSimplified[0][1],
       };
    }

    // 6 Vertices -> Hexagon
    if (vertexCount === 6) {
       return {
          type: "line",
          points: closedSimplified.map((p) => [p[0] - closedSimplified[0][0], p[1] - closedSimplified[0][1]]) as [number, number][],
          x: closedSimplified[0][0],
          y: closedSimplified[0][1],
       };
    }

    // > 6 Vertices: Check Ellipse
    const center = {
      x: (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2,
      y: (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2
    };

    const distances = points.map(p => Math.hypot(p[0] - center.x, p[1] - center.y));
    const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((a, b) => a + Math.pow(b - meanDist, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);

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

    // Fallback -> Polygon
    return {
        type: "line",
        points: closedSimplified.map((p) => [p[0] - closedSimplified[0][0], p[1] - closedSimplified[0][1]]) as [number, number][],
        x: closedSimplified[0][0],
        y: closedSimplified[0][1],
    };
  }

  return null;
};
