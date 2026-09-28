export function GoogleAuthLink({ label }: { label: string }) {
  return (
    <a
      href="/api/auth/google/start"
      className="mt-4 flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 px-4 py-2.5 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white" aria-hidden="true">
        <img
          src="https://developers.google.com/static/identity/images/g-logo.png"
          alt=""
          className="h-5 w-5"
        />
      </span>
      {label}
    </a>
  );
}
