import "server-only";
import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";

/** Name recorded on every change while sign-in is off. */
export function currentUserName(): string {
  return process.env.APP_USER_NAME?.trim() || "Costing In-charge";
}

/** Write one audit entry inside the caller's transaction. */
export async function audit(
  tx: Tx,
  entry: {
    projectId?: string | null;
    entityType: string;
    entityId: string;
    action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "IMPORT" | "ISSUE" | string;
    summary?: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
) {
  await tx.auditLog.create({
    data: {
      projectId: entry.projectId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      summary: entry.summary,
      before: entry.before,
      after: entry.after,
      userName: currentUserName(),
    },
  });
}
