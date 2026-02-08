import type { Env } from "../bindings";

export type StatsHubEventPayload = {
  type: "match-updated";
  players: string[];
  seasons: string[];
  leaderboards: string[];
};

export async function notifyStatsHub(
  env: Env,
  event: StatsHubEventPayload,
): Promise<void> {
  const id = env.STATS_HUB.idFromName("global");
  const stub = env.STATS_HUB.get(id);

  await stub.fetch("https://stats-hub.internal/event", {
    method: "POST",
    body: JSON.stringify(event),
  });
}
