/**
 * A3: Unit Tests — validateResponse.js
 * =====================================
 * Täcker de kritiska valideringsfunktionerna som skyddar appen
 * mot malformat AI-output. Dessa tester är HÖGST PRIORITERADE
 * eftersom validateResponse är sista försvarslinjen mot kraschar.
 */

import { describe, it, expect } from 'vitest';
import { validatePositionResponse, validateMotionResponse } from '../validateResponse.js';

// ─── validatePositionResponse ─────────────────────────────────

describe('validatePositionResponse', () => {

  describe('totalScore', () => {
    it('klampar score > 100 till 100', () => {
      const result = validatePositionResponse({ totalScore: 150, categories: [] });
      expect(result.totalScore).toBe(100);
    });

    it('klampar score < 0 till 0', () => {
      const result = validatePositionResponse({ totalScore: -20, categories: [] });
      expect(result.totalScore).toBe(0);
    });

    it('sätter 0 om score saknas', () => {
      const result = validatePositionResponse({ categories: [] });
      expect(result.totalScore).toBe(0);
    });

    it('avrundar decimaler', () => {
      const result = validatePositionResponse({ totalScore: 72.9, categories: [] });
      expect(result.totalScore).toBe(73);
    });

    it('sätter 0 vid NaN', () => {
      const result = validatePositionResponse({ totalScore: NaN, categories: [] });
      expect(result.totalScore).toBe(0);
    });
  });

  describe('categories', () => {
    it('sätter tom array om categories saknas', () => {
      const result = validatePositionResponse({ totalScore: 50 });
      expect(result.categories).toEqual([]);
    });

    it('sätter status "correct" vid score >= 70', () => {
      const result = validatePositionResponse({
        totalScore: 75,
        categories: [{ name: 'Setup', score: 75 }],
      });
      expect(result.categories[0].status).toBe('correct');
    });

    it('sätter status "improve" vid score < 70', () => {
      const result = validatePositionResponse({
        totalScore: 50,
        categories: [{ name: 'Impact', score: 60 }],
      });
      expect(result.categories[0].status).toBe('improve');
    });

    it('klampar category score till 0-100', () => {
      const result = validatePositionResponse({
        totalScore: 50,
        categories: [{ name: 'Finish', score: 999 }],
      });
      expect(result.categories[0].score).toBe(100);
    });

    it('sätter tom array för tips om det saknas', () => {
      const result = validatePositionResponse({
        totalScore: 50,
        categories: [{ name: 'Setup', score: 80, tips: null }],
      });
      expect(result.categories[0].tips).toEqual([]);
    });

    it('sätter "Unknown" som namn om name saknas', () => {
      const result = validatePositionResponse({
        totalScore: 50,
        categories: [{ score: 80 }],
      });
      expect(result.categories[0].name).toBe('Unknown');
    });
  });

  describe('faultsDetected', () => {
    it('sätter tom array om faultsDetected saknas', () => {
      const result = validatePositionResponse({ totalScore: 50, categories: [] });
      expect(result.faultsDetected).toEqual([]);
    });

    it('behåller befintliga faults', () => {
      const faults = [{ id: 'early_extension', confidence: 0.9 }];
      const result = validatePositionResponse({ totalScore: 50, categories: [], faultsDetected: faults });
      expect(result.faultsDetected).toHaveLength(1);
      expect(result.faultsDetected[0].id).toBe('early_extension');
    });
  });

  describe('biomechanics', () => {
    it('sätter tomt objekt om biomechanics saknas', () => {
      const result = validatePositionResponse({ totalScore: 50, categories: [] });
      expect(result.biomechanics).toEqual({});
    });

    it('nullar icke-numeriska biomechanics-värden', () => {
      const result = validatePositionResponse({
        totalScore: 50,
        categories: [],
        biomechanics: { tempoRatio: 'snabb', xFactor: 45 },
      });
      expect(result.biomechanics.tempoRatio).toBeNull();
      expect(result.biomechanics.xFactor).toBe(45);
    });
  });

  describe('felhantering', () => {
    it('kastar fel vid null-input', () => {
      expect(() => validatePositionResponse(null)).toThrow('AI returned empty or non-object response');
    });

    it('kastar fel vid string-input', () => {
      expect(() => validatePositionResponse('{"totalScore": 50}')).toThrow();
    });
  });
});

// ─── validateMotionResponse ───────────────────────────────────

describe('validateMotionResponse', () => {

  it('klampar overallMotionGrade > 100 till 100', () => {
    const result = validateMotionResponse({ overallMotionGrade: 150, keyMotionFaults: [] });
    expect(result.overallMotionGrade).toBe(100);
  });

  it('sätter 50 som default om overallMotionGrade saknas', () => {
    const result = validateMotionResponse({ keyMotionFaults: [] });
    expect(result.overallMotionGrade).toBe(50);
  });

  it('nullar tempoRatio vid non-numeric värde', () => {
    const result = validateMotionResponse({ overallMotionGrade: 70, keyMotionFaults: [], tempoRatio: 'snabbt' });
    expect(result.tempoRatio).toBeNull();
  });

  it('behåller giltigt tempoRatio', () => {
    const result = validateMotionResponse({ overallMotionGrade: 70, keyMotionFaults: [], tempoRatio: 3.1 });
    expect(result.tempoRatio).toBe(3.1);
  });

  it('sätter tom array om keyMotionFaults saknas', () => {
    const result = validateMotionResponse({ overallMotionGrade: 70 });
    expect(result.keyMotionFaults).toEqual([]);
  });

  it('castingDetected är alltid boolean', () => {
    const result = validateMotionResponse({ overallMotionGrade: 70, keyMotionFaults: [], castingDetected: 1 });
    expect(typeof result.castingDetected).toBe('boolean');
    expect(result.castingDetected).toBe(true);
  });

  it('kastar fel vid null-input', () => {
    expect(() => validateMotionResponse(null)).toThrow();
  });
});
