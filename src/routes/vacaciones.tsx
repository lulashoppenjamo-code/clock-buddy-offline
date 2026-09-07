import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vacaciones")({
  beforeLoad: () => {
    throw redirect({ to: "/descansos" });
  },
  component: () => null,
});
