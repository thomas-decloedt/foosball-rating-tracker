import { useEffect, useState } from "react";
import { ConfirmationModal } from "./ConfirmationModal";
import { fetchApi } from "../utils/fetch";

interface Comment {
  id: string;
  content: string;
  author: {
    id: string;
    name: string;
  };
  createdAt: string | Date;
  canDelete: boolean;
}

interface CommentListProps {
  matchId: string;
  refreshTrigger?: number;
}

export function CommentList({ matchId, refreshTrigger }: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchComments();
  }, [matchId, refreshTrigger]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchApi<{ comments: Comment[] }>(
        `/api/v1/match/${matchId}/comments`,
      );
      setComments(data.comments);
    } catch (err) {
      setError("Failed to load comments");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (commentId: string) => {
    setCommentToDelete(commentId);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!commentToDelete) return;

    try {
      await fetchApi(`/api/v1/match/${matchId}/comments/${commentToDelete}`, {
        method: "DELETE",
      });
      setDeleteModalOpen(false);
      setCommentToDelete(null);
      await fetchComments();
    } catch (err) {
      setError("Failed to delete comment");
      console.error(err);
      // Close modal even on error to prevent grey screen
      setDeleteModalOpen(false);
      setCommentToDelete(null);
    }
  };

  const renderContent = (content: string) => {
    const imageRegex = /!\[.*?\]\((.*?)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {content.substring(lastIndex, match.index)}
          </span>,
        );
      }
      parts.push(
        <img
          key={`img-${match.index}`}
          src={match[1]}
          alt="meme"
          className="max-w-sm rounded-lg my-2"
        />,
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>{content.substring(lastIndex)}</span>,
      );
    }

    return <div className="whitespace-pre-wrap">{parts}</div>;
  };

  if (loading) {
    return (
      <div className="text-center py-4 text-gray-600">Loading comments...</div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        {error}
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No comments yet. Be the first to shitpost!
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className="border border-gray-200 rounded-lg p-4"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="font-semibold text-gray-900">
                  {comment.author.name}
                </span>
                <span className="text-sm text-gray-500 ml-2">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              {comment.canDelete && (
                <button
                  onClick={() => handleDeleteClick(comment.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="text-gray-800">
              {renderContent(comment.content)}
            </div>
          </div>
        ))}
      </div>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Delete Comment"
        message="Are you sure you want to delete this comment?"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setCommentToDelete(null);
        }}
        danger={true}
      />
    </>
  );
}
