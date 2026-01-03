import type { PageAudit } from "../pdf/types";

export function RiskBadge({ risk }: { risk: PageAudit["risk"] }) {
  const badges = {
    flagged: { text: "⚠️ Flagged", className: "risk-badge risk-flagged" },
    none: { text: "✅ Clean", className: "risk-badge risk-none" }
  };
  const badge = badges[risk];
  return <span className={badge.className}>{badge.text}</span>;
}
