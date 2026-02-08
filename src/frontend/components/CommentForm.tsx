import { useState } from "react";
import { fetchApi } from "../utils/fetch";
import { MemePicker } from "./MemePicker";

interface CommentFormProps {
  matchId: string;
  onCommentAdded: () => void;
}

export function CommentForm({ matchId, onCommentAdded }: CommentFormProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showMemePicker, setShowMemePicker] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    try {
      setSubmitting(true);
      setError("");

      await fetchApi(`/api/v1/match/${matchId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });

      setContent("");
      onCommentAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMemeSelect = (memeUrl: string) => {
    setContent((prev) => `${prev}\n![meme](${memeUrl})\n`);
    setShowMemePicker(false);
  };

  const remainingChars = 1000 - content.length;

  return (
    <div className="mb-6">
      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Drop your shitpost here..."
          maxLength={1000}
          rows={4}
          className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="flex justify-between items-center mt-2">
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setShowMemePicker(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium"
            >
              Add Meme
            </button>
            <span
              className={`text-sm ${remainingChars < 100 ? "text-red-600" : "text-gray-500"}`}
            >
              {remainingChars} characters remaining
            </span>
          </div>
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50"
          >
            {submitting ? "Posting..." : "Post Comment"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <MemePicker
        isOpen={showMemePicker}
        onClose={() => setShowMemePicker(false)}
        onSelectMeme={handleMemeSelect}
      />
    </div>
  );
}
