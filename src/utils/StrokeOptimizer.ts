/**
 * StrokeOptimizer - Utilities for optimizing stroke data before persistence
 *
 * Uses the Ramer-Douglas-Peucker (RDP) algorithm to simplify paths while
 * maintaining visual fidelity. Also includes precision truncation.
 */

export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface StrokeData {
  id: string;
  points: Point[];
  color: string;
  size: number;
  opacity?: number;
  brushStyle: string;
  timestamp: number;
}

/**
 * Default epsilon for RDP algorithm.
 * Higher values = more simplification = smaller file size but less detail.
 * 0.5-1.0 is usually imperceptible for most drawings.
 */
const DEFAULT_EPSILON = 0.5;

/**
 * Number of decimal places to keep for coordinates.
 * 2 decimals = sub-pixel precision (more than enough for canvas rendering)
 */
const COORDINATE_PRECISION = 2;

/**
 * Number of decimal places for pressure values.
 * 2 decimals gives 100 levels of pressure (plenty for most use cases)
 */
const PRESSURE_PRECISION = 2;

/**
 * Calculate perpendicular distance from a point to a line segment.
 */
function perpendicularDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point,
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  // If line is actually a point, return distance to that point
  const lineLengthSquared = dx * dx + dy * dy;
  if (lineLengthSquared === 0) {
    const pdx = point.x - lineStart.x;
    const pdy = point.y - lineStart.y;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  // Calculate perpendicular distance using cross product formula
  const numerator = Math.abs(
    dy * point.x -
      dx * point.y +
      lineEnd.x * lineStart.y -
      lineEnd.y * lineStart.x,
  );
  const denominator = Math.sqrt(lineLengthSquared);

  return numerator / denominator;
}

/**
 * Ramer-Douglas-Peucker algorithm for path simplification.
 * Recursively simplifies a path by removing points that are within
 * epsilon distance of the line between their neighbors.
 *
 * @param points - Array of points to simplify
 * @param epsilon - Maximum distance threshold for point removal
 * @returns Simplified array of points
 */
function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) {
    return points;
  }

  // Find the point with maximum distance from the line between first and last
  let maxDistance = 0;
  let maxIndex = 0;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], firstPoint, lastPoint);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDistance > epsilon) {
    // Recursive call on two halves
    const leftHalf = rdpSimplify(points.slice(0, maxIndex + 1), epsilon);
    const rightHalf = rdpSimplify(points.slice(maxIndex), epsilon);

    // Combine results (remove duplicate point at junction)
    return [...leftHalf.slice(0, -1), ...rightHalf];
  } else {
    // All points between first and last are within epsilon, keep only endpoints
    return [firstPoint, lastPoint];
  }
}

/**
 * Truncate a number to specified decimal places.
 */
function truncateNumber(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Truncate point coordinates and pressure to reduce precision bloat.
 */
function truncatePoint(point: Point): Point {
  return {
    x: truncateNumber(point.x, COORDINATE_PRECISION),
    y: truncateNumber(point.y, COORDINATE_PRECISION),
    pressure: truncateNumber(point.pressure, PRESSURE_PRECISION),
  };
}

/**
 * Optimize a single stroke's points using RDP simplification and precision truncation.
 *
 * @param points - Original points array
 * @param epsilon - RDP epsilon (default: 0.5)
 * @returns Optimized points array
 */
export function optimizePoints(
  points: Point[],
  epsilon: number = DEFAULT_EPSILON,
): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [truncatePoint(points[0])];
  if (points.length === 2) return points.map(truncatePoint);

  // Apply RDP simplification
  const simplified = rdpSimplify(points, epsilon);

  // Apply precision truncation
  return simplified.map(truncatePoint);
}

/**
 * Optimize a stroke for storage.
 *
 * @param stroke - Original stroke data
 * @param epsilon - RDP epsilon (default: 0.5)
 * @returns Optimized stroke with simplified points
 */
export function optimizeStroke(
  stroke: StrokeData,
  epsilon: number = DEFAULT_EPSILON,
): StrokeData {
  return {
    ...stroke,
    points: optimizePoints(stroke.points, epsilon),
  };
}

/**
 * Optimize multiple strokes for storage.
 *
 * @param strokes - Array of strokes to optimize
 * @param epsilon - RDP epsilon (default: 0.5)
 * @returns Array of optimized strokes
 */
export function optimizeStrokes(
  strokes: StrokeData[],
  epsilon: number = DEFAULT_EPSILON,
): StrokeData[] {
  return strokes.map((stroke) => optimizeStroke(stroke, epsilon));
}

/**
 * Calculate optimization statistics for debugging/reporting.
 */
export function calculateOptimizationStats(
  originalPoints: Point[],
  optimizedPoints: Point[],
): {
  originalCount: number;
  optimizedCount: number;
  reduction: number;
  reductionPercent: number;
} {
  const originalCount = originalPoints.length;
  const optimizedCount = optimizedPoints.length;
  const reduction = originalCount - optimizedCount;
  const reductionPercent =
    originalCount > 0 ? Math.round((reduction / originalCount) * 100) : 0;

  return {
    originalCount,
    optimizedCount,
    reduction,
    reductionPercent,
  };
}

/**
 * Estimate JSON size reduction for a stroke.
 */
export function estimateSizeReduction(
  originalStrokes: StrokeData[],
  optimizedStrokes: StrokeData[],
): {
  originalSize: number;
  optimizedSize: number;
  savedBytes: number;
  savedPercent: number;
} {
  const originalSize = JSON.stringify(originalStrokes).length;
  const optimizedSize = JSON.stringify(optimizedStrokes).length;
  const savedBytes = originalSize - optimizedSize;
  const savedPercent =
    originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

  return {
    originalSize,
    optimizedSize,
    savedBytes,
    savedPercent,
  };
}

export default {
  optimizePoints,
  optimizeStroke,
  optimizeStrokes,
  calculateOptimizationStats,
  estimateSizeReduction,
};
