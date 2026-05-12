import {
  createContainer,
  createDisplayPayload,
  createSeparator,
  createTextBlock,
  type DisplayPayload,
  type DisplayTone,
} from "./shared.js";

export const createStatusView = (
  title: string,
  details: readonly string[] = [],
  tone: DisplayTone = "success",
): DisplayPayload => {
  const container = createContainer(tone).addTextDisplayComponents(
    createTextBlock(`## ${title}`),
  );

  const normalizedDetails = details
    .map((detail) => detail.trim())
    .filter((detail) => detail.length > 0);

  if (normalizedDetails.length > 0) {
    container.addSeparatorComponents(createSeparator());

    for (const detail of normalizedDetails) {
      container.addTextDisplayComponents(createTextBlock(detail));
    }
  }

  return createDisplayPayload(container);
};