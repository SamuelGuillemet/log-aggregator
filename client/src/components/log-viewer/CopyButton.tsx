import { Check, Clipboard } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  className?: string;
  onCopy: () => void;
  size?: "icon" | "icon-sm" | "default";
  title?: string;
  variant?: "outline" | "ghost" | "default";
}

export function CopyButton({
  className,
  onCopy,
  size = "icon",
  title = "Copy to clipboard",
  variant = "outline",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  const isIconOnly = size === "icon" || size === "icon-sm";

  return (
    <Button
      variant={variant}
      size={size}
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : title}
      className={cn(
        "transition-all",
        copied && "bg-green-100 border-green-500 text-green-700",
        className,
      )}
    >
      {copied ? (
        <>
          <Check size={15} className="animate-in duration-200 zoom-in-50" />
          {!isIconOnly && <span>Copied!</span>}
        </>
      ) : (
        <>
          <Clipboard size={15} />
          {!isIconOnly && <span>Copy</span>}
        </>
      )}
    </Button>
  );
}
