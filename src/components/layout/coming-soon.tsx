import type { LucideIcon } from "lucide-react";

import { Owl } from "@/components/brand/owl";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  icon: Icon,
  title,
  description,
  stage,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  stage: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="grid min-h-72 place-items-center p-8 text-center">
        <div className="max-w-md">
          <Owl className="mx-auto w-20" />
          <span className="mx-auto mt-3 grid size-12 place-items-center rounded-2xl border-2 border-divider bg-tint-sky text-foreground"><Icon className="size-6" /></span>
          <span className="mt-4 inline-block rounded-full border-2 border-divider bg-tint-amber px-2.5 py-1 text-xs font-extrabold text-foreground">{stage}</span>
          <h2 className="mt-3 text-xl font-black text-foreground">{title}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
