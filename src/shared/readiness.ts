export type ReadinessStep = {
  key: string;
  description: string;
  done: boolean;
  path: string;
  administratorOnly?: boolean;
};
export type SchoolReadiness = {
  steps: ReadinessStep[];
  completed: number;
  total: number;
  activeClasses: number;
  connectedClasses: number;
  scheduledClasses: number;
};
