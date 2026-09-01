import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/common";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-sand px-6 text-center">
      <Eyebrow>404</Eyebrow>
      <h1 className="display-caps text-4xl text-ink">That page is not part of the house.</h1>
      <p className="max-w-sm text-sm text-stone-600">
        The link may be from an older build, or the module has not been created yet.
      </p>
      <Button asChild>
        <Link to="/">Back to the start</Link>
      </Button>
    </main>
  );
}
