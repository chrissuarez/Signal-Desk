export const sendImmediateAlert = async (opportunity: any) => {
    console.log('--- IMMEDIATE ALERT ---');
    console.log(`New High-Fit Opportunity Found!`);
    console.log(`Title: ${opportunity.title}`);
    console.log(`Company: ${opportunity.company}`);
    console.log(`Fit Score: ${opportunity.fitScore}`);
    console.log(`Reasons: ${opportunity.reasons.join(', ')}`);
    console.log('------------------------');

    // In v1, this could be an email, Slack webhook, or push notification
    // For now, we log it to console as a delivered alert.
};

export const sendDailyDigest = async (opportunities: any[]) => {
    console.log('--- DAILY DIGEST ---');
    console.log(`You have ${opportunities.length} new medium-fit opportunities to review.`);
    opportunities.forEach(opp => {
        console.log(`- ${opp.title} @ ${opp.company} (Score: ${opp.fitScore})`);
    });
    console.log('--------------------');
};
