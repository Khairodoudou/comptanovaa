"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export function ClientDashboardCharts({
  months,
  counts,
}: {
  months: string[];
  counts: number[];
}) {
  const data = {
    labels: months,
    datasets: [
      {
        label: "Documents",
        data: counts,
        backgroundColor: "rgba(45,143,94,0.15)",
        borderColor: "#2d8f5e",
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
    <div className="h-52">
      <Bar data={data} options={options} />
    </div>
  );
}
