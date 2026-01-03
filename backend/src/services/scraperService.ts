import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ScrapedContent {
    title: string;
    description: string;
    url: string;
}

export const scrapeJobDescription = async (url: string): Promise<ScrapedContent | null> => {
    if (!url || !url.startsWith('http')) return null;

    try {
        console.log(`Scraping job URL: ${url}`);
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            },
            timeout: 10000,
        });

        const $ = cheerio.load(data);

        // Basic heuristic: look for common job description containers
        // This is a "best effort" scraper. 
        // LinkedIn and others often obscure this, but many ATS (Greenhouse, Lever, etc) are easy.

        let title = $('title').text().trim();

        // Strategy: extract text from major semantic tags
        $('script, style, nav, footer, header').remove();

        // Look for main content areas
        const mainContent = $('main, #content, .job-description, .description, [role="main"]').text().trim();
        const bodyContent = $('body').text().trim();

        const description = mainContent.length > 200 ? mainContent : bodyContent;

        return {
            title,
            description: description.substring(0, 5000), // Cap for AI safety
            url
        };
    } catch (error) {
        console.warn(`Scraping failed for ${url}:`, (error as Error).message);
        return null;
    }
};
