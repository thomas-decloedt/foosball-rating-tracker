import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { calculateConservativeRating, formatRating } from "../utils/rating";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

interface RatingHistoryEntry {
  id: string;
  muBefore: number;
  sigmaBefore: number;
  muAfter: number;
  sigmaAfter: number;
  muChange: number;
  displayBefore: number;
  displayAfter: number;
  createdAt: Date | string;
  matchId: string;
}

interface RatingChartProps {
  history: RatingHistoryEntry[];
}

export function RatingChart({ history }: RatingChartProps) {
  const chartData = useMemo(() => {
    if (history.length === 0) {
      return {
        labels: [],
        datasets: [],
      };
    }

    const sortedHistory = [...history].reverse();

    const labels = sortedHistory.map((entry) => {
      const date = new Date(entry.createdAt);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    });

    const data = sortedHistory.map((entry) =>
      calculateConservativeRating(entry.muAfter, entry.sigmaAfter),
    );

    const pointBackgroundColors = sortedHistory.map((entry) => {
      if (entry.muChange > 0) return "rgb(34, 197, 94)";
      if (entry.muChange < 0) return "rgb(239, 68, 68)";
      return "rgb(59, 130, 246)";
    });

    return {
      labels,
      datasets: [
        {
          label: "Rating",
          data,
          borderColor: "rgb(59, 130, 246)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          pointBackgroundColor: pointBackgroundColors,
          pointBorderColor: pointBackgroundColors,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true,
        },
      ],
    };
  }, [history]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const index = context.dataIndex;
              const entry = [...history].reverse()[index];
              if (!entry) return "";
              const change = entry.muChange;
              const sign = change > 0 ? "+" : "";
              const conservativeRating = calculateConservativeRating(
                entry.muAfter,
                entry.sigmaAfter,
              );
              return [
                `Rating: ${formatRating(conservativeRating)}`,
                `μ: ${entry.muAfter.toFixed(2)}`,
                `σ: ${entry.sigmaAfter.toFixed(2)}`,
                `Change: ${sign}${change.toFixed(2)}`,
              ];
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: {
            color: "rgba(0, 0, 0, 0.05)",
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
    }),
    [history],
  );

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No rating history available
      </div>
    );
  }

  return <Line data={chartData} options={options} />;
}

// Re-export for backwards compatibility
export { RatingChart as EloChart };
