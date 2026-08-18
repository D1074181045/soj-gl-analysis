import { redirect } from "next/navigation";
import TeamConfig from "@/components/TeamConfig";
import { getCurrentUser } from "@/lib/auth";
import { getAllyRoster, getTeamAssignments } from "@/lib/data";

export default async function TeamsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const roster = getAllyRoster(user.id);
  const assignments = getTeamAssignments(user.id);
  return <TeamConfig roster={roster} initialAssignments={assignments} />;
}
