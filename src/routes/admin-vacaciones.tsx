import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin-vacaciones")({
  beforeLoad: () => {
    throw redirect({ to: "/admin-descansos" });
  },
  component: () => null,
});
