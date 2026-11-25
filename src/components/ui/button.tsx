import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[18px] text-sm font-extrabold transition-[background-color,color,transform,filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary hover:bg-primary-strong",
        primary: "bg-primary text-on-primary hover:bg-primary-strong",
        secondary: "bg-primary-soft text-accent-text hover:brightness-[0.97]",
        outline: "bg-surface-muted text-foreground hover:bg-surface-strong",
        ghost: "text-accent-text hover:bg-primary-soft",
        danger: "bg-tint-berry text-danger hover:brightness-[0.97]",
      },
      size: {
        default: "h-[50px] px-5 py-2",
        sm: "h-10 rounded-[14px] px-3.5",
        lg: "h-[54px] px-6 text-base",
        icon: "size-11 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
