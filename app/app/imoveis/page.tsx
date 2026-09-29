import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export default async function Page() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  return <div>{user.id}:{org?.orgId ?? "no-org"}</div>;
}
