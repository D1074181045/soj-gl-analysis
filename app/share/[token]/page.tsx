import { notFound } from "next/navigation";
import MatchView from "@/components/MatchView";
import { getMatchByShareToken, getTeamAssignmentsByMatch } from "@/lib/data";

export default async function SharePage(props: PageProps<"/share/[token]">) {
  const { token } = await props.params;
  const match = getMatchByShareToken(token);
  if (!match) notFound();
  const teams = getTeamAssignmentsByMatch(match.id);
  return <MatchView match={match} teams={teams} shareBanner />;
}
