export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message || fallback;
  }
  if (typeof error === "string") {
    const message = error.trim();
    return message || fallback;
  }
  return fallback;
}

export function getErrorStatus(error: unknown): number {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return 0;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : Number(status || 0);
}
