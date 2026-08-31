import { ButtonLink, PageShell } from '@/components/ui';

// Shown for any URL that doesn't exist. It renders inside the root layout, so the persistent
// safety footer is already there.
export default function NotFound() {
  return (
    <PageShell>
      <h1 className="text-display font-bold tracking-tight text-ink sm:text-display">Page not found</h1>
      <p className="mt-3 max-w-xl text-title text-ink-soft">
        That address doesn&apos;t exist in this app.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/athletes">Go to athletes</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </PageShell>
  );
}
