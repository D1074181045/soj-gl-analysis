import { redirect } from "next/navigation";
import TeamConfig from "@/components/TeamConfig";
import { getCurrentUser } from "@/lib/auth";
import {
  getAllyRoster,
  getTeamAssignments,
  getUserSubRoles,
  getUserTeams,
} from "@/lib/data";

export default async function TeamsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [roster, assignments, userTeams, userSubRoles] = await Promise.all([
    getAllyRoster(user.id),
    getTeamAssignments(user.id),
    getUserTeams(user.id),
    getUserSubRoles(user.id),
  ]);
  return (
    <TeamConfig
      roster={roster}
      initialAssignments={assignments}
      initialTeams={userTeams}
      initialSubRoles={userSubRoles}
    />
  );
}
