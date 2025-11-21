export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min = 0, max = 1): number {
  return Math.random() * (max - min) + min;
}

export function randomBool(): boolean {
  return Math.random() < 0.5;
}

const sampleNames = ['Nguyen Van A', 'Tran Thi B', 'Le Van C', 'Pham Thi D'];

export function randomName(): string {
  const index = randomInt(0, sampleNames.length - 1);
  const value = sampleNames[index];
  if (value !== undefined) {
    return value;
  }
  return sampleNames[0]!;
}

export function randomNumericString(length: number): string {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += randomInt(0, 9).toString();
  }
  return result;
}
