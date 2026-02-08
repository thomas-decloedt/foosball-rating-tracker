import { Link } from "react-router-dom";
import { PlayerLink } from "./PlayerLink";
import { PositionBadge } from "./PositionBadge";
import type { PlayerPositionType } from "@/api-models/position";
import { sortTeamPlayers } from "@/api-models/position";
import { usePreviousWinner } from "../hooks/usePreviousWinner";

export interface MatchCardData {
  id: string;
  team1Player1: {
    id: string;
    displayName: string;
    position?: PlayerPositionType;
  };
  team1Player2: {
    id: string;
    displayName: string;
    position?: PlayerPositionType;
  } | null;
  team2Player1: {
    id: string;
    displayName: string;
    position?: PlayerPositionType;
  };
  team2Player2: {
    id: string;
    displayName: string;
    position?: PlayerPositionType;
  } | null;
  team1Score: number;
  team2Score: number;
  matchType: "1v1" | "1v2" | "2v2";
  winningTeam: number;
  table?: { brand: string; model: string; notes: string | null } | null;
  createdAt: string | Date;
}

interface MatchCardProps {
  match: MatchCardData;
  highlightPlayerId?: string;
  showTable?: boolean;
  showDate?: boolean;
  className?: string;
  clickable?: boolean;
}

export function MatchCard({
  match,
  highlightPlayerId,
  showTable = false,
  showDate = true,
  className = "",
  clickable = true,
}: MatchCardProps) {
  const { previousWinnerId, hasGames } = usePreviousWinner();

  const formatTeam = (
    player1: { id: string; displayName: string; position?: PlayerPositionType },
    player2: {
      id: string;
      displayName: string;
      position?: PlayerPositionType;
    } | null,
  ) => {
    // Sort players: Attack first, then Defense, then alphabetical if both Mixed
    const [firstPlayer, secondPlayer] = sortTeamPlayers(player1, player2);

    if (secondPlayer) {
      return (
        <span className="flex items-center space-x-2">
          {firstPlayer.position && (
            <PositionBadge position={firstPlayer.position} size="sm" />
          )}
          <PlayerLink
            playerId={firstPlayer.id}
            displayName={firstPlayer.displayName}
            asSpan
            showCrown={hasGames && firstPlayer.id === previousWinnerId}
          />
          <span className="text-gray-500">&</span>
          {secondPlayer.position && (
            <PositionBadge position={secondPlayer.position} size="sm" />
          )}
          <PlayerLink
            playerId={secondPlayer.id}
            displayName={secondPlayer.displayName}
            asSpan
            showCrown={hasGames && secondPlayer.id === previousWinnerId}
          />
        </span>
      );
    }
    return (
      <span className="flex items-center space-x-2">
        {firstPlayer.position && (
          <PositionBadge position={firstPlayer.position} size="sm" />
        )}
        <PlayerLink
          playerId={firstPlayer.id}
          displayName={firstPlayer.displayName}
          asSpan
          showCrown={firstPlayer.id === previousWinnerId}
        />
      </span>
    );
  };

  const isPlayerOnWinningTeam = (): boolean => {
    if (!highlightPlayerId) return false;
    if (match.winningTeam === 1) {
      return (
        match.team1Player1.id === highlightPlayerId ||
        match.team1Player2?.id === highlightPlayerId
      );
    } else {
      return (
        match.team2Player1.id === highlightPlayerId ||
        match.team2Player2?.id === highlightPlayerId
      );
    }
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return (
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const won = highlightPlayerId ? isPlayerOnWinningTeam() : false;

  const cardContent = (
    <div
      className={`block bg-white border border-gray-200 rounded-lg p-6 ${
        clickable ? "hover:shadow-md cursor-pointer" : ""
      } transition-shadow ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          <div
            className={`font-semibold ${match.winningTeam === 1 ? "text-green-600" : "text-gray-700"}`}
          >
            {formatTeam(match.team1Player1, match.team1Player2)}
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {match.team1Score} - {match.team2Score}
          </div>
          <div
            className={`font-semibold ${match.winningTeam === 2 ? "text-green-600" : "text-gray-700"}`}
          >
            {formatTeam(match.team2Player1, match.team2Player2)}
          </div>
        </div>
        <div className="flex items-center space-x-4 ml-4">
          {highlightPlayerId && (
            <span
              className={`text-xs font-semibold uppercase px-2 py-1 rounded ${
                won ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}
            >
              {won ? "Won" : "Lost"}
            </span>
          )}
          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full uppercase">
            {match.matchType}
          </span>
          {showTable && match.table && (
            <span className="text-sm text-gray-500 whitespace-nowrap">
              <span className="font-medium">Table:</span> {match.table.brand}{" "}
              {match.table.model}
              {match.table.notes && (
                <span className="text-gray-400 ml-1">
                  ({match.table.notes})
                </span>
              )}
            </span>
          )}
          {showDate && (
            <span className="text-sm text-gray-500 whitespace-nowrap">
              {formatDate(match.createdAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (clickable) {
    return (
      <Link to={`/match/${match.id}`} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
