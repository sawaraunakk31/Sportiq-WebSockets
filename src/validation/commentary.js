import { z } from 'zod';

// List commentary query schema
export const listCommentaryQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(100).optional(),
});

// Create commentary schema
export const createCommentarySchema = z.object({
    minutes: z.coerce.number().int().nonnegative(),
    sequence: z.coerce.number().int().optional(),
    period: z.string().optional(),
    eventType: z.string().optional(),
    actor: z.string().optional(),
    team: z.string().optional(),
    message: z.string().min(1, 'Message is required'),
    metadata: z.record(z.string(), z.any()).optional(),
    tags: z.array(z.string()).optional(),
});
