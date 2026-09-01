import { cn } from "@/lib/utils";
import { logo } from "@/lib/assets";

/** The property mark. `onDark` sits on the ink header and hero overlays;
 *  `onLight` sits on sand and paper surfaces. */
export function Logo({
  variant = "onDark",
  className,
  size = "h-16",
  withWordmark = false,
}: {
  variant?: "onDark" | "onLight";
  className?: string;
  /** Height utility — override per placement, e.g. `size="h-24"` on a hero. */
  size?: string;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <img
        src={logo[variant]}
        alt="Homes of Sanctuary"
        className={cn("w-auto rounded-md object-contain", size)}
      />
      {withWordmark && (
        <span className="display-caps text-lg tracking-wide">Homes of Sanctuary</span>
      )}
    </span>
  );
}
