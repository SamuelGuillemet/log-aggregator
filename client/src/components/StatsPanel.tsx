import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  FileWarning,
  HardDrive,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLogStore } from "@/stores/logStore";

const statItems = [
  { icon: Activity, key: "eventsPerSecond", label: "events/sec" },
  { icon: AlertTriangle, key: "warnings", label: "warnings" },
  { icon: FileWarning, key: "errors", label: "errors" },
  { icon: Database, key: "activeInstances", label: "instances" },
  { icon: HardDrive, key: "watchedFiles", label: "watched files" },
  { icon: Cpu, key: "memoryUsageMb", label: "memory MB" },
] as const;

export function StatsPanel() {
  const stats = useLogStore((state) => state.stats);

  return (
    <section
      className="gap-2 grid grid-cols-1 min-[1100px]:grid-cols-6 min-[760px]:grid-cols-2"
      aria-label="Runtime statistics"
    >
      {statItems.map((item) => {
        const Icon = item.icon;

        return (
          <Card
            key={item.label}
            className="items-center gap-1 grid grid-cols-[auto_1fr] p-3 min-h-17"
          >
            <Icon size={16} />
            <span className="text-muted-foreground text-xs">{item.label}</span>
            <strong className="col-span-full font-mono text-xl">
              {stats[item.key]}
            </strong>
          </Card>
        );
      })}
    </section>
  );
}
