import { Router } from "express";
import { createCommentarySchema, listCommentaryQuerySchema } from "../validation/commentary.js";
import { matchIdParamSchema } from "../validation/match.js";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

commentaryRouter.get('/', async (req, res) => {
    // Validate match ID from params
    const paramsValidation = matchIdParamSchema.safeParse(req.params);
    if (!paramsValidation.success) {
        return res.status(400).json({
            message: 'Invalid match ID',
            details: JSON.stringify(paramsValidation.error)
        });
    }

    // Validate query parameters
    const queryValidation = listCommentaryQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
        return res.status(400).json({
            message: 'Invalid query parameters',
            details: JSON.stringify(queryValidation.error)
        });
    }

    const { id: matchId } = paramsValidation.data;
    const limit = Math.min(queryValidation.data.limit ?? 100, MAX_LIMIT);

    try {
        const results = await db
            .select()
            .from(commentary)
            .where(eq(commentary.matchId, matchId))
            .orderBy(desc(commentary.createdAt))
            .limit(limit);

        res.status(200).json({ data: results });
    } catch (e) {
        console.error('Failed to fetch commentary:', e);
        res.status(500).json({
            message: 'Failed to fetch commentary',
            details: JSON.stringify(e)
        });
    }
});

commentaryRouter.post('/', async (req, res) => {
    // Validate match ID from params
    const paramsValidation = matchIdParamSchema.safeParse(req.params);
    if (!paramsValidation.success) {
        return res.status(400).json({
            message: 'Invalid match ID',
            details: JSON.stringify(paramsValidation.error)
        });
    }

    // Validate commentary data from body
    const bodyValidation = createCommentarySchema.safeParse(req.body);
    if (!bodyValidation.success) {
        return res.status(400).json({
            message: 'Invalid commentary data',
            details: JSON.stringify(bodyValidation.error)
        });
    }
    try {
        const { minutes, ...rest } = bodyValidation.data;
        const [result] = await db.insert(commentary).values({
            matchId: paramsValidation.data.id,
            minutes,
            ...rest
        })
            .returning();
        if(res.app.locals.broadcastCommentary){
            res.app.locals.broadcastCommentary(result.matchId,result);
        }
        res.status(201).json({ data: result });
    } catch (e) {
        console.error('Failed to create commentary:', e);
        res.status(500).json({
            message: 'Failed to create commentary',
            details: JSON.stringify(e)
        });
    }
});
