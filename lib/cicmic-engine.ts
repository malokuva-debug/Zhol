export type CicmicPlayer = 1 | 2;

// The 24 points on the board.
// Outer square: 0-7 | Middle square: 8-15 | Inner square: 16-23
export const CICMIC_MILLS = [
  // Outer Square
  [0, 1, 2], [2, 3, 4], [4, 5, 6], [6, 7, 0],
  // Middle Square
  [8, 9, 10], [10, 11, 12], [12, 13, 14], [14, 15, 8],
  // Inner Square
  [16, 17, 18], [18, 19, 20], [20, 21, 22], [22, 23, 16],
  // Cross Connections
  [1, 9, 17], [3, 11, 19], [5, 13, 21], [7, 15, 23]
];

// Which points can move to which other points
export const CICMIC_ADJACENCY: Record<number, number[]> = {
  0: [1, 7], 1: [0, 2, 9], 2: [1, 3], 3: [2, 4, 11],
  4: [3, 5], 5: [4, 6, 13], 6: [5, 7], 7: [0, 6, 15],
  8: [9, 15], 9: [1, 8, 10, 17], 10: [9, 11], 11: [3, 10, 12, 19],
  12: [11, 13], 13: [5, 12, 14, 21], 14: [13, 15], 15: [7, 8, 14, 23],
  16: [17, 23], 17: [9, 16, 18], 18: [17, 19], 19: [11, 18, 20],
  20: [19, 21], 21: [13, 20, 22], 22: [21, 23], 23: [15, 16, 22]
};

/**
 * Checks if a newly placed/moved piece forms a new Mill.
 */
export function formsMill(
  board: Record<number, CicmicPlayer | null>,
  point: number,
  player: CicmicPlayer
): boolean {
  // Find all possible mills that include this specific point
  const possibleMills = CICMIC_MILLS.filter(mill => mill.includes(point));
  
  // Check if any of those mills are entirely owned by the player
  return possibleMills.some(mill => mill.every(p => board[p] === player));
}

/**
 * Checks if a player has any pieces that are NOT currently in a Mill.
 * (You cannot remove a piece from an opponent's Mill unless they have no other pieces available).
 */
export function hasNonMillPieces(
  board: Record<number, CicmicPlayer | null>,
  player: CicmicPlayer
): boolean {
  for (let i = 0; i < 24; i++) {
    if (board[i] === player && !formsMill(board, i, player)) {
      return true;
    }
  }
  return false;
}
