import React from 'react';

export default function AnalysisBox({ analysis }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-5 h-5 text-accent"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <h2 className="text-text-primary font-semibold text-sm uppercase tracking-wider">
          Market Analysis
        </h2>
      </div>
      <p className="text-text-secondary text-base leading-relaxed whitespace-pre-line">
        {analysis || 'Waiting for analysis...'}
      </p>
    </div>
  );
}
