import type * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card shadow-sm border border-border rounded-lg text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}
