import crypto from "crypto";

/**
 * Generates a human-friendly, secure, unique invitation code.
 * Format: TAY-XXXX-XX (e.g. TAY-8K29-XP)
 */
export function generateInvitationCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude 0, 1, I, O for readability
  let part1 = "";
  let part2 = "";
  
  const randomBytes = crypto.randomBytes(8);
  for (let i = 0; i < 4; i++) {
    part1 += chars[randomBytes[i] % chars.length];
  }
  for (let i = 4; i < 6; i++) {
    part2 += chars[randomBytes[i] % chars.length];
  }

  return `TAY-${part1}-${part2}`;
}
