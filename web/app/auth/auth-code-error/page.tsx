import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-12 text-center">
      <h1 className="font-headline-md text-headline-md text-on-background">
        That link didn&apos;t work
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-sm">
        The confirmation link is invalid or has expired. Try signing up again.
      </p>
      <Link href="/signup" className="text-primary underline underline-offset-4">
        Back to sign up
      </Link>
    </div>
  );
}
