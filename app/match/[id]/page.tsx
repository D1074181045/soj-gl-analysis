import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import MatchView from "@/components/MatchView";
import { getCurrentUser } from "@/lib/auth";
import {
  getMatchForUser,
  getMatchTeamOverrides,
  getTeamAssignments,
  getUserSubRoles,
  getUserTeams,
} from "@/lib/data";

export default async function MatchPage(props: PageProps<"/match/[id]">) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const match = await getMatchForUser(Number(id), user.id);
  if (!match) notFound();
  const [teams, matchTeams, userTeams, userSubRoles] = await Promise.all([
    getTeamAssignments(user.id),
    getMatchTeamOverrides(match.id),
    getUserTeams(user.id),
    getUserSubRoles(user.id),
  ]);
  const teamNames = userTeams.map((t) => t.name);
  const subRoleNames = userSubRoles.map((s) => s.name);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-ink2 hover:text-ink">
          ← 回我的場次
        </Link>
        {match.shareToken && (
          <span className="text-xs text-muted">
            分享中：/share/{match.shareToken}
          </span>
        )}
      </div>
      <MatchView
        match={match}
        teams={teams}
        matchTeams={matchTeams}
        teamNames={teamNames}
        subRoleNames={subRoleNames}
      />
    </div>
  );
}
