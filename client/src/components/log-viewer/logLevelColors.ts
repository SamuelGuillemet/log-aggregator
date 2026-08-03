interface LogLevelColors {
  background: string;
  border: string;
}

export function getLogLevelColors(level: string): LogLevelColors {
  const normalizedLevel = level.toUpperCase();

  switch (normalizedLevel) {
    case "FATAL":
      return {
        background: "bg-[#ffe5e5]",
        border: "border-l-[#dc2626]",
      };
    case "ERROR":
      return {
        background: "bg-[#fff1eb]",
        border: "border-l-[#ef580c]",
      };
    case "WARN":
      return {
        background: "bg-[#fff8e8]",
        border: "border-l-[#be8b2f]",
      };
    case "INFO":
      return {
        background: "bg-white",
        border: "border-l-[#0284c7]",
      };
    case "DEBUG":
      return {
        background: "bg-white",
        border: "border-l-[#6b7280]",
      };
    case "TRACE":
      return {
        background: "bg-white",
        border: "border-l-[#9ca3af]",
      };
    default:
      return {
        background: "bg-white",
        border: "border-l-transparent",
      };
  }
}
