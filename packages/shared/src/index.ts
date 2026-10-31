import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0";
export const SNAPSHOT_EVENT = "world.snapshot";
export const factionIdSchema = z.enum(["red", "blue"]);
export const encounterIdSchema = z.enum([
  "treaty",
  "resource_crisis",
  "retaliation",
]);
export const worldModeSchema = z.enum(["ready", "active", "resting"]);
export const roundStatusSchema = z.enum([
  "prepared",
  "open",
  "paused",
  "resolved",
  "deferred",
]);
export const roundOutcomeSchema = z.enum([
  "choice_selected",
  "tied",
  "no_votes",
]);
export const connectionSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "reconnecting",
  "unauthorized",
]);
export const broadcastSchema = z.enum(["live", "offline", "unknown"]);
export const opaqueIdSchema = z.string().min(1).max(128);
const timestampSchema = z.string().datetime({ offset: true });
const statSchema = z.number().int().min(0).max(100);
export const worldEventSchema = z
  .object({
    id: opaqueIdSchema,
    sequence: z.number().int().positive(),
    episodeNumber: z.number().int().positive().nullable(),
    kind: z.string().min(1).max(100),
    summary: z.string().min(1).max(2000),
    causeEventIds: z.array(opaqueIdSchema),
    effectiveAt: timestampSchema,
    processedAt: timestampSchema,
  })
  .strict();
export const roundSchema = z
  .object({
    id: opaqueIdSchema,
    status: roundStatusSchema,
    openedAt: timestampSchema.nullable(),
    closesAt: timestampSchema.nullable(),
    tally: z.record(opaqueIdSchema, z.number().int().nonnegative()),
    totalVoters: z.number().int().nonnegative(),
    winningChoiceId: opaqueIdSchema.nullable(),
    outcome: roundOutcomeSchema.nullable(),
  })
  .strict()
  .superRefine((round, context) => {
    if (
      Object.values(round.tally).reduce((sum, value) => sum + value, 0) !==
      round.totalVoters
    )
      context.addIssue({
        code: "custom",
        path: ["totalVoters"],
        message: "Voter total must equal the tally.",
      });
    if (round.status === "open" && (!round.openedAt || !round.closesAt))
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "An open round requires server timestamps.",
      });
    if (
      round.openedAt &&
      round.closesAt &&
      Date.parse(round.closesAt) < Date.parse(round.openedAt)
    )
      context.addIssue({
        code: "custom",
        path: ["closesAt"],
        message: "The deadline cannot precede opening.",
      });
    if (round.status === "resolved" && round.outcome === null)
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "A resolved round requires an outcome.",
      });
    if (
      (round.outcome === "choice_selected") !==
      (round.winningChoiceId !== null)
    )
      context.addIssue({
        code: "custom",
        path: ["winningChoiceId"],
        message: "Only a selected choice has a winner.",
      });
  });
export const choiceSchema = z
  .object({
    id: opaqueIdSchema,
    number: z.number().int().min(1).max(3),
    label: z.string().min(1).max(120),
  })
  .strict();
export const leaderReactionSchema = z
  .object({ factionId: factionIdSchema, text: z.string().min(1).max(500) })
  .strict();
export const sceneSchema = z
  .object({
    id: opaqueIdSchema,
    title: z.string().min(1).max(120),
    narration: z.string().min(1).max(2000),
    encounterId: encounterIdSchema.optional(),
    leaderReactions: z.array(leaderReactionSchema).max(2).optional(),
    causeEventIds: z.array(opaqueIdSchema),
    choices: z.array(choiceSchema).min(1).max(3),
    round: roundSchema,
  })
  .strict()
  .superRefine((scene, context) => {
    const ids = new Set(scene.choices.map((choice) => choice.id));
    if (
      ids.size !== scene.choices.length ||
      scene.choices.some((choice, index) => choice.number !== index + 1)
    )
      context.addIssue({
        code: "custom",
        path: ["choices"],
        message:
          "Choices require unique IDs and consecutive positions starting at 1.",
      });
    if (
      Object.keys(scene.round.tally).length !== scene.choices.length ||
      Object.keys(scene.round.tally).some((key) => !ids.has(key))
    )
      context.addIssue({
        code: "custom",
        path: ["round", "tally"],
        message: "Tally keys must match the pinned choices.",
      });
    if (scene.round.winningChoiceId && !ids.has(scene.round.winningChoiceId))
      context.addIssue({
        code: "custom",
        path: ["round", "winningChoiceId"],
        message: "Winner must be a pinned choice.",
      });
  });
export const contributionCreditSchema = z
  .object({
    displayName: z.string().min(1).max(100),
    factionId: factionIdSchema,
    choiceId: opaqueIdSchema,
    sourceEventId: opaqueIdSchema,
    summary: z.string().min(1).max(1000),
  })
  .strict();
export const recapSchema = z
  .object({
    previously: z.string().max(4000),
    whileAway: z.string().max(4000),
    causeEventIds: z.array(opaqueIdSchema),
    contributionCredits: z.array(contributionCreditSchema).max(3).optional(),
    generationStatus: z.enum(["generated", "fallback"]).optional(),
  })
  .strict();
export const worldSnapshotSchema = z
  .object({
    worldId: opaqueIdSchema,
    revision: z.number().int().nonnegative(),
    name: z.string().min(1).max(80),
    mode: worldModeSchema,
    episode: z
      .object({
        id: opaqueIdSchema,
        number: z.number().int().positive(),
        status: z.enum(["active", "ended"]),
      })
      .strict()
      .nullable(),
    factions: z
      .array(
        z
          .object({
            id: factionIdSchema,
            name: z.string().min(1).max(100),
            supplies: statSchema,
            morale: statSchema,
          })
          .strict(),
      )
      .length(2),
    relationship: z
      .object({
        trust: z.number().int().min(-100).max(100),
        grievance: z.string().max(2000).nullable(),
        causeEventId: opaqueIdSchema.nullable(),
      })
      .strict(),
    locations: z.array(
      z
        .object({
          id: opaqueIdSchema,
          name: z.string().min(1).max(100),
          status: z.string().min(1).max(100),
        })
        .strict(),
    ),
    scene: sceneSchema.nullable(),
    recap: recapSchema,
    recentEvents: z.array(worldEventSchema),
    narratorStatus: z.enum(["idle", "working", "fallback"]),
    twitch: z
      .object({ connection: connectionSchema, broadcast: broadcastSchema })
      .strict(),
    rehearsal: z.boolean(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (new Set(snapshot.factions.map((faction) => faction.id)).size !== 2)
      context.addIssue({
        code: "custom",
        path: ["factions"],
        message: "Red and Blue must each occur once.",
      });
    if (
      new Set(snapshot.locations.map((location) => location.id)).size !==
      snapshot.locations.length
    )
      context.addIssue({
        code: "custom",
        path: ["locations"],
        message: "Location IDs must be unique.",
      });
  });
export const historyPageSchema = z
  .object({
    events: z.array(worldEventSchema),
    nextCursor: z.number().int().positive().nullable(),
  })
  .strict();
export const apiErrorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string() }).strict(),
  })
  .strict();
export const creatorCommandSchema = z
  .object({ requestId: opaqueIdSchema })
  .strict();
export const openRoundCommandSchema = creatorCommandSchema.extend({
  durationSeconds: z.number().int().min(10).max(300).optional(),
});
export const createWorldCommandSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    rehearsal: z.boolean().optional(),
  })
  .strict();

export const rehearsalChatCommandSchema = creatorCommandSchema.extend({
  viewer: z.enum(["red", "blue"]),
  text: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^!(?:join\s+(?:red|blue)|vote\s+[123])$/i),
});
export type RehearsalChatCommand = z.infer<typeof rehearsalChatCommandSchema>;

export type FactionId = z.infer<typeof factionIdSchema>;
export type EncounterId = z.infer<typeof encounterIdSchema>;
export type WorldEvent = z.infer<typeof worldEventSchema>;
export type Round = z.infer<typeof roundSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type WorldSnapshot = z.infer<typeof worldSnapshotSchema>;
export type ContributionCredit = z.infer<typeof contributionCreditSchema>;
export type Recap = z.infer<typeof recapSchema>;
export type HistoryPage = z.infer<typeof historyPageSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type CreatorCommand = z.infer<typeof creatorCommandSchema>;
