/**
 * Intake seam (issue #11, plan commit 4).
 *
 * Wraps Gmail listing + content fetch + Subject/From header parsing into an adapter
 * that yields normalized RawSource digests. The Gmail-backed adapter preserves today's
 * behaviour; commit 12's pipeline test supplies a fake source list implementing the
 * same interface. The header parsing is factored into a pure, unit-tested helper.
 */

import { listMessages, getMessageContent } from '../gmailIngestion.js';
import type { RawSource } from './types.js';

export interface GmailHeader {
  name?: string | null;
  value?: string | null;
}

/** Pure: resolve a Gmail header value by name, falling back when absent. */
export const parseHeaderValue = (
  headers: GmailHeader[] | undefined,
  name: string,
  fallback: string,
): string => headers?.find((h) => h.name === name)?.value || fallback;

export interface IntakeAdapter {
  /** List up to `limit` messages under `label` and normalize each to a RawSource. */
  fetchSources(label: string, limit: number): Promise<RawSource[]>;
}

/** Gmail-backed Intake adapter (today's behaviour, verbatim). */
export const gmailIntake: IntakeAdapter = {
  async fetchSources(label, limit) {
    const messages = await listMessages(label, Math.ceil(limit / 50));
    const messagesToProcess = messages.slice(0, limit);
    if (messages.length === 0) {
      console.log('No messages found to process. Check your GMAIL_LABEL or if emails are arriving.');
    } else {
      console.log(`Found ${messages.length} messages. Processing up to ${limit}.`);
    }

    const sources: RawSource[] = [];
    for (const msg of messagesToProcess) {
      if (!msg.id) continue;

      const content = (await getMessageContent(msg.id)) as any;
      const headers = content.payload?.headers as GmailHeader[] | undefined;
      sources.push({
        messageId: msg.id,
        subject: parseHeaderValue(headers, 'Subject', 'No Subject'),
        from: parseHeaderValue(headers, 'From', 'Unknown'),
        body: content.fullBody || content.snippet || '',
        internalDate: content.internalDate ?? undefined,
      });
    }
    return sources;
  },
};
