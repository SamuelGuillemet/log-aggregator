import { Check, Clipboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

interface CopyButtonProps {
  className?: string;
  getText: () => string;
  size?: "icon" | "icon-sm" | "default";
  title?: string;
  variant?: "outline" | "ghost" | "default";
}

export function CopyButton({
  className,
  getText,
  size = "icon",
  title = "Copy to clipboard",
  variant = "outline",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  async function handleCopy() {
    await navigator.clipboard?.writeText(getText());
    setCopied(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2_000);
  }

  const iconOnly = size !== "default";

  return (
    <Button
      variant={variant}
      size={size}
      type="button"
      onClick={() => void handleCopy()}
      title={copied ? "Copied!" : title}
      className={cn(
        "transition-all",
        copied && "border-green-500 bg-green-100 text-green-700",
        className,
      )}
    >
      {copied ? <Check size={15} /> : <Clipboard size={15} />}
      {!iconOnly && <span>{copied ? "Copied!" : "Copy"}</span>}
    </Button>
  );
}
