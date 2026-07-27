// lib/storage.ts
//
// On-device storage for athletes and their test results, using IndexedDB.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// IndexedDB in plain terms (we've only used localStorage before, so here's the mental map)
// ─────────────────────────────────────────────────────────────────────────────────────
// localStorage is a tiny synchronous string→string box. IndexedDB is a real database that
// lives in the browser, on the phone, and never touches a server. The pieces:
//
//   • DATABASE      – one named database per app (ours is "concussion-screen").
//   • OBJECT STORE  – like a table. We have two: "athletes" and "results". Unlike a SQL
//                     table, each row is just a JavaScript object — no columns to declare.
//   • keyPath       – the field IndexedDB uses as the primary key. Both our stores use the
//                     object's own `id`, so calling put({ id: 'abc', ... }) stores/updates
//                     the row with key 'abc'.
//   • INDEX         – a secondary lookup. We add one on the results store keyed by
//                     `athleteId`, so "give me every result for athlete X" is a fast,
//                     direct lookup instead of scanning every result.
//   • TRANSACTION   – every read/write happens inside a transaction over one or more
//                     stores. A write is only truly saved when the *transaction* finishes,
//                     not merely when the individual put() reports success.
//   • REQUEST       – IndexedDB is asynchronous and event-based: you call something, get
//                     back a "request", and listen for `onsuccess` / `onerror`. That's
//                     clunky, so below we wrap requests in Promises and use async/await.
//   • onupgradeneeded – the ONE place you're allowed to change the schema (create stores
//                     and indexes). It fires when the DB is first created, or when we bump
//                     DB_VERSION later. Think of it as "run the migrations".
//
// Why IndexedDB instead of localStorage here: we store structured objects (arrays of trial
// times, nested score objects), we want to query results by athlete, and we care that the
// data survives and stays on the device. localStorage would force us to JSON-stringify
// everything into one big string and re-parse it on every read. IndexedDB is the right tool.
//
// Everything here is browser-only. On the server (Next.js SSR) there is no IndexedDB, so
// these functions must only be called from the browser (event handlers / useEffect in
// client components). openDb() throws a clear error if that rule is broken.

import type { Athlete, TestResult } from './types';

const DB_NAME = 'concussion-screen';
const DB_VERSION = 1; // bump this only when the schema below changes, and migrate in onupgradeneeded
const ATHLETES_STORE = 'athletes';
const RESULTS_STORE = 'results';
const RESULTS_BY_ATHLETE_INDEX = 'byAthleteId';

/**
 * Open (and, on first run or version bump, set up) the database.
 *
 * We open a fresh connection per operation and close it when done. That's slightly less
 * efficient than caching one connection, but it's much simpler to reason about at our scale
 * (a handful of athletes) and it never blocks a future version upgrade.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Guard against being called on the server, where IndexedDB doesn't exist. Failing
    // loudly here is better than a confusing "indexedDB is not defined" deeper in the app.
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable — storage can only be used in the browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // This is the only place we're allowed to create/alter stores and indexes.
    request.onupgradeneeded = () => {
      const db = request.result;

      // "athletes" table, keyed by the athlete's own id.
      if (!db.objectStoreNames.contains(ATHLETES_STORE)) {
        db.createObjectStore(ATHLETES_STORE, { keyPath: 'id' });
      }

      // "results" table, keyed by the result's own id, plus an index so we can pull every
      // result for a given athlete quickly (unique: false because one athlete has many).
      if (!db.objectStoreNames.contains(RESULTS_STORE)) {
        const resultsStore = db.createObjectStore(RESULTS_STORE, { keyPath: 'id' });
        resultsStore.createIndex(RESULTS_BY_ATHLETE_INDEX, 'athleteId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Turn a single IndexedDB request into a Promise so we can await its result.
 * Used for reads (get / getAll / getAllKeys).
 */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Resolve when a whole transaction has committed. For writes this is what we wait on — the
 * data isn't durably saved until `oncomplete` fires, even if the individual put() succeeded.
 */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

/** Create or update an athlete profile. (put = insert-or-replace, keyed by athlete.id) */
export async function saveAthlete(athlete: Athlete): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(ATHLETES_STORE, 'readwrite');
  tx.objectStore(ATHLETES_STORE).put(athlete);
  await transactionDone(tx); // wait for the write to actually commit
  db.close();
}

/** Get every athlete profile. */
export async function getAthletes(): Promise<Athlete[]> {
  const db = await openDb();
  const tx = db.transaction(ATHLETES_STORE, 'readonly');
  const athletes: Athlete[] = await promisifyRequest(tx.objectStore(ATHLETES_STORE).getAll());
  db.close();
  return athletes;
}

/**
 * Get one athlete by id, or null if there is no such athlete.
 *
 * (Added beyond the original five functions: the athlete detail screen needs exactly one
 * profile, and loading the entire roster to find it would be wasteful and clumsy.)
 */
export async function getAthlete(id: string): Promise<Athlete | null> {
  const db = await openDb();
  const tx = db.transaction(ATHLETES_STORE, 'readonly');
  const athlete: Athlete | undefined = await promisifyRequest(tx.objectStore(ATHLETES_STORE).get(id));
  db.close();
  return athlete ?? null;
}

/** Create or update a stored test result (baseline or check). */
export async function saveResult(result: TestResult): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(RESULTS_STORE, 'readwrite');
  tx.objectStore(RESULTS_STORE).put(result);
  await transactionDone(tx);
  db.close();
}

/**
 * Get one test result by its own id, or null if it isn't there.
 *
 * (Also added beyond the original five. The results screen is reached by URL — /results/<id>
 * — so it has to be able to look a single sitting up directly, including the baseline it
 * needs to compare against.)
 */
export async function getResult(id: string): Promise<TestResult | null> {
  const db = await openDb();
  const tx = db.transaction(RESULTS_STORE, 'readonly');
  const result: TestResult | undefined = await promisifyRequest(tx.objectStore(RESULTS_STORE).get(id));
  db.close();
  return result ?? null;
}

/**
 * Get every test result for one athlete, using the byAthleteId index.
 * Results come back in key (id) order; callers that care about time should sort by takenAt.
 */
export async function getResultsFor(athleteId: string): Promise<TestResult[]> {
  const db = await openDb();
  const tx = db.transaction(RESULTS_STORE, 'readonly');
  const index = tx.objectStore(RESULTS_STORE).index(RESULTS_BY_ATHLETE_INDEX);
  const results: TestResult[] = await promisifyRequest(index.getAll(athleteId));
  db.close();
  return results;
}

/**
 * Delete an athlete and ALL of their stored test results, in one atomic transaction.
 *
 * We touch both stores in a single readwrite transaction so the whole delete either fully
 * happens or fully doesn't — we never end up with results belonging to a deleted athlete.
 *
 * The results are removed with a CURSOR: a cursor walks the matching rows one at a time.
 * We do this with plain event callbacks (no `await` in the middle) on purpose — that keeps
 * every delete inside the same transaction, which would otherwise auto-commit the moment we
 * paused to await something.
 */
export async function deleteAthlete(athleteId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([ATHLETES_STORE, RESULTS_STORE], 'readwrite');

  // 1) Remove the athlete profile.
  tx.objectStore(ATHLETES_STORE).delete(athleteId);

  // 2) Remove all of that athlete's results by walking a cursor over the byAthleteId index.
  const index = tx.objectStore(RESULTS_STORE).index(RESULTS_BY_ATHLETE_INDEX);
  const cursorRequest = index.openCursor(IDBKeyRange.only(athleteId));
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor) {
      cursor.delete(); // delete the result the cursor is currently sitting on
      cursor.continue(); // advance to the next matching result (fires onsuccess again)
    }
  };

  await transactionDone(tx);
  db.close();
}
