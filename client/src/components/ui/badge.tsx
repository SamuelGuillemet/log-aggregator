import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex justify-center items-center gap-1 px-2 py-0.5 border border-transparent rounded-sm w-fit h-6 [&>svg]:size-3.5 overflow-hidden font-medium text-xs whitespace-nowrap transition-all shrink-0 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive/10 text-destructive",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        outline: "border-border text-foreground",
        secondary: "bg-secondary text-secondary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ className, variant }))}
      {...props}
    />
  );
}
