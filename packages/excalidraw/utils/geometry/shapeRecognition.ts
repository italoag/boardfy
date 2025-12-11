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
    return points;
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

const isClosed = (points: readonly (GlobalPoint | LocalPoint | [number, number])[]) => {
  const start = points[0];
  const end = points[points.length - 1];
  const dist = Math.hypot(start[0] - end[0], start[1] - end[1]);
  // Relative to perimeter or bounding box could be better, but fixed threshold is a start
  // Considering it's a hand drawn shape, closure might be loose.
  // Using 10% of total length or fixed px?
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
  const epsilon = 5; // Adjust sensitivity
  const simplified = ramerDouglasPeucker(points, epsilon) as [number, number][];

  // 2. Check for Line/Arrow (open shapes) vs Closed shapes
  const closed = isClosed(points);

  if (!closed) {
    // Check if it's a line or arrow
    // A line is basically 2 points in simplified, or nearly collinear points
    if (simplified.length === 2) {
      // It's a line
      return {
        type: "line",
        points: simplified.map((p) => [p[0] - simplified[0][0], p[1] - simplified[0][1]]) as [number, number][],
        x: simplified[0][0],
        y: simplified[0][1],
      };
    }

    // If it has more points, check for arrow (usually 3-4 points like L shape or just a messy line we treat as arrow?)
    // Or maybe just a multi-segment line.
    // The requirement says "support arrows".
    // A simple arrow recognition: check if the end looks like an arrowhead?
    // Or just treat any open curve as a line/arrow?
    // Let's assume for now any open shape that is relatively straight is a line.
    // If it has a distinct "V" at end, it is an arrow.
    // Implementation of arrow detection is tricky without sophisticated gesture recognition.
    // However, if we just convert "open strokes" to arrows if they have > 2 points might be annoying.
    // Let's stick to: if it's open and roughly 2 points -> Line.
    // If open and multiple points, check for linearity.

    // For now, let's just return it as a line if it's open.
    // The user can change it to arrow later? Or we can default to arrow if it's "magic pencil"?
    // The prompt says "recognize ... convert into geometric objects".
    // Let's support Arrow if it has a sharp turn at the end?
    // Actually, RDP on an arrow drawn like ---> might result in 2 points (shaft) + head points.

    // Let's simple check: straight line -> Line.
    // Anything else open -> Arrow? Or just Line?
    // "Arrow" is a specific element in Excalidraw.

    // Let's try to detect if the last few points form a sharp angle with the main shaft.
    // For MVP, let's map simple lines to Lines.
    // If the user draws a line, we make a line.

    // Let's look at Closed shapes first.
  } else {
    // Closed shape
    // RDP on closed shape might reduce it to a few vertices.
    const closedSimplified = ramerDouglasPeucker([...points, points[0]], epsilon) as [number, number][];

    // Rectangle: 4 or 5 points (start==end)
    // Diamond: 4 or 5 points, rotated.
    // Triangle: 3 or 4 points. (Not requested explicitly but good to know)
    // Ellipse: Many points? Or RDP reduces it to a polygon.

    const vertexCount = closedSimplified.length - 1; // start repeats at end for closedSimplified usually if we force it
    // Note: RDP function above returns start and end. If we pass a closed loop points[0] approx points[end], RDP preserves them.
    // If we effectively closed it, vertexCount is unique vertices.

    if (vertexCount === 3) {
       // Triangle (not requested, map to nothing or freedraw?)
       // Actually user requested "geometric shapes", usually implies triangle too.
       // But let's focus on Rect/Diamond/Ellipse.
    }

    if (vertexCount === 4) {
       // Could be Rect or Diamond.
       // Check angles.
       // If axis aligned -> Rect.
       // If rotated -> Diamond or Rotated Rect.
       // Excalidraw Rects can be rotated.
       // Distinguish Diamond vs Rotated Rect:
       // Diamond element in Excalidraw is specific.
       // A diamond is usually drawn with corners at Top, Bottom, Left, Right relative to its center.

       const bbox = getBoundingBox(points);
       return {
         type: "rectangle",
         x: bbox.minX,
         y: bbox.minY,
         width: bbox.width,
         height: bbox.height,
         angle: 0,
       };
    }

    // Ellipse detection
    // If vertex count is high even after RDP? Or if the original points fit an ellipse equation better?
    // Simple heuristic: aspect ratio and coverage.
    // Or just: if it looks round.
    // Let's assume if it has > 4 vertices after RDP or if the area is close to ellipse area?

    // For MVP:
    // If it looks like a circle/oval -> Ellipse.
    // If it looks like a box -> Rectangle.

    // Heuristic:
    // 1. Convex Hull?
    // 2. Std Dev of distance from center?

    const center = {
      x: (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2,
      y: (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2
    };

    const distances = points.map(p => Math.hypot(p[0] - center.x, p[1] - center.y));
    const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((a, b) => a + Math.pow(b - meanDist, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);

    // CV = stdDev / meanDist. For a circle, CV is 0.
    // For a square, distances vary more.

    if (stdDev / meanDist < 0.15) { // Threshold for "roundness"
       const bbox = getBoundingBox(points);
       return {
         type: "ellipse",
         x: bbox.minX,
         y: bbox.minY,
         width: bbox.width,
         height: bbox.height,
         angle: 0,
       };
    }

    // Fallback to Rectangle for closed shapes
    const bbox = getBoundingBox(points);
    return {
       type: "rectangle",
       x: bbox.minX,
       y: bbox.minY,
       width: bbox.width,
       height: bbox.height,
       angle: 0,
    };
  }

  return null;
};
