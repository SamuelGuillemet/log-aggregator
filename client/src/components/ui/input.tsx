import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "flex bg-card/70 disabled:opacity-50 shadow-sm px-3 py-1 border border-input focus-visible:border-ring rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35 w-full min-w-0 h-9 placeholder:text-muted-foreground md:text-sm text-base transition-colors disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}
