import { z } from "zod";

import { companyRoleSchema } from "./enums";

const emailSchema = z.email().transform((value) => value.trim().toLowerCase());

/** Add a company member by email, creating the user row if it is new. */
export const addMemberSchema = z.strictObject({
  email: emailSchema,
  role: companyRoleSchema,
  name: z.string().trim().min(1).max(120).optional(),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.strictObject({
  role: companyRoleSchema,
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const memberSchema = z.strictObject({
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  role: companyRoleSchema,
  isActive: z.boolean(),
});

export const memberListSchema = z.strictObject({
  members: z.array(memberSchema),
});

export type Member = z.infer<typeof memberSchema>;
export type MemberList = z.infer<typeof memberListSchema>;
