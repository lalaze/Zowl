import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function Stepper({
  steps,
  current,
  ariaLabel,
}: {
  steps: readonly string[];
  current: number;
  ariaLabel: string;
}) {
  return (
    <ol className="grid grid-cols-3" aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const number = index + 1;
        const complete = number < current;
        const active = number === current;
        return (
          <li
            key={step}
            className="relative flex flex-col items-center gap-2 text-center"
          >
            {index ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute right-1/2 top-[17px] w-full border-t-2",
                  number <= current
                    ? "border-primary"
                    : "border-dashed border-divider",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 grid size-9 place-items-center rounded-full border-2 text-xs font-black",
                complete
                  ? "border-divider bg-primary text-on-primary"
                  : active
                    ? "border-divider bg-surface text-foreground"
                    : "border-dashed border-divider bg-surface text-subtle",
              )}
              aria-current={active ? "step" : undefined}
            >
              {complete ? <Check className="size-4" /> : number}
            </span>
            <span
              className={cn(
                "text-xs font-extrabold",
                active
                  ? "text-foreground"
                  : complete
                    ? "text-muted"
                    : "text-subtle",
              )}
            >
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
