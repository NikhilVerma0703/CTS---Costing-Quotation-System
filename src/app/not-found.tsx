import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-[18px] font-semibold">This project no longer exists</h1>
      <Link href="/" className="btn-primary">
        All projects
      </Link>
    </main>
  );
}
