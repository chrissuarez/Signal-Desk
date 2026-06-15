import type { Opportunity } from '../types.js';
import { db } from '../db/index.js';
import { opportunities, feedback } from '../db/schema.js';
import { desc, eq, ne, or, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { parseOpportunityFilter } from './opportunityFilter.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        // The dashboard's strategic filter tabs (#8) pass `?category=`/`?action=`. Parse +
        // validate them into a normalized filter (junk dropped) before touching the query.
        const filter = parseOpportunityFilter(req.query.category, req.query.action);

        // ADR-0005 (#13): route on the system's recommendedAction — hide SUPPRESS rows
        // from the *default* view (kept, never deleted) and float ALERT rows to the top.
        // ADR-0001 (#4): the Strategic Score is the ranking authority — order by it (not
        // the Fit Score), with un-scored rows last, then recency as the tiebreak.
        // (Null/legacy rows are treated as not-suppressed.)
        //
        // #8: when a filter tab is active the explicit selection takes over — category and
        // action combine with OR (so "Needs Review" gathers GENERIC_OPS_UNCLEAR *and*
        // DIGEST in one tab), and the default SUPPRESS-hide is bypassed so the
        // Traps-Rejects tab can reveal the otherwise-hidden trap/reject rows for audit.
        let where: SQL | undefined;
        if (filter.hasFilter) {
            const clauses: SQL[] = [];
            if (filter.categories.length > 0) {
                clauses.push(inArray(opportunities.strategicCategory, filter.categories));
            }
            if (filter.actions.length > 0) {
                clauses.push(inArray(opportunities.recommendedAction, filter.actions));
            }
            where = clauses.length === 1 ? clauses[0] : or(...clauses);
        } else {
            where = or(
                isNull(opportunities.recommendedAction),
                ne(opportunities.recommendedAction, 'SUPPRESS'),
            );
        }

        const items = await db.query.opportunities.findMany({
            where,
            orderBy: [
                desc(sql`${opportunities.recommendedAction} = 'ALERT'`),
                sql`${opportunities.strategicScore} DESC NULLS LAST`,
                desc(opportunities.receivedAt),
            ],
        });
        console.log(`Fetched ${items.length} opportunities for display.`);
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
});

router.post('/:id/feedback', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body;

    try {
        const opportunityId = parseInt(id);

        // 1. Record the feedback event
        await db.insert(feedback).values({
            opportunityId,
            action: action as any,
        });

        // 2. Update the opportunity status
        const statusMap: Record<string, any> = {
            'LIKE': 'SAVED',
            'DISLIKE': 'DISMISSED',
            'APPLIED': 'APPLIED',
        };

        if (statusMap[action]) {
            await db.update(opportunities)
                .set({ status: statusMap[action] })
                .where(eq(opportunities.id, opportunityId));
        }

        res.json({ message: 'Feedback recorded and status updated' });
    } catch (error) {
        console.error('Feedback error:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

export default router;
