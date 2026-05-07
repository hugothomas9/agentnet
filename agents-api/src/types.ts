export type AgentExecutePayload = {
  startupIdea?: string;
  targetMarket?: string;
  stage?: string;
  country?: string;
  language?: string;
  [key: string]: unknown;
};

export type AgentExecutionContext = {
  receivedAt: string;
};

export type AgentExecutionResult = {
  agent: string;
  receivedAt: string;
  input: AgentExecutePayload;
  output: Record<string, unknown>;
};
