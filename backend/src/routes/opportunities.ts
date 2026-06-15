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
            // Default view hides SUPPRESS rows (ADR-0005) — EXCEPT ones the user has
            // positively engaged with (SAVED/APPLIED). A user can like a suppressed
            // trap/reject straight from the #8 Traps-Rejects tab: that sets status=SAVED but
            // leaves recommendedAction=SUPPRESS, and the Liked tab reads *this* default view
            // and filters it by status client-side — so without this carve-out the just-liked
            // row would be excluded here before that filter runs and vanish from Liked. The
            // user's lifecycle intent outranks system suppression (mirrors #9's backfill rule,
            // applied here at read time); this also keeps a SAVED row visible if a later
            // Pass-2 reprocess demotes it to SUPPRESS.
            where = or(
                isNull(opportunities.recommendedAction),
                ne(opportunities.recommendedAction, 'SUPPRESS'),
                inArray(opportunities.status, ['SAVED', 'APPLIED']),
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
