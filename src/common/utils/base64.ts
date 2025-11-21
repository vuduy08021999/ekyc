export function extractBase64Payload(input: string): string {
  const commaIndex = input.indexOf(',');
  if (commaIndex >= 0) {
    return input.slice(commaIndex + 1);
  }
  return input;
}

export interface ParsedBase64Image {
  mimeType: string;
  base64Payload: string;
}

export function parseBase64Image(input: string): ParsedBase64Image {
  const trimmed = input.trim();
  const dataUrlMatch = /^data:(?<mime>[^;]+);base64,(?<payload>.+)$/i.exec(trimmed);

  if (dataUrlMatch?.groups?.mime && dataUrlMatch.groups.payload) {
    return {
      mimeType: dataUrlMatch.groups.mime,
      base64Payload: dataUrlMatch.groups.payload,
    };
  }

  return {
    mimeType: 'image/jpeg',
    base64Payload: extractBase64Payload(trimmed),
  };
}

export function isNonEmptyBase64(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0;
}
