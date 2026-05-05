import { EscrowStatus } from "@/types";

const STATUS_CONFIG: Record<EscrowStatus, { label: string; cls: string }> = {
  awaiting_result: { label: "Pending", cls: "badge-pending" },
  grace_period: { label: "Grace Period", cls: "badge-warning" },
  contested: { label: "Contested", cls: "badge-contested" },
  released: { label: "Released", cls: "badge-success" },
  refunded: { label: "Refunded", cls: "badge-error" },
};

export function StatusBadge({ status }: { status: EscrowStatus }) {
  const config = STATUS_CONFIG[status];
  return <span className={`badge ${config.cls}`}>{config.label}</span>;
}
