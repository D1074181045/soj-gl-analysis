import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserMatches } from "@/lib/data";
import UploadForm from "@/components/UploadForm";
import MatchCard from "@/components/MatchCard";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const matches = getUserMatches(user.id);

  return (
    <div className="flex flex-col gap-6">
      <UploadForm />
      <section>
        <h2 className="mb-3 font-semibold">
          我的場次{matches.length > 0 && `（${matches.length}）`}
        </h2>
        {matches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-baseline p-8 text-center text-sm text-muted">
            尚未上傳任何幫戰結算，請從上方上傳 CSV 檔案。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
