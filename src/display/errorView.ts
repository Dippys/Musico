import type { DisplayPayload } from "./shared.js";
import { createStatusView } from "./statusView.js";

export const createErrorView = (
  message: string,
  details: readonly string[] = [],
): DisplayPayload => {
  return createStatusView(message, details, "danger");
};