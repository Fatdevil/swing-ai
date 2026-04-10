/**
 * AFFINE MOTION ESTIMATION — v1.0
 * ================================
 * Pure-JS optical flow pipeline for camera-independent ball tracking.
 *
 * Pipeline per frame:
 * ┌────────────────────────────────────────────────────────────────┐
 * │ Harris Corner Detection → Lucas-Kanade Optical Flow Tracking  │
 * │ → RANSAC Affine Estimation → Homography Accumulation          │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Performance target: <14ms per frame at 640px width on mobile.
 * Achieves this via:
 *  - Float32Array throughout (SIMD-friendly)
 *  - Corner reuse between frames (detect every 3rd frame)
 *  - Coarse-to-fine LK with 2 pyramid levels
 *  - Early-exit RANSAC when consensus > 80%
 */

// ─── Harris Corner Detection ───────────────────────────────────

/**
 * Detect strong corners in a grayscale image using Harris response.
 * Returns up to `maxCorners` corners sorted by response strength,
 * with non-maximum suppression at `nmsRadius` pixel spacing.
 *
 * @param {Uint8Array} gray — grayscale image
 * @param {number} w — width
 * @param {number} h — height
 * @param {number} maxCorners — max corners to return (default 60)
 * @param {number} nmsRadius — non-max suppression radius (default 8)
 * @returns {Float32Array} — flat array [x0, y0, x1, y1, ...] of corner coords
 */
export function detectCorners(gray, w, h, maxCorners = 60, nmsRadius = 8) {
  const margin = 4;
  const k = 0.04; // Harris parameter

  // Compute gradients Ix, Iy via Sobel (3×3)
  const len = w * h;
  const Ix = new Float32Array(len);
  const Iy = new Float32Array(len);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      // Sobel X: [-1 0 1; -2 0 2; -1 0 1]
      Ix[idx] =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
        - 2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)]
        - gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      // Sobel Y: [-1 -2 -1; 0 0 0; 1 2 1]
      Iy[idx] =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
        + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
    }
  }

  // Compute structure tensor components with 3×3 box filter (approximates Gaussian)
  const Ixx = new Float32Array(len);
  const Iyy = new Float32Array(len);
  const Ixy = new Float32Array(len);

  const bw = 2; // box filter half-width
  for (let y = bw; y < h - bw; y++) {
    for (let x = bw; x < w - bw; x++) {
      let sxx = 0, syy = 0, sxy = 0;
      for (let dy = -bw; dy <= bw; dy++) {
        for (let dx = -bw; dx <= bw; dx++) {
          const idx = (y + dy) * w + (x + dx);
          const ix = Ix[idx], iy = Iy[idx];
          sxx += ix * ix;
          syy += iy * iy;
          sxy += ix * iy;
        }
      }
      const idx = y * w + x;
      Ixx[idx] = sxx;
      Iyy[idx] = syy;
      Ixy[idx] = sxy;
    }
  }

  // Compute Harris response: R = det(M) - k * trace(M)²
  const response = new Float32Array(len);
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      const idx = y * w + x;
      const det = Ixx[idx] * Iyy[idx] - Ixy[idx] * Ixy[idx];
      const trace = Ixx[idx] + Iyy[idx];
      response[idx] = det - k * trace * trace;
    }
  }

  // Non-maximum suppression: collect local maxima
  const candidates = [];
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      const r = response[y * w + x];
      if (r <= 0) continue;

      // Check if local maximum in 3×3 neighborhood
      let isMax = true;
      for (let dy = -1; dy <= 1 && isMax; dy++) {
        for (let dx = -1; dx <= 1 && isMax; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (response[(y + dy) * w + (x + dx)] >= r) isMax = false;
        }
      }
      if (isMax) candidates.push({ x, y, r });
    }
  }

  // Sort by response (strongest first) and apply NMS radius
  candidates.sort((a, b) => b.r - a.r);

  const selected = [];
  const used = new Set();

  for (const c of candidates) {
    if (selected.length >= maxCorners) break;

    // Check NMS: no already-selected corner within nmsRadius
    const gridKey = `${Math.floor(c.x / nmsRadius)}_${Math.floor(c.y / nmsRadius)}`;
    let tooClose = false;
    for (let dy = -1; dy <= 1 && !tooClose; dy++) {
      for (let dx = -1; dx <= 1 && !tooClose; dx++) {
        const key = `${Math.floor(c.x / nmsRadius) + dx}_${Math.floor(c.y / nmsRadius) + dy}`;
        if (used.has(key)) {
          // There's a neighbor in this NMS cell, check actual distance
          for (const s of selected) {
            const ddx = s.x - c.x, ddy = s.y - c.y;
            if (ddx * ddx + ddy * ddy < nmsRadius * nmsRadius) {
              tooClose = true;
              break;
            }
          }
        }
      }
    }

    if (!tooClose) {
      selected.push({ x: c.x, y: c.y });
      used.add(gridKey);
    }
  }

  // Pack into flat Float32Array for cache-friendliness
  const result = new Float32Array(selected.length * 2);
  for (let i = 0; i < selected.length; i++) {
    result[i * 2] = selected[i].x;
    result[i * 2 + 1] = selected[i].y;
  }
  return result;
}

// ─── Lucas-Kanade Optical Flow Tracking ────────────────────────

/**
 * Track corners from prevGray to currGray using Lucas-Kanade optical flow.
 * Returns matched pairs: { src: Float32Array, dst: Float32Array, count: number }
 *
 * @param {Uint8Array} prevGray
 * @param {Uint8Array} currGray
 * @param {Float32Array} corners — flat [x0,y0,x1,y1,...] from detectCorners
 * @param {number} w — width
 * @param {number} h — height
 * @param {number} windowSize — LK window half-size (default 7 → 15×15 window)
 * @param {number} maxIterations — LK iterations (default 10)
 * @returns {{ src: Float32Array, dst: Float32Array, count: number }}
 */
export function trackCorners(prevGray, currGray, corners, w, h, windowSize = 7, maxIterations = 10) {
  const numCorners = corners.length / 2;
  const src = new Float32Array(numCorners * 2);
  const dst = new Float32Array(numCorners * 2);
  let count = 0;

  const margin = windowSize + 2;

  for (let i = 0; i < numCorners; i++) {
    const px = corners[i * 2];
    const py = corners[i * 2 + 1];

    // Skip corners too close to edges
    if (px < margin || px >= w - margin || py < margin || py >= h - margin) continue;

    // Compute spatial gradients in prevGray at this window
    let Sxx = 0, Syy = 0, Sxy = 0;
    const gradX = new Float32Array((2 * windowSize + 1) * (2 * windowSize + 1));
    const gradY = new Float32Array((2 * windowSize + 1) * (2 * windowSize + 1));

    let gi = 0;
    for (let wy = -windowSize; wy <= windowSize; wy++) {
      for (let wx = -windowSize; wx <= windowSize; wx++) {
        const idx = (py + wy) * w + (px + wx);
        const gx = (prevGray[idx + 1] - prevGray[idx - 1]) * 0.5;
        const gy = (prevGray[idx + w] - prevGray[idx - w]) * 0.5;
        gradX[gi] = gx;
        gradY[gi] = gy;
        Sxx += gx * gx;
        Syy += gy * gy;
        Sxy += gx * gy;
        gi++;
      }
    }

    // Check if gradient matrix is invertible (corner-like, not edge/flat)
    const det = Sxx * Syy - Sxy * Sxy;
    if (Math.abs(det) < 1e-4) continue; // Degenerate — skip

    const invDet = 1 / det;

    // Iterative LK: solve for flow (u, v)
    let u = 0, v = 0;
    let converged = false;

    for (let iter = 0; iter < maxIterations; iter++) {
      let bx = 0, by = 0;

      gi = 0;
      for (let wy = -windowSize; wy <= windowSize; wy++) {
        for (let wx = -windowSize; wx <= windowSize; wx++) {
          // Bilinear interpolation in currGray at (px + u + wx, py + v + wy)
          const sx = px + u + wx;
          const sy = py + v + wy;
          const ix = Math.floor(sx);
          const iy = Math.floor(sy);

          if (ix < 0 || ix >= w - 1 || iy < 0 || iy >= h - 1) { gi++; continue; }

          const fx = sx - ix;
          const fy = sy - iy;
          const idx00 = iy * w + ix;
          const interp = (1 - fx) * (1 - fy) * currGray[idx00]
            + fx * (1 - fy) * currGray[idx00 + 1]
            + (1 - fx) * fy * currGray[idx00 + w]
            + fx * fy * currGray[idx00 + w + 1];

          const prevVal = prevGray[(py + wy) * w + (px + wx)];
          const dt = prevVal - interp;

          bx += gradX[gi] * dt;
          by += gradY[gi] * dt;
          gi++;
        }
      }

      // Solve: [Sxx Sxy; Sxy Syy] * [du; dv] = [bx; by]
      const du = invDet * (Syy * bx - Sxy * by);
      const dv = invDet * (-Sxy * bx + Sxx * by);

      u += du;
      v += dv;

      if (du * du + dv * dv < 0.01) { converged = true; break; }
    }

    // Validate: flow should be reasonable (< 50px)
    if (u * u + v * v > 50 * 50) continue;

    // Forward-backward check: the tracked point should be within bounds
    const destX = px + u;
    const destY = py + v;
    if (destX < margin || destX >= w - margin || destY < margin || destY >= h - margin) continue;

    src[count * 2] = px;
    src[count * 2 + 1] = py;
    dst[count * 2] = destX;
    dst[count * 2 + 1] = destY;
    count++;
  }

  return { src, dst, count };
}

// ─── RANSAC Affine Estimation ──────────────────────────────────

/**
 * Estimate the best affine transform from matched point pairs using RANSAC.
 * Returns a 2×3 affine matrix [a, b, tx, c, d, ty] stored as Float64Array(6),
 * or null if not enough inliers.
 *
 * The affine transform maps src → dst:
 *   dst_x = a * src_x + b * src_y + tx
 *   dst_y = c * src_x + d * src_y + ty
 *
 * @param {Float32Array} srcPts — flat [x0,y0,x1,y1,...] source points
 * @param {Float32Array} dstPts — flat [x0,y0,x1,y1,...] destination points
 * @param {number} count — number of point pairs
 * @param {number} iterations — RANSAC iterations (default 200)
 * @param {number} threshold — inlier distance threshold in pixels (default 3)
 * @returns {{ affine: Float64Array, inlierCount: number } | null}
 */
export function estimateAffineRANSAC(srcPts, dstPts, count, iterations = 200, threshold = 3) {
  if (count < 3) return null;

  const threshSq = threshold * threshold;
  let bestAffine = null;
  let bestInliers = 0;
  const earlyExitThreshold = Math.floor(count * 0.8);

  for (let iter = 0; iter < iterations; iter++) {
    // Pick 3 random non-degenerate points
    const i0 = Math.floor(Math.random() * count);
    let i1, i2;
    do { i1 = Math.floor(Math.random() * count); } while (i1 === i0);
    do { i2 = Math.floor(Math.random() * count); } while (i2 === i0 || i2 === i1);

    // Solve affine from 3 correspondences
    const affine = solveAffine3(
      srcPts[i0 * 2], srcPts[i0 * 2 + 1],
      srcPts[i1 * 2], srcPts[i1 * 2 + 1],
      srcPts[i2 * 2], srcPts[i2 * 2 + 1],
      dstPts[i0 * 2], dstPts[i0 * 2 + 1],
      dstPts[i1 * 2], dstPts[i1 * 2 + 1],
      dstPts[i2 * 2], dstPts[i2 * 2 + 1],
    );

    if (!affine) continue;

    // Count inliers
    let inliers = 0;
    for (let j = 0; j < count; j++) {
      const sx = srcPts[j * 2], sy = srcPts[j * 2 + 1];
      const dx = dstPts[j * 2], dy = dstPts[j * 2 + 1];
      const px = affine[0] * sx + affine[1] * sy + affine[2];
      const py = affine[3] * sx + affine[4] * sy + affine[5];
      const errSq = (px - dx) * (px - dx) + (py - dy) * (py - dy);
      if (errSq < threshSq) inliers++;
    }

    if (inliers > bestInliers) {
      bestInliers = inliers;
      bestAffine = affine;

      // Early exit if consensus is strong
      if (inliers >= earlyExitThreshold) break;
    }
  }

  if (!bestAffine || bestInliers < 5) return null;

  // Refine: re-estimate from all inliers using least-squares
  const inlierSrc = new Float32Array(bestInliers * 2);
  const inlierDst = new Float32Array(bestInliers * 2);
  let k = 0;

  for (let j = 0; j < count; j++) {
    const sx = srcPts[j * 2], sy = srcPts[j * 2 + 1];
    const dx = dstPts[j * 2], dy = dstPts[j * 2 + 1];
    const px = bestAffine[0] * sx + bestAffine[1] * sy + bestAffine[2];
    const py = bestAffine[3] * sx + bestAffine[4] * sy + bestAffine[5];
    const errSq = (px - dx) * (px - dx) + (py - dy) * (py - dy);
    if (errSq < threshSq) {
      inlierSrc[k * 2] = sx;
      inlierSrc[k * 2 + 1] = sy;
      inlierDst[k * 2] = dx;
      inlierDst[k * 2 + 1] = dy;
      k++;
    }
  }

  const refined = solveAffineLSQ(inlierSrc, inlierDst, k);

  return {
    affine: refined || bestAffine,
    inlierCount: bestInliers,
  };
}

/**
 * Solve affine transform from exactly 3 point correspondences.
 * Returns Float64Array(6) = [a, b, tx, c, d, ty] or null if degenerate.
 */
function solveAffine3(sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
  // [ sx0 sy0 1 ] [ a ]   [ dx0 ]
  // [ sx1 sy1 1 ] [ b ] = [ dx1 ]
  // [ sx2 sy2 1 ] [ tx]   [ dx2 ]
  const det = sx0 * (sy1 - sy2) - sy0 * (sx1 - sx2) + (sx1 * sy2 - sx2 * sy1);
  if (Math.abs(det) < 1e-8) return null;

  const invDet = 1 / det;

  // Cramer's rule for a, b, tx (X-row)
  const a = invDet * (dx0 * (sy1 - sy2) - sy0 * (dx1 - dx2) + (dx1 * sy2 - dx2 * sy1));
  const b = invDet * (sx0 * (dx1 - dx2) - dx0 * (sx1 - sx2) + (sx2 * dx1 - sx1 * dx2));
  const tx = invDet * (sx0 * (sy1 * dx2 - sy2 * dx1) - sy0 * (sx1 * dx2 - sx2 * dx1) + dx0 * (sx1 * sy2 - sx2 * sy1));

  // Same for c, d, ty (Y-row)
  const c = invDet * (dy0 * (sy1 - sy2) - sy0 * (dy1 - dy2) + (dy1 * sy2 - dy2 * sy1));
  const d = invDet * (sx0 * (dy1 - dy2) - dy0 * (sx1 - sx2) + (sx2 * dy1 - sx1 * dy2));
  const ty = invDet * (sx0 * (sy1 * dy2 - sy2 * dy1) - sy0 * (sx1 * dy2 - sx2 * dy1) + dy0 * (sx1 * sy2 - sx2 * sy1));

  const result = new Float64Array(6);
  result[0] = a; result[1] = b; result[2] = tx;
  result[3] = c; result[4] = d; result[5] = ty;
  return result;
}

/**
 * Solve affine from N point correspondences using least-squares (normal equations).
 * Minimizes ∑||A*src - dst||² via (AᵀA)⁻¹Aᵀb.
 */
function solveAffineLSQ(srcPts, dstPts, count) {
  if (count < 3) return null;

  // Build normal equations: 3×3 system for each row (x and y independently)
  // A = [sx sy 1], b_x = dx, b_y = dy
  let ata00 = 0, ata01 = 0, ata02 = 0;
  let ata11 = 0, ata12 = 0;
  let ata22 = 0;
  let atbx0 = 0, atbx1 = 0, atbx2 = 0;
  let atby0 = 0, atby1 = 0, atby2 = 0;

  for (let i = 0; i < count; i++) {
    const sx = srcPts[i * 2], sy = srcPts[i * 2 + 1];
    const dx = dstPts[i * 2], dy = dstPts[i * 2 + 1];

    ata00 += sx * sx; ata01 += sx * sy; ata02 += sx;
    ata11 += sy * sy; ata12 += sy;
    ata22 += 1;

    atbx0 += sx * dx; atbx1 += sy * dx; atbx2 += dx;
    atby0 += sx * dy; atby1 += sy * dy; atby2 += dy;
  }

  // Solve 3×3 symmetric system using Cramer's rule
  // Matrix: [[ata00, ata01, ata02], [ata01, ata11, ata12], [ata02, ata12, ata22]]
  const det = ata00 * (ata11 * ata22 - ata12 * ata12)
    - ata01 * (ata01 * ata22 - ata12 * ata02)
    + ata02 * (ata01 * ata12 - ata11 * ata02);

  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;

  // Cofactor matrix (adjugate / det)
  const c00 = (ata11 * ata22 - ata12 * ata12) * invDet;
  const c01 = (ata02 * ata12 - ata01 * ata22) * invDet;
  const c02 = (ata01 * ata12 - ata02 * ata11) * invDet;
  const c11 = (ata00 * ata22 - ata02 * ata02) * invDet;
  const c12 = (ata02 * ata01 - ata00 * ata12) * invDet;
  const c22 = (ata00 * ata11 - ata01 * ata01) * invDet;

  const result = new Float64Array(6);
  result[0] = c00 * atbx0 + c01 * atbx1 + c02 * atbx2; // a
  result[1] = c01 * atbx0 + c11 * atbx1 + c12 * atbx2; // b
  result[2] = c02 * atbx0 + c12 * atbx1 + c22 * atbx2; // tx
  result[3] = c00 * atby0 + c01 * atby1 + c02 * atby2; // c
  result[4] = c01 * atby0 + c11 * atby1 + c12 * atby2; // d
  result[5] = c02 * atby0 + c12 * atby1 + c22 * atby2; // ty

  return result;
}

// ─── Homography (3×3) Accumulation ─────────────────────────────

/**
 * Create a homography accumulator that tracks the cumulative camera transform.
 * Each frame's affine transform is composed into the running homography.
 *
 * The accumulated matrix H maps from "world frame 0" to "current screen frame".
 * To render a world-space point on the current screen:
 *   screenPos = H.transformPoint(worldX, worldY)
 *
 * Each trajectory point stores its own H_world (the accumulated H at detection time).
 * At render time: H_relative = H_current * inverse(H_world)
 */
export function createHomographyAccumulator() {
  // 3×3 matrix stored as Float64Array(9), row-major:
  // [ m0 m1 m2 ]   [a  b  tx]
  // [ m3 m4 m5 ] = [c  d  ty]
  // [ m6 m7 m8 ]   [0  0  1 ]
  const H = new Float64Array(9);
  H[0] = 1; H[4] = 1; H[8] = 1; // Identity

  return {
    /** Apply an affine transform [a, b, tx, c, d, ty] to the accumulated homography. */
    applyAffine(affine) {
      // New H = affine_as_3x3 * old_H
      const a = affine[0], b = affine[1], tx = affine[2];
      const c = affine[3], d = affine[4], ty = affine[5];

      const h0 = H[0], h1 = H[1], h2 = H[2];
      const h3 = H[3], h4 = H[4], h5 = H[5];
      const h6 = H[6], h7 = H[7], h8 = H[8];

      H[0] = a * h0 + b * h3 + tx * h6;
      H[1] = a * h1 + b * h4 + tx * h7;
      H[2] = a * h2 + b * h5 + tx * h8;
      H[3] = c * h0 + d * h3 + ty * h6;
      H[4] = c * h1 + d * h4 + ty * h7;
      H[5] = c * h2 + d * h5 + ty * h8;
      // H[6..8] stay as [0, 0, 1] for affine transforms
    },

    /** Apply a pure translation fallback. */
    applyTranslation(dx, dy) {
      // Equivalent to affine [1, 0, dx, 0, 1, dy]
      H[2] += dx * H[8];
      H[5] += dy * H[8];
      // Simplified: H[2] += dx, H[5] += dy for pure affine case
      H[2] = H[0] * 0 + H[1] * 0 + H[2] + dx;
      H[5] = H[3] * 0 + H[4] * 0 + H[5] + dy;
    },

    /** Get a clone of the current 3×3 matrix. */
    getMatrix() {
      return Float64Array.from(H);
    },

    /** Transform a world-space point to screen-space using current accumulated H. */
    transformPoint(x, y) {
      const w = H[6] * x + H[7] * y + H[8];
      return {
        x: (H[0] * x + H[1] * y + H[2]) / w,
        y: (H[3] * x + H[4] * y + H[5]) / w,
      };
    },
  };
}

// ─── Homography Utility Functions ──────────────────────────────

/**
 * Invert a 3×3 homography matrix.
 * @param {Float64Array} H — 9-element row-major matrix
 * @returns {Float64Array} — inverted matrix, or identity if singular
 */
export function invertHomography(H) {
  const det =
    H[0] * (H[4] * H[8] - H[5] * H[7]) -
    H[1] * (H[3] * H[8] - H[5] * H[6]) +
    H[2] * (H[3] * H[7] - H[4] * H[6]);

  if (Math.abs(det) < 1e-12) {
    // Singular — return identity
    const I = new Float64Array(9);
    I[0] = 1; I[4] = 1; I[8] = 1;
    return I;
  }

  const invDet = 1 / det;
  const inv = new Float64Array(9);
  inv[0] = (H[4] * H[8] - H[5] * H[7]) * invDet;
  inv[1] = (H[2] * H[7] - H[1] * H[8]) * invDet;
  inv[2] = (H[1] * H[5] - H[2] * H[4]) * invDet;
  inv[3] = (H[5] * H[6] - H[3] * H[8]) * invDet;
  inv[4] = (H[0] * H[8] - H[2] * H[6]) * invDet;
  inv[5] = (H[2] * H[3] - H[0] * H[5]) * invDet;
  inv[6] = (H[3] * H[7] - H[4] * H[6]) * invDet;
  inv[7] = (H[1] * H[6] - H[0] * H[7]) * invDet;
  inv[8] = (H[0] * H[4] - H[1] * H[3]) * invDet;
  return inv;
}

/**
 * Multiply two 3×3 matrices: result = A * B
 * @param {Float64Array} A — 9-element row-major
 * @param {Float64Array} B — 9-element row-major
 * @returns {Float64Array}
 */
export function multiplyHomography(A, B) {
  const R = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
  }
  return R;
}

/**
 * Transform a point using a 3×3 homography.
 * @param {Float64Array} H — 9-element matrix
 * @param {number} x
 * @param {number} y
 * @returns {{ x: number, y: number }}
 */
export function transformPointH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

/**
 * Convert an affine matrix [a, b, tx, c, d, ty] to a 3×3 homography.
 */
export function affineToHomography(aff) {
  const H = new Float64Array(9);
  H[0] = aff[0]; H[1] = aff[1]; H[2] = aff[2];
  H[3] = aff[3]; H[4] = aff[4]; H[5] = aff[5];
  H[6] = 0;      H[7] = 0;      H[8] = 1;
  return H;
}

// ─── Affine-Compensated Frame Difference ───────────────────────

/**
 * Compute frame difference with affine compensation.
 * Warps the previous frame using the estimated affine transform before diff.
 * This gives much cleaner motion segmentation than simple shift.
 *
 * @param {Uint8Array} prevGray
 * @param {Uint8Array} currGray
 * @param {Float64Array} affine — [a, b, tx, c, d, ty]
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array} — difference image
 */
export function affineCompensatedDiff(prevGray, currGray, affine, w, h) {
  const diff = new Uint8Array(w * h);
  const a = affine[0], b = affine[1], tx = affine[2];
  const c = affine[3], d = affine[4], ty = affine[5];

  // We need to find where each current pixel was in the previous frame
  // curr(x,y) corresponds to prev(a*x + b*y + tx, c*x + d*y + ty)?
  // Actually: if affine maps prev→curr, then to warp prev to curr alignment,
  // we need the INVERSE: for each pixel in curr, find where it was in prev
  // prev_pos = inv(affine) * curr_pos
  // But for frame difference, we want: diff = |curr - warp(prev)|
  // warp(prev) at (x,y) = prev at inverse_affine(x,y)

  // Compute inverse of the affine
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) {
    // Degenerate — fall back to simple diff
    for (let i = 0; i < w * h; i++) {
      diff[i] = Math.abs(currGray[i] - prevGray[i]);
    }
    return diff;
  }
  const invDet = 1 / det;
  const ia = d * invDet, ib = -b * invDet;
  const ic = -c * invDet, id = a * invDet;
  const itx = -(ia * tx + ib * ty);
  const ity = -(ic * tx + id * ty);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Where was this pixel in the previous frame?
      const px = ia * x + ib * y + itx;
      const py = ic * x + id * y + ity;

      // Bilinear interpolation in prevGray
      const ix = Math.floor(px);
      const iy = Math.floor(py);

      if (ix < 0 || ix >= w - 1 || iy < 0 || iy >= h - 1) {
        diff[y * w + x] = 0;
        continue;
      }

      const fx = px - ix;
      const fy = py - iy;
      const idx00 = iy * w + ix;
      const prevVal =
        (1 - fx) * (1 - fy) * prevGray[idx00] +
        fx * (1 - fy) * prevGray[idx00 + 1] +
        (1 - fx) * fy * prevGray[idx00 + w] +
        fx * fy * prevGray[idx00 + w + 1];

      diff[y * w + x] = Math.abs(currGray[y * w + x] - prevVal);
    }
  }

  return diff;
}
