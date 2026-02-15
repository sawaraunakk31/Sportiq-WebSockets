import { Router } from "express";
import { createMatchSchema, listMatchesQuerySchema } from "../validation/match.js";
import { db } from "../db/db.js";
import { matches } from "../db/schema.js";
import { getMatchStatus } from "../utils/match-status.js";
import { desc } from "drizzle-orm";

export const matchRouter = Router();
const MATCH_LIMIT=100;

matchRouter.get('/',async (req, res) => {
    const parsed=listMatchesQuerySchema.safeParse(req.query);

    if(!parsed.success){
        return res.status(400).json({message:'Invalid request payload',details:parsed.error.issues});
    }

    const limit=Math.min(parsed.data.limit??50,MATCH_LIMIT);

    try {
        const events=await db.select().from(matches).limit(limit).orderBy(desc(matches.createdAt));
        res.json({data: events});
    } catch (e) {
        res.status(500).json({message:'Failed to fetch matches'});
    }
});

matchRouter.post('/',async(req,res)=>{
    const parsed=createMatchSchema.safeParse(req.body);
    if(!parsed.success){
        return res.status(400).json({message:'Invalid request payload',details:parsed.error.issues});
    }
    const { data: {startTime,endTime,homeScore,awayScore} }=parsed;
    try {
        const [event]=await db.insert(matches).values({
            ...parsed.data,
            startTime:new Date(startTime),
            endTime:new Date(endTime),
            homeScore:homeScore ?? 0,
            awayScore:awayScore ?? 0,
            status:getMatchStatus(startTime,endTime),
        }).returning();

        if(res.app.locals.broadcastMatchCreated){
            res.app.locals.broadcastMatchCreated(event);
        }
        res.status(201).json({data: event});
    } catch (e) {
        res.status(500).json({message:'Failed to create match'});
    }
})