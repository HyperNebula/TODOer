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

let colorIndex = 0;

export function getNextColor(): string {
  const color = TIMEBLOCK_COLORS[colorIndex];
  colorIndex = (colorIndex + 1) % TIMEBLOCK_COLORS.length;
  return color;
}

export function getPriorityColor(priority: number): string {
  const colors: Record<number, string> = {
    1: "#ef4444",
    2: "#f97316",
    3: "#f59e0b",
    4: "#eab308",
    5: "#84cc16",
    6: "#22c55e",
    7: "#10b981",
    8: "#06b6d4",
    9: "#3b82f6",
    10: "#a855f7",
  };
  return colors[priority] || getNextColor();
}
