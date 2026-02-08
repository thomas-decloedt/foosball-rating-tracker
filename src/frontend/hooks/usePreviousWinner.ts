import { useEffect, useState } from "react";
import { fetchApi } from "../utils/fetch";

interface PreviousWinnerData {
  previousWinnerId: string | null;
  hasGames: boolean;
}

export function usePreviousWinner(): PreviousWinnerData {
  const [data, setData] = useState<PreviousWinnerData>({
    previousWinnerId: null,
    hasGames: false,
  });

  useEffect(() => {
    fetchApi<PreviousWinnerData>("/api/v1/seasons/previous-winner")
      .then((data) => setData(data))
      .catch((err) => {
        console.error("Failed to fetch previous winner:", err);
        setData({ previousWinnerId: null, hasGames: false });
      });
  }, []);

  return data;
}
