import { z } from 'zod';

export const challengeSchema = z.object({
  frames: z.array(z.object({
    phase: z.string(),
    base64: z.string()
  })).min(1, "Missing frames").max(16, "Too many frames"),
  challengeId: z.string().min(1, "Missing challengeId"),
  language: z.enum(['sv', 'en']).default('sv')
});

export const analyzeSchema = z.object({
  cameraAngle: z.string().default('auto'),
  language: z.enum(['sv', 'en']).default('sv'),
  guestMode: z.string().optional().transform((val) => val === 'true').default('false'),
  knowledgeBase: z.string().optional().default(''),
  coachingProfile: z.string().optional().default(''),
  coachingHistory: z.string().optional().default(''),
  tier: z.enum(['basic', 'premium']).default('basic'),
  video: z.string().optional(),
  frames: z.preprocess((val) => {
    if (typeof val === 'string' && val) {
      try { return JSON.parse(val); } catch (e) { return []; }
    }
    return val || [];
  }, z.array(z.object({
    phase: z.string().min(1),
    base64: z.string().min(1)
  })).max(16)),
  sequencing: z.preprocess((val) => {
    if (typeof val === 'string' && val) {
      try { return JSON.parse(val); } catch (e) { return null; }
    }
    return val || null;
  }, z.any().nullable().optional())
});

export const validateRequest = (schema) => (req, res, next) => {
  try {
    const parsedBody = schema.parse(req.body);
    // Replace req.body with the parsed (and transformed) data
    req.body = parsedBody;
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }
    next(err);
  }
};
