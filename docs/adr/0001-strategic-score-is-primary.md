# Strategic Score replaces Fit Score as the ranking and alerting authority

Signal Desk's existing `fitScore` (`calculateFitScore`) is a deterministic keyword/industry/location adder that rewards Chris's historic SEO keywords — exactly the bias the strategic-targeting work exists to remove. We decided the new **Strategic Score** becomes the primary number that sorts the dashboard and drives `recommendedAction`; `fitScore` is demoted to a secondary signal / back-compat display rather than deleted.

We rejected keeping both as co-equal (the list still sorts by *something*, and if that stays `fitScore` nothing changes) and blending them into one number (muddies both signals and hides *why* a role ranks where it does). The cost of this decision is real: ranking, alerting tiers, and the dashboard's default sort all rewire around a score that doesn't exist yet, so a regression here changes which roles Chris ever sees.
