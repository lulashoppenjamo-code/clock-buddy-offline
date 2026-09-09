import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/perfumes")({
  beforeLoad: () => {
    throw redirect({ to: "/meta-mensual" });
  },
});
