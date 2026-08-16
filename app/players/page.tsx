import { redirect } from "next/navigation";
import PlayerCompare from "@/components/PlayerCompare";
import { getCurrentUser } from "@/lib/auth";
import { getPlayerHistoryIndex } from "@/lib/data";

export default async function PlayersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const entries = getPlayerHistoryIndex(user.id);
  return <PlayerCompare entries={entries} />;
}
