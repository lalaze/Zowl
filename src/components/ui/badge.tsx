import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold text-foreground",
  {
    variants: {
      variant: {
        default: "bg-surface-muted text-muted",
        accent: "bg-primary-soft text-accent-text",
        success: "bg-tint-leaf text-income",
        warning: "bg-tint-amber text-[#8a5300] dark:text-[#f5bd4f]",
        danger: "bg-tint-berry text-danger",
        info: "bg-tint-sky text-[#1d4ed8] dark:text-[#8ab8ff]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
