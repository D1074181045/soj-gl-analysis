import { notFound } from "next/navigation";
import MatchView from "@/components/MatchView";
import {
  getMatchByShareToken,
  getMatchTeamOverrides,
  getTeamAssignmentsByMatch,
  getUserSubRolesByMatch,
  getUserTeamsByMatch,
} from "@/lib/data";

export default async function SharePage(props: PageProps<"/share/[token]">) {
  const { token } = await props.params;
  const match = await getMatchByShareToken(token);
  if (!match) notFound();
  const [teams, matchTeams, userTeams, userSubRoles] = await Promise.all([
    getTeamAssignmentsByMatch(match.id),
    getMatchTeamOverrides(match.id),
    getUserTeamsByMatch(match.id),
    getUserSubRolesByMatch(match.id),
  ]);
  const teamNames = userTeams.map((t) => t.name);
  const subRoleNames = userSubRoles.map((s) => s.name);
  return (
    <MatchView
      match={match}
      teams={teams}
      matchTeams={matchTeams}
      teamNames={teamNames}
      subRoleNames={subRoleNames}
      shareBanner
    />
  );
}
