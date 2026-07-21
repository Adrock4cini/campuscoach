import { Button } from "@/components/ui/button";

interface Props {
  onRetry: () => void;
  compact?: boolean;
}

export function ClassesLoadError({ onRetry, compact = false }: Props) {
  return (
    <div className={`rounded-xl border border-danger/30 bg-danger/5 text-center ${compact ? "p-3" : "p-6"}`}>
      <p className="text-sm font-medium text-foreground">Couldn’t load your classes</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Your saved classes were not deleted. Check your connection and try again.
      </p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
