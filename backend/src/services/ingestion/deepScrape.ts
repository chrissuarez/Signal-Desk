/**
 * Deep-scrape seam — Pass 2 (issue #11, plan commit 6).
 *
 * Wraps the full job-description scrape that runs for high-potential opportunities,
 * behind an adapter so the pipeline test can substitute a fake. Behaviour identical
 * to today's direct scrapeJobDescription call.
 */

import { scrapeJobDescription, type ScrapedContent } from '../scraperService.js';

export interface DeepScrapeAdapter {
  /** Fetch and extract the full description for a source URL; null when unscrapeable. */
  scrape(url: string): Promise<ScrapedContent | null>;
}

/** HTTP/cheerio-backed Deep-scrape adapter (today's behaviour). */
export const httpDeepScrape: DeepScrapeAdapter = {
  scrape(url) {
    return scrapeJobDescription(url);
  },
};
