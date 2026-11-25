import { Owl } from "@/components/brand/owl";
import { cn } from "@/lib/utils";

/** The owl as the product mark, used next to page titles and in headers. */
export function BrandMark({ className }: { className?: string }) {
  return <Owl className={cn("size-10", className)} />;
}
