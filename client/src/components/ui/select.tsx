import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex justify-between items-center bg-card/70 disabled:opacity-50 shadow-sm px-3 py-2 border border-input focus:border-ring rounded-md focus:outline-none focus:ring-3 focus:ring-ring/35 w-full h-9 text-sm [&>span]:line-clamp-1 transition-colors disabled:cursor-not-allowed",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="opacity-50 size-4" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "z-50 relative bg-popover shadow-md border border-border rounded-md min-w-32 max-h-80 overflow-hidden text-popover-foreground",
        position === "popper" && "translate-y-1",
        className,
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex items-center focus:bg-accent data-disabled:opacity-50 py-1.5 pr-2 pl-8 rounded-sm outline-none w-full text-sm focus:text-accent-foreground cursor-default data-disabled:pointer-events-none select-none",
      className,
    )}
    {...props}
  >
    <span className="left-2 absolute flex justify-center items-center size-3.5">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
