"use client";

/** A page that can't load, almost always because the database isn't reachable. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-[18px] font-semibold">This page could not load</h1>
      <p className="max-w-md text-[14px] text-ink-2">Check that the database is running, then try again.</p>
      <button type="button" className="btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
