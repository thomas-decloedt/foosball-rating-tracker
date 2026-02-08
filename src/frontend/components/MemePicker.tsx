import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { fetchApi } from "../utils/fetch";

interface Meme {
  id: string;
  type: "gif" | "image";
  url: string;
  isActive: boolean;
}

interface MemePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMeme: (memeUrl: string) => void;
}

export function MemePicker({ isOpen, onClose, onSelectMeme }: MemePickerProps) {
  const [memes, setMemes] = useState<Meme[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchMemes();
    }
  }, [isOpen]);

  const fetchMemes = async () => {
    try {
      setLoading(true);
      const data = await fetchApi<{ memes: Meme[] }>(
        "/api/v1/memes?activeOnly=true",
      );
      setMemes(data.memes);
    } catch (err) {
      console.error("Failed to fetch memes:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Select a Meme</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          {loading ? (
            <div className="text-center py-8 text-gray-600">
              Loading memes...
            </div>
          ) : memes.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No memes available. Ask an admin to add some!
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {memes.map((meme) => (
                <button
                  key={meme.id}
                  onClick={() => onSelectMeme(meme.url)}
                  className="border-2 border-gray-200 rounded-lg p-2 hover:border-blue-500 transition-colors"
                >
                  <img
                    src={meme.url}
                    alt="meme"
                    className="w-full h-32 object-cover rounded"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
