export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function assert(
  condition: unknown,
  code = 'invalid_input',
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(status, code);
}
