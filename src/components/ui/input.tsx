import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-[50px] w-full px-4 py-2 rounded-2xl border border-transparent bg-surface-muted text-base font-semibold text-foreground outline-none transition-[background-color,border-color,box-shadow] placeholder:font-medium placeholder:text-subtle hover:bg-surface-strong/60 focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
