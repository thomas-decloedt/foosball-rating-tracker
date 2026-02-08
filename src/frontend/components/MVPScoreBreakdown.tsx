import { Tooltip } from "./Tooltip";

interface MVPScoreBreakdownProps {
  breakdown?: {
    bayesianWinRate: number;
    gamesWeight: number;
    netWins: number;
    netWinsContribution: number;
    ratingGain: number;
    ratingGainContribution: number;
    diversityPenalty: number;
    diversityPenaltyContribution: number;
    finalScore: number;
  };
  className?: string;
  children?: React.ReactNode;
}

export function MVPScoreBreakdown({
  breakdown,
  className = "",
  children,
}: MVPScoreBreakdownProps) {
  if (!breakdown) {
    return children ? <>{children}</> : null;
  }

  const tooltipContent = (
    <div className="text-xs space-y-2">
      <div>
        <div className="font-medium mb-1">
          Season Score = (Bayesian Win Rate × Games Weight) + Net Wins
          Contribution + Rating Gain Contribution - Diversity Penalty
          Contribution
        </div>
      </div>
      <div className="pt-1 border-t border-gray-700 space-y-1.5">
        <div>
          <span className="font-medium">Bayesian Win Rate:</span>
          <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
            {breakdown.bayesianWinRate.toFixed(4)}
          </div>
        </div>
        <div>
          <span className="font-medium">Games Weight:</span>
          <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
            {breakdown.gamesWeight.toFixed(4)}
          </div>
        </div>
        <div>
          <span className="font-medium">Net Wins:</span>
          <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
            {breakdown.netWins} (contribution:{" "}
            {breakdown.netWinsContribution.toFixed(4)})
          </div>
        </div>
        <div>
          <span className="font-medium">Rating Gain:</span>
          <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
            {breakdown.ratingGain.toFixed(2)} (contribution:{" "}
            {breakdown.ratingGainContribution.toFixed(4)})
          </div>
        </div>
        <div>
          <span className="font-medium">Diversity Penalty:</span>
          <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
            {breakdown.diversityPenalty.toFixed(4)} (contribution: -
            {breakdown.diversityPenaltyContribution.toFixed(4)})
          </div>
        </div>
        <div className="pt-1 border-t border-gray-700">
          <span className="font-medium">Final Score:</span>
          <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
            {breakdown.finalScore.toFixed(4)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Tooltip content={tooltipContent} className={className}>
      {children || (
        <span className="text-gray-400 hover:text-gray-600 cursor-help">?</span>
      )}
    </Tooltip>
  );
}
