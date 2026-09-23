'use client';

// app/athletes/page.tsx
//
// The roster. Everything on this screen reads from and writes to IndexedDB on this device —
// there is no server, no account, and no sync. That is a deliberate privacy decision: the
// data simply has nowhere to leak to.
//
// Layout note: on a laptop this is a genuine two-column page, with the roster taking the wide
// column and "add an athlete" pinned beside it. Below `lg` the columns stack, so a phone gets
// the form first and then the list.
//
// REPLACED 2026-09-23 — Apple's web design system (see app/globals.css, components/ui.tsx).
// The boxed "Add an athlete" form is now a plain block with a hairline top rule instead of a
// rounded, bordered Card — the spec's "no card" rule applies to every panel, not just the
// full-width bands. Restyling only; no copy changed in this pass.

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink, Notice, PageHeader, PageShell } from '@/components/ui';
import { useDeviceData } from '@/components/use-device-data';
import { deleteAthlete, getAthletes, saveAthlete } from '@/lib/storage';
import type { Athlete } from '@/lib/types';

export default function AthletesPage() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const loadAthletes = useCallback(async () => {
    const all = await getAthletes();
    // Alphabetical, and case-insensitive so "alex" doesn't sort below "Zoe".
    all.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return all;
  }, []);

  const { data: athletes, loading, error: storageError, reload: refresh } = useDeviceData(loadAthletes);

  const addAthlete = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError('Enter a name first.');
      return;
    }

    const duplicate = athletes?.some((a) => a.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      // Two athletes with the same name would make it far too easy to record a check against
      // the wrong person's baseline, which would silently invalidate the whole comparison.
      setError(`There is already an athlete called ${trimmed}.`);
      return;
    }

    const athlete: Athlete = {
      id: crypto.randomUUID(),
      name: trimmed,
      baselineId: null,
      checkIds: [],
      // Nobody starts with a practice pass — the first-exposure guard begins locked.
      practiceCompletedAt: null,
    };

    await saveAthlete(athlete);
    setName('');
    setError(null);
    await refresh();
  };

  const removeAthlete = async (id: string) => {
    await deleteAthlete(id);
    setConfirmingDelete(null);
    await refresh();
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Roster"
        title="Athletes"
        subtitle="Each athlete is compared only against their own baseline. Add everyone you cover, then record a baseline for each of them while they are well."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        {/*
          ── The roster ─────────────────────────────────────────────────────────────
          A ruled list: a roster reads as a directory, and a directory is rows on a page.
          Comes first on every screen size, including phones — the moment this page matters
          most is when someone has just been hit and you need to find their name fast.
        */}
        <section aria-labelledby="roster-heading">
          <h2 id="roster-heading" className="sr-only">
            Saved athletes
          </h2>

          {loading && <p className="text-ink-secondary">Loading athletes…</p>}

          {storageError && (
            <Notice tone="loud" title="Could not open on-device storage">
              This browser blocked access to its local database, which can happen in private
              browsing. Athletes cannot be saved until that is allowed.
            </Notice>
          )}

          {!loading && athletes?.length === 0 && (
            <Notice title="No athletes yet">
              Add your first athlete using the form. Nothing is uploaded anywhere — everything
              stays in this browser, on this device.
            </Notice>
          )}

          <ul className="divide-y divide-hairline border-t border-hairline">
            {athletes?.map((athlete) => (
              <li key={athlete.id} className="py-5">
                <div className="sm:flex sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/athletes/${athlete.id}`}
                      className="text-title font-semibold text-ink hover:text-link"
                    >
                      {athlete.name} <span aria-hidden="true">›</span>
                    </Link>
                    <p className="mt-1 text-meta text-ink-secondary">
                      {athlete.baselineId ? 'Baseline recorded' : 'No baseline yet'}
                      {' · '}
                      {athlete.checkIds.length}{' '}
                      {athlete.checkIds.length === 1 ? 'check' : 'checks'}
                    </p>
                  </div>

                  <div className="mt-4 flex shrink-0 gap-2 sm:mt-0">
                    <ButtonLink
                      href={`/athletes/${athlete.id}`}
                      className="!min-h-11 !px-4 !text-body"
                    >
                      Open
                    </ButtonLink>
                  </div>
                </div>

                {/*
                  Deleting an athlete also deletes all of their results, and there is no
                  server-side copy to restore from — so it asks first, inline.
                */}
                {confirmingDelete === athlete.id ? (
                  <div className="mt-4 rounded-lg border border-ink p-4">
                    <p className="text-meta font-semibold text-ink">
                      Delete {athlete.name} and all of their recorded results? This cannot be
                      undone.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="primary"
                        onClick={() => void removeAthlete(athlete.id)}
                      >
                        Delete permanently
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmingDelete(null)}
                      >
                        Keep
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(athlete.id)}
                    className="mt-3 text-meta font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink"
                  >
                    Delete {athlete.name}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Add an athlete ─────────────────────────────────────────────────────── */}
        <section aria-labelledby="add-heading" className="lg:sticky lg:top-6">
          <div className="border-t border-hairline pt-6">
            <h2 id="add-heading" className="text-title font-semibold text-ink">
              Add an athlete
            </h2>
            <form onSubmit={addAthlete} className="mt-4">
              <label htmlFor="athlete-name" className="block text-meta font-semibold text-ink">
                Name
              </label>
              <input
                id="athlete-name"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                autoComplete="off"
                placeholder="e.g. Jordan Reyes"
                // Full ink-secondary colour rather than a faded version of it: at reduced
                // opacity this fell below the 4.5:1 contrast floor, which matters most in the
                // bright sunlight this gets used in.
                className="mt-2 min-h-11 w-full rounded-lg border border-hairline bg-canvas px-4 text-title text-ink placeholder:text-ink-secondary focus:border-ink"
              />
              {error && (
                <p role="alert" className="mt-2 text-meta font-semibold text-ink">
                  {error}
                </p>
              )}
              <Button type="submit" className="mt-4 w-full">
                Add athlete
              </Button>
            </form>

            <p className="mt-4 text-meta text-ink-secondary">
              Names are stored only in this browser. Use whatever your team already uses — a
              first name and last initial is plenty.
            </p>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
