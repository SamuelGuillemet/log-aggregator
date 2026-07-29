import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex justify-center items-center gap-2 disabled:opacity-50 border focus-visible:border-ring rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/35 min-h-9 [&_svg]:size-4 font-medium text-sm whitespace-nowrap transition-all active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none select-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary px-3 text-primary-foreground hover:bg-primary/90",
        destructive:
          "border-destructive bg-destructive/10 px-3 text-destructive hover:bg-destructive/20",
        ghost:
          "border-transparent bg-transparent px-3 hover:bg-accent hover:text-accent-foreground",
        outline:
          "border-border bg-card/75 px-3 hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        secondary:
          "border-border bg-secondary px-3 text-secondary-foreground hover:bg-secondary/80",
      },
      size: {
        default: "h-9",
        icon: "h-9 w-9 px-0",
        sm: "h-8 px-2.5",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, size, variant, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ className, size, variant }))}
      data-slot="button"
      {...props}
    />
  );
}
