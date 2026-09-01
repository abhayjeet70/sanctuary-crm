import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field with a reveal toggle.
 *
 * The toggle is a button rather than a checkbox so it never submits the form,
 * and it is excluded from the tab order — a keyboard user reaching for the
 * submit button should not land on it first. `dark` only swaps the icon colour
 * for the sign-in panel, which sits on the ink hero.
 */
export function PasswordInput({
  className,
  dark,
  ...props
}: ComponentProps<typeof Input> & { dark?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        className={cn(
          "absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
          dark
            ? "text-sand/50 hover:bg-white/10 hover:text-sand"
            : "text-stone-600 hover:bg-sand-200 hover:text-ink",
        )}
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </>
  );
}
