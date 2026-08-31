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

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink, Card, Notice, PageHeader, PageShell } from '@/components/ui';
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
        title="Athletes"
        subtitle="Each athlete is compared only against their own baseline. Add everyone you cover, then record a baseline for each of them while they are well."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        {/* ── The roster ─────────────────────────────────────────────────────────── */}
        {/*
          The roster comes first on every screen size, including phones. The moment this page
          matters most is when someone has just been hit and you need to find their name fast —
          making them scroll past a "add an athlete" form to get there would be exactly wrong.
        */}
        <section aria-labelledby="roster-heading">
          <h2 id="roster-heading" className="sr-only">
            Saved athletes
          </h2>

          {loading && <p className="text-ink-soft">Loading athletes…</p>}

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

          <ul className="space-y-3">
            {athletes?.map((athlete) => (
              <li key={athlete.id}>
                <Card>
                  <div className="sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`/athletes/${athlete.id}`}
                        className="text-title font-bold text-ink underline decoration-ink/40 decoration-2 underline-offset-4 hover:decoration-ink"
                      >
                        {athlete.name}
                      </Link>
                      <p className="mt-1 text-meta text-ink-soft">
                        {athlete.baselineId ? 'Baseline recorded' : 'No baseline yet'}
                        {' · '}
                        {athlete.checkIds.length}{' '}
                        {athlete.checkIds.length === 1 ? 'check' : 'checks'}
                      </p>
                    </div>

                    <div className="mt-4 flex shrink-0 gap-2 sm:mt-0">
                      <ButtonLink
                        href={`/athletes/${athlete.id}`}
                        className="!min-h-12 !px-4 !text-body"
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
                    <div className="mt-4 rounded-xl border-2 border-ink p-4">
                      <p className="text-meta font-semibold text-ink">
                        Delete {athlete.name} and all of their recorded results? This cannot be
                        undone.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="primary"
                          className="!min-h-12 !px-4 !text-body"
                          onClick={() => void removeAthlete(athlete.id)}
                        >
                          Delete permanently
                        </Button>
                        <Button
                          variant="secondary"
                          className="!min-h-12 !px-4 !text-body"
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
                      className="mt-3 text-meta font-semibold text-ink-soft underline underline-offset-4 hover:text-ink"
                    >
                      Delete {athlete.name}
                    </button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Add an athlete ─────────────────────────────────────────────────────── */}
        <section aria-labelledby="add-heading" className="lg:sticky lg:top-6">
          <Card>
            <h2 id="add-heading" className="text-title font-bold text-ink">
              Add an athlete
            </h2>
            <form onSubmit={addAthlete} className="mt-4">
              <label htmlFor="athlete-name" className="block text-meta font-bold text-ink">
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
                // The placeholder uses the full ink-soft colour rather than a faded version of
                // it: at 60% opacity it fell to roughly 2.9:1 against white, below the 4.5:1
                // contrast floor, which matters most in the bright sunlight this gets used in.
                className="mt-2 min-h-14 w-full rounded-xl border-2 border-ink/15 bg-paper px-4 text-title text-ink placeholder:text-ink-soft focus:border-ink"
              />
              {error && (
                <p role="alert" className="mt-2 text-meta font-bold text-ink">
                  {error}
                </p>
              )}
              <Button type="submit" className="mt-4 w-full">
                Add athlete
              </Button>
            </form>

            <p className="mt-4 text-meta text-ink-soft">
              Names are stored only in this browser. Use whatever your team already uses — a
              first name and last initial is plenty.
            </p>
          </Card>
        </section>
      </div>
    </PageShell>
  );
}
