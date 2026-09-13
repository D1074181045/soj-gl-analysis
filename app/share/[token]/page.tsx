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
  const match = getMatchByShareToken(token);
  if (!match) notFound();
  const teams = getTeamAssignmentsByMatch(match.id);
  const matchTeams = getMatchTeamOverrides(match.id);
  const teamNames = getUserTeamsByMatch(match.id).map((t) => t.name);
  const subRoleNames = getUserSubRolesByMatch(match.id).map((s) => s.name);
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
