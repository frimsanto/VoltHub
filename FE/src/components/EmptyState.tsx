import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Search, Inbox, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: "file" | "search" | "inbox" | "alert";
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const getIcon = () => {
    switch (icon) {
      case "file":
        return <FileText className="size-16 text-muted-foreground/50" />;
      case "search":
        return <Search className="size-16 text-muted-foreground/50" />;
      case "alert":
        return <AlertCircle className="size-16 text-muted-foreground/50" />;
      default:
        return <Inbox className="size-16 text-muted-foreground/50" />;
    }
  };

  return (
    <Card className={cn("rounded-2xl shadow-soft border-border/60", className)}>
      <CardContent className="flex flex-col items-center justify-center px-5 py-12 text-center sm:px-6 sm:py-16">
        <div className="mb-4 rounded-full bg-muted/50 p-3 sm:p-4">{getIcon()}</div>
        <h3 className="mb-2 text-base font-semibold sm:text-lg">{title}</h3>
        {description && (
          <p className="mb-6 max-w-md text-sm text-muted-foreground">{description}</p>
        )}
        {action && (
          <Button
            onClick={action.onClick}
            className="w-full rounded-xl gradient-pln text-white sm:w-auto"
          >
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
