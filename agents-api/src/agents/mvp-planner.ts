import { AgentExecutePayload, AgentExecutionContext, AgentExecutionResult } from "../types";

export async function executeMvpPlannerAgent(
  payload: AgentExecutePayload,
  context: AgentExecutionContext
): Promise<AgentExecutionResult> {
  return {
    agent: "MVP Planner Agent",
    receivedAt: context.receivedAt,
    input: payload,
    output: {
      summary:
        "The MVP should avoid becoming a complete accounting product. It should prove one focused promise: helping a French freelancer complete their monthly admin preparation in less than 10 minutes.",
      mvpGoal: "Help a freelancer prepare their monthly admin package quickly, clearly, and with less stress.",
      mustHaveFeatures: [
        {
          feature: "Simple onboarding",
          description:
            "The user enters their legal status, VAT situation, business type, and key deadlines.",
        },
        {
          feature: "Manual invoice and expense import",
          description:
            "The user can upload PDFs or manually add documents. Banking integrations are not required for the first MVP.",
        },
        {
          feature: "Assisted categorization",
          description:
            "Expenses are grouped into simple categories such as software, travel, equipment, subcontracting, and other.",
        },
        {
          feature: "Monthly admin summary",
          description:
            "A clear view showing revenue, expenses, missing documents, estimated VAT, and actions to complete.",
        },
        {
          feature: "Accountant export",
          description:
            "A clean ZIP or CSV export that the freelancer can send to their accountant.",
        },
        {
          feature: "Deadline reminders",
          description:
            "Simple email reminders before VAT, URSSAF, or monthly accounting preparation deadlines.",
        },
      ],
      shouldAvoidInV1: [
        "Automatic banking connections.",
        "Automatic VAT filing.",
        "Replacing the accountant.",
        "Complex support for every French legal status.",
        "A native mobile app.",
      ],
      roadmap: {
        weeks1to2: [
          "Launch a landing page with a clear promise.",
          "Build a simple prototype or Figma flow.",
          "Run 10 interviews with French B2B freelancers.",
        ],
        weeks3to6: [
          "Build document upload and simple categorization.",
          "Generate the first monthly admin summary.",
          "Create a basic accountant export.",
        ],
        weeks7to10: [
          "Run a beta with 20 to 30 freelancers.",
          "Measure time saved and missing document reduction.",
          "Iterate on reminders, summary clarity, and export quality.",
        ],
      },
      successMetrics: [
        "70% of beta users complete their monthly admin summary.",
        "Average preparation time is below 10 minutes.",
        "At least 40% of test users ask to use the product again the following month.",
        "At least 5 beta users agree to pay after the test period.",
      ],
      executionRisks: [
        {
          risk: "Regulatory complexity",
          mitigation:
            "Avoid automatic tax advice in V1. Present estimates and cautious guidance, and keep the accountant in the loop.",
        },
        {
          risk: "Building too many accounting features",
          mitigation:
            "Keep the MVP focused on monthly preparation, organization, and accountant handoff.",
        },
        {
          risk: "Lack of trust",
          mitigation:
            "Be transparent that the product helps prepare documents but does not replace professional validation.",
        },
        {
          risk: "Difficult acquisition",
          mitigation:
            "Start with freelancer communities, accounting partners, and practical educational content.",
        },
      ],
      recommendedMvp:
        "A monthly admin assistant that centralizes documents, identifies missing items, highlights key actions, estimates attention points, and generates a clean accountant package.",
    },
  };
}
