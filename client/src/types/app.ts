export type AppOneSubappId =
  | "github-issue-analyser"
  | "expense-tracker"
  | "nosql-client"
  | "subapp4"
  | "postman"
  | "writing-agent"
  | "subapp8"
  | "cron-scheduler"
  | "subapp10";

export type CanvasContextWithLetterSpacing = CanvasRenderingContext2D & {
  letterSpacing?: string;
};
