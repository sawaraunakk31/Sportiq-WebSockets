import { eq } from 'drizzle-orm';
import { db, pool } from './db/db.js';
import { matches, commentary } from './db/schema.js';

async function main() {
  try {
    console.log('Performing Sports App operations...');

    // CREATE: Insert a new match
    const [newMatch] = await db
      .insert(matches)
      .values({
        sport: 'Soccer',
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        status: 'scheduled',
        startTime: new Date(Date.now() + 3600 * 1000), // 1 hour from now
      })
      .returning();

    console.log('✅ MATCH CREATED:', newMatch);

    // UPDATE: Start the match
    const [liveMatch] = await db
      .update(matches)
      .set({ status: 'live', startTime: new Date() })
      .where(eq(matches.id, newMatch.id))
      .returning();

    console.log('✅ MATCH STARTED:', liveMatch);

    // CREATE: Add commentary
    const [newCommentary] = await db
      .insert(commentary)
      .values({
        matchId: liveMatch.id,
        minute: 1,
        sequence: 1,
        period: '1st Half',
        eventType: 'Kickoff',
        message: 'The match has started!',
        team: 'Real Madrid',
      })
      .returning();

    console.log('✅ COMMENTARY ADDED:', newCommentary);

    // READ: Get match with commentary
    // READ: Get match
    const match = await db.select().from(matches).where(eq(matches.id, liveMatch.id));
    
    // READ: Get commentaries
    const commentaries = await db.select().from(commentary).where(eq(commentary.matchId, liveMatch.id));

    const matchWithCommentary = {
        ...match[0],
        commentaries: commentaries
    };

    console.log('✅ READ MATCH WITH COMMENTARY:', JSON.stringify(matchWithCommentary, null, 2));

  } catch (error) {
    console.error('❌ Error performing operations:', error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('Database pool closed.');
    }
  }
}

main();