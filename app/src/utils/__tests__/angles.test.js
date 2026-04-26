/**
 * A4: Unit Tests — angles.js
 * ===========================
 * Testar calculateAllAngles() och de biomechaniska beräkningsfunktionerna.
 * Dessa är kritiska — felaktiga vinklar ger direkt felaktig coaching.
 */

import { describe, it, expect } from 'vitest';
import { calculateAllAngles } from '../angles.js';


// ─── Helpers ──────────────────────────────────────────────────

/**
 * Skapar en minimal uppsättning av 33 landmarks för testning.
 * Alla punkter är vid origo med full visibility om inget annat anges.
 */
function makeLandmarks(overrides = {}) {
  const base = Array.from({ length: 33 }, (_, i) => ({
    x: 0, y: 0, z: 0, visibility: 1.0,
  }));
  for (const [idx, vals] of Object.entries(overrides)) {
    base[Number(idx)] = { ...base[Number(idx)], ...vals };
  }
  return base;
}

// ─── calculateAllAngles ───────────────────────────────────────

describe('calculateAllAngles', () => {

  it('returnerar null vid null input', () => {
    expect(calculateAllAngles(null)).toBeNull();
  });

  it('returnerar null om färre än 33 landmarks', () => {
    expect(calculateAllAngles([{ x: 0, y: 0, z: 0 }])).toBeNull();
  });

  it('returnerar ett objekt med alla förväntade nycklar', () => {
    const lm = makeLandmarks();
    const result = calculateAllAngles(lm);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('spineTilt');
    expect(result).toHaveProperty('shoulderRotation');
    expect(result).toHaveProperty('hipTilt');
    expect(result).toHaveProperty('leadingKnee');
    expect(result).toHaveProperty('trailingKnee');
    expect(result).toHaveProperty('xFactor');
    expect(result).toHaveProperty('headOffset');
    expect(result).toHaveProperty('leadArmExtension');
  });

  it('varje mätvärde har value, status och confidence', () => {
    const lm = makeLandmarks();
    const result = calculateAllAngles(lm);
    for (const key of Object.keys(result)) {
      expect(result[key]).toHaveProperty('value');
      expect(result[key]).toHaveProperty('status');
      expect(result[key]).toHaveProperty('confidence');
      expect(['good', 'warning', 'poor']).toContain(result[key].status);
    }
  });

  it('confidence är alltid i intervallet 0-1', () => {
    const lm = makeLandmarks();
    const result = calculateAllAngles(lm);
    for (const key of Object.keys(result)) {
      expect(result[key].confidence).toBeGreaterThanOrEqual(0);
      expect(result[key].confidence).toBeLessThanOrEqual(1);
    }
  });

  it('spineTilt: rakt upprätt skelett ger låg lutning', () => {
    // Axlar direkt OVANFÖR höfter: y = -0.5 (screen up) för axlar, y = 0 för höfter
    // -> vertikal vektor från midHöft till midAxel -> spineTilt nära 0
    const lm = makeLandmarks({
      11: { x: -0.2, y: -0.5, z: 0 }, // vänster axel
      12: { x:  0.2, y: -0.5, z: 0 }, // höger axel
      23: { x: -0.1, y:  0.0, z: 0 }, // vänster höft
      24: { x:  0.1, y:  0.0, z: 0 }, // höger höft
    });
    const result = calculateAllAngles(lm);
    expect(result.spineTilt.value).toBeLessThan(20);
  });

  it('leadArmExtension: rak arm ger ~180 grader', () => {
    // Axel → armbåge → handled på en rak linje
    const lm = makeLandmarks({
      11: { x: 0.0, y: 0.3, z: 0 },  // vänster axel
      13: { x: 0.0, y: 0.0, z: 0 },  // vänster armbåge
      15: { x: 0.0, y: -0.3, z: 0 }, // vänster handled
    });
    const result = calculateAllAngles(lm);
    // Rak arm → ~180°
    expect(result.leadArmExtension.value).toBeGreaterThan(170);
  });

  it('leadArmExtension: böjd arm ger lägre vinkel', () => {
    const lm = makeLandmarks({
      11: { x: 0.0, y: 0.3, z: 0 },
      13: { x: 0.2, y: 0.0, z: 0 }, // armbåge åt sidan
      15: { x: 0.0, y: -0.3, z: 0 },
    });
    const result = calculateAllAngles(lm);
    expect(result.leadArmExtension.value).toBeLessThan(170);
  });

  it('xFactor: när axlar och höfter har samma vinkel är xFactor ~0', () => {
    // Alla landmarks parallella — ingen X-faktor
    const lm = makeLandmarks({
      11: { x: -0.2, y: 0.5, z: 0 },
      12: { x:  0.2, y: 0.5, z: 0 },
      23: { x: -0.2, y: 0.0, z: 0 },
      24: { x:  0.2, y: 0.0, z: 0 },
    });
    const result = calculateAllAngles(lm);
    expect(result.xFactor.value).toBeLessThan(10);
  });

  it('headOffset: huvud centrerat ger lågt offset-värde', () => {
    const lm = makeLandmarks({
      0:  { x: 0.0, y: 0.8, z: 0 }, // näsa centrerat
      23: { x: -0.1, y: 0.0, z: 0 },
      24: { x:  0.1, y: 0.0, z: 0 },
    });
    const result = calculateAllAngles(lm);
    // Huvud centrerat → headOffset nära 0
    expect(result.headOffset.value).toBeLessThan(5);
  });

  it('headOffset status "poor" vid stort offset', () => {
    const lm = makeLandmarks({
      0:  { x: 0.5, y: 0.8, z: 0 }, // huvud långt åt sidan
      23: { x: -0.1, y: 0.0, z: 0 },
      24: { x:  0.1, y: 0.0, z: 0 },
    });
    const result = calculateAllAngles(lm);
    expect(result.headOffset.status).toBe('poor');
  });

  it('hanterar landmarks utan z-värden (2D-läge)', () => {
    const lm = makeLandmarks();
    // Ta bort z från alla landmarks
    lm.forEach(point => delete point.z);
    const result = calculateAllAngles(lm);
    expect(result).not.toBeNull();
    // Ska inte krascha utan z
    for (const key of Object.keys(result)) {
      expect(typeof result[key].value).toBe('number');
      expect(isNaN(result[key].value)).toBe(false);
    }
  });
});
