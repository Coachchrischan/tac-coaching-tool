// The email-the-week dialogue, extracted from ProgrammingTab (split step 2).
// Nothing sends from here: the tool prepares the compose window, Chris sends.

import { useState } from 'react';
import type { Coach } from '../../types/documents';
import { gmailComposeUrl, looksLikeEmail } from '../../lib/weekEmail';

/** Icon button with a label that slides out on hover/focus. */
/**
 * Pick who gets this week's programming and open a Gmail compose window with
 * it filled in. Nothing sends from here: the same rule as the TrainHeroic
 * push, the tool prepares it and Chris presses send.
 */
export default function EmailWeekPanel({
  coaches,
  subject,
  body,
  onClose,
}: {
  coaches: Coach[];
  subject: string;
  body: string;
  onClose: () => void;
}) {
  const withEmail = coaches.filter((c) => c.email && looksLikeEmail(c.email));
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [copied, setCopied] = useState(false);

  const extras = extra
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const badExtras = extras.filter((e) => !looksLikeEmail(e));
  const to = [
    ...withEmail.filter((c) => picked.includes(c.id)).map((c) => c.email as string),
    ...extras.filter(looksLikeEmail),
  ];

  async function openCompose() {
    const { url, viaClipboard } = gmailComposeUrl(to, subject, body);
    if (viaClipboard) {
      try {
        await navigator.clipboard.writeText(body);
        setCopied(true);
      } catch {
        // Clipboard can be blocked; the preview below is still selectable.
      }
    }
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-ink-950/40 p-6">
      <section className="mt-12 w-full max-w-2xl rounded-xl border border-ink-200 bg-white p-5 shadow-lg">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-xl text-ink-950">Email this week's programming</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-medium text-ink-500 hover:text-ink-950"
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-[12px] text-ink-500">
          Opens a Gmail compose window with this filled in. Nothing is sent until you send it.
        </p>

        <div className="mt-3">
          <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
            Coaches
          </span>
          {withEmail.length === 0 ? (
            <p className="mt-1 text-[13px] text-ink-500">
              No coach has an email address yet. Add them in Schedule, under Classes, coaches and
              rooms.
            </p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {withEmail.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-1.5 text-[13px] text-ink-700">
                    <input
                      type="checkbox"
                      checked={picked.includes(c.id)}
                      onChange={(e) =>
                        setPicked((p) =>
                          e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="mt-3 block">
          <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
            Anyone else
          </span>
          <input
            className="mt-0.5 w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
            placeholder="another@address.com, and@another.com"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
          {badExtras.length > 0 && (
            <span className="mt-0.5 block text-[12px] text-amber-600">
              Not a valid address, and will be left off: {badExtras.join(', ')}
            </span>
          )}
        </label>

        <details className="mt-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-ink-500">
            What gets sent ({subject})
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-800">
            {body}
          </pre>
        </details>

        {copied && (
          <p className="mt-2 text-[12px] text-accent-700">
            The week is on your clipboard. If Gmail opened with an empty body, the programming was
            too long for the compose link; paste it in before sending.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={to.length === 0}
            onClick={openCompose}
            className="rounded-md bg-ink-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open in Gmail
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(body).then(() => setCopied(true));
            }}
            className="rounded-md border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
            title="Copy the whole week as plain text, for any email client or WhatsApp"
          >
            Copy as text
          </button>
          <span className="text-[12px] text-ink-500">
            {to.length === 0
              ? 'Pick at least one recipient.'
              : `To ${to.length} recipient${to.length === 1 ? '' : 's'}.`}
          </span>
        </div>
      </section>
    </div>
  );
}

/** Gmail's envelope, in the TAC palette rather than Google's red. */
export function GmailIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <path
        d="M5 8.5v7.2c0 .4.3.8.8.8h1.9V11l4.3 3.2L16.3 11v5.5h1.9c.4 0 .8-.3.8-.8V8.5c0-1-1.2-1.6-2-1L12 11 7 7.5c-.8-.6-2 0-2 1Z"
        fill="#DEC5AE"
      />
    </svg>
  );
}

