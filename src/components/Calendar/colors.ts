export const TIMEBLOCK_COLORS = [
  "#FF6B6B", // Red
  "#4ECDC4", // Teal
  "#45B7D1", // Blue
  "#FDCB6E", // Yellow
  "#6C5CE7", // Purple
  "#A8E6CF", // Light Green
  "#FFD3B6", // Peach
  "#FFAAA5", // Pinkish
];

export function getRandomColor(): string {
  const randomIndex = Math.floor(Math.random() * TIMEBLOCK_COLORS.length);
  return TIMEBLOCK_COLORS[randomIndex];
}
