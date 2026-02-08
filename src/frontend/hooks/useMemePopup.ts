import { useEffect, useState } from "react";
import { fetchApi } from "../utils/fetch";

const POPUP_COOLDOWN = 5 * 60 * 1000;
const POPUP_CHANCE = 0.05;
const STORAGE_KEY = "lastMemePopup";

export function useMemePopup() {
  const [meme, setMeme] = useState<{ url: string } | null>(null);

  const fetchMeme = async (type?: "win" | "loss", skipCooldown = false) => {
    const lastPopupStr = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();

    if (!skipCooldown && lastPopupStr) {
      const lastPopup = parseInt(lastPopupStr, 10);
      if (now - lastPopup < POPUP_COOLDOWN) {
        return;
      }
    }

    if (!skipCooldown && Math.random() > POPUP_CHANCE) {
      return;
    }

    try {
      const url = type
        ? `/api/v1/memes/random?type=${type}`
        : "/api/v1/memes/random";
      const data = await fetchApi<{ meme: { url: string } | null }>(url);
      if (data.meme) {
        setMeme(data.meme);
        localStorage.setItem(STORAGE_KEY, now.toString());
      }
    } catch (err) {
      console.error("Failed to fetch random meme:", err);
    }
  };

  useEffect(() => {
    fetchMeme();
  }, []);

  return {
    meme,
    closeMeme: () => setMeme(null),
    triggerMeme: (type?: "win" | "loss") => fetchMeme(type, true),
  };
}
