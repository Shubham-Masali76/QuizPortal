import {
  ref as rtdbRef,
  set as rtdbSet,
  remove as rtdbRemove,
  onDisconnect as rtdbOnDisconnect,
  push as rtdbPush,
} from "firebase/database";
import { rtdb } from "../services/firebase";

export async function submitResponseRTDB(quizId, questionIndex, participantId, optionNumber, questionId = null) {
  const respRef = rtdbRef(rtdb, `responses/${quizId}/${questionIndex}/${participantId}`);
  const payload = {
    selectedOption: optionNumber,
    timestamp: Date.now()
  };
  if (questionId) payload.questionId = questionId;
  await rtdbSet(respRef, payload);
}

// Deterministic 32-bit FNV-1a hash
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Supported live reaction emojis
export const REACTION_EMOJIS = ["👍", "🔥", "😂", "😮", "👏"];

// Ephemeral lobby reaction sender with owner-based cleanup
export async function sendLobbyReaction(quizId, participantId, emoji) {
  if (!quizId || !participantId || !emoji) return;

  try {
    // 1. Create the unique reaction reference using push()
    const reactionsRef = rtdbRef(rtdb, `reactions/${quizId}`);
    const reactionRef = rtdbPush(reactionsRef);

    // 2. Register disconnect cleanup BEFORE writing
    await rtdbOnDisconnect(reactionRef).remove();

    // 3. Write the reaction
    await rtdbSet(reactionRef, {
      emoji,
      participantId,
      createdAt: Date.now(),
    });

    // 4. Normal cleanup scheduled after ~4 seconds
    setTimeout(async () => {
      try {
        await rtdbOnDisconnect(reactionRef)
          .cancel()
          .catch(() => {});
        await rtdbRemove(reactionRef).catch(() => {});
      } catch {
        // safely handle cleanup failures
      }
    }, 4000);
  } catch (err) {
    console.error("Error sending lobby reaction:", err);
  }
}

// Generate organic position strictly from participantId as the primary stable seed
export function getStableParticipantPosition(participantId, attempt = 0) {
  const seed =
    attempt === 0 ? participantId : `${participantId}_step${attempt}`;
  const hAngle = hashString(seed + "_angle");
  const hRadius = hashString(seed + "_radius");
  const hJitterX = hashString(seed + "_jx");
  const hJitterY = hashString(seed + "_jy");

  // Angle in radians distributed around 360 degrees
  const angle = ((hAngle % 3600) / 3600) * 2 * Math.PI;

  // Natural outward growth rings by attempt:
  // Initial attempt clusters near center; subsequent attempts expand outward
  const baseRadius = 5 + Math.min(attempt * 6, 32);
  const spread = 9;
  const rawR = (hRadius % 1000) / 1000;
  const radius = baseRadius + Math.sqrt(rawR) * spread;

  // Organic jitter offsets (-2% to +2%)
  const jitterX = ((hJitterX % 40) - 20) / 10;
  const jitterY = ((hJitterY % 40) - 20) / 10;

  // Center is at (50%, 50%). Proportions adapted to stage
  let x = 50 + radius * 1.35 * Math.cos(angle) + jitterX;
  let y = 50 + radius * 0.95 * Math.sin(angle) + jitterY;

  // Clamp within bounds with safe margins
  x = Math.max(6, Math.min(94, x));
  y = Math.max(8, Math.min(92, y));

  // Multi-point organic local drift parameters derived strictly from participantId
  const hAnim = hashString(participantId + "_anim");
  const hDuration = hashString(participantId + "_dur");
  const hDelay = hashString(participantId + "_del");
  const hScale = hashString(participantId + "_scl");

  // Pick one of 4 organic multi-point drift paths (1 to 4)
  const animVariant = (hAnim % 4) + 1;
  // Slow, calm duration between 5.5s and 8.8s
  const duration = 5.5 + (hDuration % 34) / 10;
  // Non-synchronized starting phase/delay (already mid-flight)
  const delay = -((hDelay % 90) / 10);
  // Subtle drift intensity multiplier (0.85 to 1.15) for natural organic variance
  const driftScale = Number(((85 + (hScale % 31)) / 100).toFixed(2));

  return { x, y, animVariant, duration, delay, driftScale };
}

export const EMOJI_UNICODE_RANGES = [
  [0x1f600, 0x1f637], // Smileys & emoticons
  [0x1f638, 0x1f640], // Cat expressions
  [0x1f648, 0x1f64a], // Monkeys
  [0x1f400, 0x1f43c], // Animals
  [0x1f980, 0x1f997], // Wildlife & creatures
  [0x1f910, 0x1f92f], // Expressive faces
  [0x1f331, 0x1f343], // Nature & plants
  [0x1f345, 0x1f37f], // Food & drink
  [0x1f3a0, 0x1f3c4], // Activities & sports
  [0x1f680, 0x1f6c0], // Transport & space
];

export const generateDynamicAvatar = (existingAvatars = new Set()) => {
  const MAX_ATTEMPTS = 500;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const range =
      EMOJI_UNICODE_RANGES[
        Math.floor(Math.random() * EMOJI_UNICODE_RANGES.length)
      ];
    const codePoint =
      Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    const candidate = String.fromCodePoint(codePoint);

    if (!existingAvatars.has(candidate)) {
      return candidate;
    }
  }

  // If initial random attempts hit taken avatars, scan available ranges
  for (const [start, end] of EMOJI_UNICODE_RANGES) {
    for (let cp = start; cp <= end; cp++) {
      const candidate = String.fromCodePoint(cp);
      if (!existingAvatars.has(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error("Unable to generate a unique avatar for this lobby.");
};

export const sortParticipants = (a, b) => {
  // 1. Primary: Score (Descending)
  if ((b.score || 0) !== (a.score || 0)) {
    return (b.score || 0) - (a.score || 0);
  }
  // 2. Secondary: Accuracy (Correct Answers Count) (Descending)
  if ((b.correctAnswersCount || 0) !== (a.correctAnswersCount || 0)) {
    return (b.correctAnswersCount || 0) - (a.correctAnswersCount || 0);
  }
  // 3. Tertiary: Speed Demon (Total Response Time) (Ascending - lower is better)
  if ((a.totalResponseTimeMs || 0) !== (b.totalResponseTimeMs || 0)) {
    return (a.totalResponseTimeMs || 0) - (b.totalResponseTimeMs || 0);
  }
  // 4. Quaternary: Clutch Factor (Last Response Time) (Ascending - lower is better)
  return (a.lastResponseTimeMs || 0) - (b.lastResponseTimeMs || 0);
};

export const sortQuestions = (list, questionOrder = null) => {
  if (!Array.isArray(list)) return [];
  
  // 1. If explicit questionOrder ID array is provided from the quiz doc, use it as definitive source of truth
  if (Array.isArray(questionOrder) && questionOrder.length > 0) {
    const orderMap = new Map();
    questionOrder.forEach((id, idx) => orderMap.set(String(id), idx));
    return [...list].sort((a, b) => {
      const idxA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 999999;
      const idxB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 999999;
      if (idxA !== idxB) return idxA - idxB;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }

  return [...list].sort((a, b) => {
    // 2. Explicit integer order field
    const hasOrderA = a.order !== undefined && a.order !== null && !isNaN(a.order);
    const hasOrderB = b.order !== undefined && b.order !== null && !isNaN(b.order);
    if (hasOrderA && hasOrderB) {
      if (Number(a.order) !== Number(b.order)) return Number(a.order) - Number(b.order);
    } else if (hasOrderA) {
      return -1;
    } else if (hasOrderB) {
      return 1;
    }

    // 3. Creation timestamp
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : null);
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : null);
    if (timeA !== null && timeB !== null && !isNaN(timeA) && !isNaN(timeB)) {
      if (timeA !== timeB) return timeA - timeB;
    }

    // 4. Strict leading question number match only (e.g. "1. What", "1 question", "Question 1", "Q1:")
    const extractLeadNum = (str) => {
      if (!str) return null;
      const trimmed = String(str).trim();
      const m = trimmed.match(/^(?:question\s*|q\s*)?(\d+)(?:[.:\-)\s]|$)/i);
      return m ? parseInt(m[1], 10) : null;
    };
    const numA = extractLeadNum(a.question);
    const numB = extractLeadNum(b.question);
    if (numA !== null && numB !== null) {
      if (numA !== numB) return numA - numB;
    } else if (numA !== null) {
      return -1;
    } else if (numB !== null) {
      return 1;
    }

    // 5. Stable deterministic tie-breaker: document ID
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
};
