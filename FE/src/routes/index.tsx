import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth";

export const Route = createFileRoute("/")({
  component: () => {
    const isAuthed = useAuthStore((s) => s.isAuthed);
    // VoltHub is the root application: authenticated users land on the
    // dashboard; everyone else goes to login.
    return <Navigate to={isAuthed ? "/dashboard" : "/login"} />;
  },
});
