"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export function ComptableDashboardCharts({
  days,
  counts,
}: {
  days: string[];
  counts: number[];
}) {
  const data = {
    labels: days,
    datasets: [
      {
        label: "Écritures",
        data: counts,
        backgroundColor: "rgba(26,111,191,0.15)",
        borderColor: "#1a6fbf",
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0f172a",
        titleColor: "#f8fafc",
        bodyColor: "#94a3b8",
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#94a3b8", font: { size: 11 } },
      },
      y: {
        grid: { color: "#f1f5f9" },
        ticks: { color: "#94a3b8", font: { size: 11 }, stepSize: 1 },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="h-56">
      <Bar data={data} options={options} />
    </div>
  );
}
