export type CicmicPlayer = 1 | 2;
/** A point that was captured via a Mill. Permanently blocked — can never be placed on or moved into again. */
export const CICMIC_DESTROYED = "X" as const;
export type CicmicCell = CicmicPlayer | null | typeof CICMIC_DESTROYED;

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

export const CICMIC_ADJACENCY: Record<number, number[]> = {
  0: [1, 7], 1: [0, 2, 9], 2: [1, 3], 3: [2, 4, 11],
  4: [3, 5], 5: [4, 6, 13], 6: [5, 7], 7: [0, 6, 15],
  8: [9, 15], 9: [1, 8, 10, 17], 10: [9, 11], 11: [3, 10, 12, 19],
  12: [11, 13], 13: [5, 12, 14, 21], 14: [13, 15], 15: [7, 8, 14, 23],
  16: [17, 23], 17: [9, 16, 18], 18: [17, 19], 19: [11, 18, 20],
  20: [19, 21], 21: [13, 20, 22], 22: [21, 23], 23: [15, 16, 22]
};

/** Checks if placing/moving a piece to `point` completes a Mill for `player` */
export function formsMill(
  board: Record<number, CicmicCell>,
  point: number,
  player: CicmicPlayer
): boolean {
  const possibleMills = CICMIC_MILLS.filter((mill) => mill.includes(point));
  return possibleMills.some((mill) => mill.every((p) => board[p] === player));
}

/** Checks if a player has any piece that is NOT in a Mill */
export function hasNonMillPieces(
  board: Record<number, CicmicCell>,
  player: CicmicPlayer
): boolean {
  for (let i = 0; i < 24; i++) {
    if (board[i] === player && !formsMill(board, i, player)) {
      return true;
    }
  }
  return false;
}

/** Checks if a player has any legal moves available in Phase 2 */
export function hasLegalMoves(
  board: Record<number, CicmicCell>,
  player: CicmicPlayer,
  isFlying: boolean
): boolean {
  if (isFlying) return Object.values(board).some((v) => v === null);

  for (let i = 0; i < 24; i++) {
    if (board[i] === player) {
      const neighbors = CICMIC_ADJACENCY[i] || [];
      if (neighbors.some((n) => board[n] === null)) {
        return true;
      }
    }
  }
  return false;
}
