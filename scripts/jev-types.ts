export interface JevQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, unknown>;
}
export interface JevRequest {
  state: unknown;
  questions: Record<string, JevQuestion>;
}
export interface JevAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}
export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
  costUsd?: number;
}
export type JevEvaluator = (request: JevRequest) => Promise<JevResponse>;
