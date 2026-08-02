import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/v2/PageHeader";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { AssistantChat } from "@/features/v2/ai/AssistantChat";

export const Route = createFileRoute("/_app/ai-search")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: AiAssistantPage,
  head: () => ({ meta: [{ title: "AI Assistant — VoltHub" }] }),
});

// Full-page surface for the AI Assistant. The conversational logic lives in the
// shared <AssistantChat/> (features/v2/ai), which also powers the floating FAB
// mounted globally in the app shell — same engine, two entry points.
function AiAssistantPage() {
  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> AI Assistant
          </span>
        }
        description="Asisten cerdas untuk menelusuri gardu, status SCADA, dan kondisi aset."
      />

      <Card className="flex h-[calc(100vh-260px)] min-h-[420px] flex-col overflow-hidden">
        <AssistantChat />
        <p className="flex items-center gap-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <Sparkles className="size-3" /> Demo AI Assistant — jawaban diturunkan dari data aset
          terkini.
        </p>
      </Card>
    </div>
  );
}
