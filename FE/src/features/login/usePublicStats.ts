import { useEffect, useState } from "react";
import { getPublicStats, PublicStats } from "@/lib/api/stats";

type State =
  | { status: "loading"; data: null }
  | { status: "ready"; data: PublicStats }
  | { status: "error"; data: null };

/**
 * Fetch the public operational aggregates for the login brand panel.
 *
 * Deliberately lightweight (plain fetch, no React Query coupling) because the
 * login route is unauthenticated and rendered before the app shell. On failure
 * we surface `error` so the UI can hide the metric strip entirely — we never
 * substitute placeholder/fake numbers.
 */
export function usePublicStats(): State {
  const [state, setState] = useState<State>({ status: "loading", data: null });

  useEffect(() => {
    let alive = true;
    getPublicStats()
      .then((data) => {
        if (alive) setState({ status: "ready", data });
      })
      .catch(() => {
        if (alive) setState({ status: "error", data: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
