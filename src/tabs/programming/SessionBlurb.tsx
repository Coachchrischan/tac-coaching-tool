import { useState } from 'react';
import type { LibraryOverridesDoc, Session } from '../../types/documents';
import type { LibraryExercise } from '../../lib/library';
import { generateBlurb } from '../../lib/blurb';

export default function SessionBlurb({
  session,
  library,
  overrides,
  onSetOverride,
}: {
  session: Session;
  library: LibraryExercise[];
  overrides: LibraryOverridesDoc;
  onSetOverride: (text: string | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const generated = generateBlurb(session, library, overrides);
  const text = session.blurbOverride ?? generated;

  return (
    <section className="rounded-xl border border-ink-200 bg-ink-950 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wide text-sand-500 uppercase">
          Coaching cues {session.blurbOverride ? '(edited)' : '(generated)'}
        </h3>
        <div className="flex gap-2">
          {session.blurbOverride !== undefined && (
            <button
              type="button"
              onClick={() => {
                onSetOverride(undefined);
                setEditing(false);
              }}
              className="rounded border border-ink-700 px-2 py-0.5 text-xs font-medium text-ink-300 hover:text-white"
            >
              Regenerate
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded border border-ink-700 px-2 py-0.5 text-xs font-medium text-ink-300 hover:text-white"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          className="mt-2 w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm leading-relaxed text-white focus:border-accent-500 focus:outline-none"
          rows={4}
          value={text}
          onChange={(e) => onSetOverride(e.target.value)}
        />
      ) : (
        <p className="mt-2 text-[15px] leading-relaxed font-medium text-[#F5F3EB]">{text}</p>
      )}
    </section>
  );
}
