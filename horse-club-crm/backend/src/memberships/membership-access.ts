import type { Prisma } from '@prisma/client';

/** clientId remains the purchaser/owner; beneficiaries never replace it. */
export const membershipAccessWhere = (clientId: string): Prisma.MembershipWhereInput => ({
  OR: [{ clientId }, { members: { some: { clientId, client: { deletedAt: null } } } }],
});

export async function canUseMembership(tx: Prisma.TransactionClient, membership: { id: string; clientId: string | null }, clientId: string) {
  if (membership.clientId === clientId) return true;
  const member = await tx.membershipMember.findUnique({
    where: { membershipId_clientId: { membershipId: membership.id, clientId } },
    select: { client: { select: { deletedAt: true } } },
  });
  return Boolean(member && !member.client.deletedAt);
}
