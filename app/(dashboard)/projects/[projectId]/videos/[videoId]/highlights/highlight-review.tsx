"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface HighlightCandidate {
  segmentId: string;
  startTime: number;
  endTime: number;
  score: number;
  category: string;
  description: string;
}

interface FeedbackSummary {
  avgRating: number;
  count: number;
}

interface HighlightReviewProps {
  videoId: string;
  artifactUri: string;
  feedbackBySegment: Record<string, FeedbackSummary>;
}

// Mock data for development
const MOCK_HIGHLIGHTS: HighlightCandidate[] = [
  {
    segmentId: "seg-001",
    startTime: 30,
    endTime: 45,
    score: 0.92,
    category: "action",
    description: "Exciting action sequence with dramatic tension",
  },
  {
    segmentId: "seg-002",
    startTime: 120,
    endTime: 135,
    score: 0.88,
    category: "dialogue",
    description: "Key dialogue revealing plot twist",
  },
  {
    segmentId: "seg-003",
    startTime: 200,
    endTime: 220,
    score: 0.85,
    category: "emotional",
    description: "Emotional climax of the scene",
  },
  {
    segmentId: "seg-004",
    startTime: 300,
    endTime: 315,
    score: 0.82,
    category: "visual",
    description: "Stunning visual composition",
  },
];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function StarRating({
  rating,
  onRate,
  disabled = false,
}: {
  rating: number;
  onRate: (r: number) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onRate(star)}
          className={`text-2xl transition-colors ${
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          } ${
            star <= (hovered || rating)
              ? "text-yellow-400"
              : "text-gray-300"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function HighlightCard({
  highlight,
  feedback,
  onSubmitFeedback,
}: {
  highlight: HighlightCandidate;
  feedback?: FeedbackSummary;
  onSubmitFeedback: (segmentId: string, rating: number, comment: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await onSubmitFeedback(highlight.segmentId, rating, comment);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const categoryColors: Record<string, string> = {
    action: "bg-red-100 text-red-800",
    dialogue: "bg-blue-100 text-blue-800",
    emotional: "bg-purple-100 text-purple-800",
    visual: "bg-green-100 text-green-800",
    default: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                categoryColors[highlight.category] || categoryColors.default
              }`}
            >
              {highlight.category}
            </span>
            <span className="text-sm text-gray-500">
              {formatTime(highlight.startTime)} - {formatTime(highlight.endTime)}
            </span>
            <span className="text-sm font-medium text-blue-600">
              Score: {(highlight.score * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-gray-700">{highlight.description}</p>

          {feedback && (
            <div className="mt-2 text-sm text-gray-500">
              平均評価: {feedback.avgRating.toFixed(1)} / 5 ({feedback.count}件)
            </div>
          )}
        </div>

        <div className="ml-4 text-right">
          <div className="text-xs text-gray-400 mb-1">
            {highlight.segmentId}
          </div>
        </div>
      </div>

      {/* Feedback Form */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        {submitted ? (
          <div className="text-green-600 text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            フィードバックを送信しました
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">評価:</span>
              <StarRating rating={rating} onRate={setRating} disabled={submitting} />
            </div>
            <div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="コメント（任意）"
                disabled={submitting}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                rows={2}
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={rating === 0 || submitting}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  送信中...
                </>
              ) : (
                "フィードバックを送信"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function HighlightReview({
  videoId,
  artifactUri,
  feedbackBySegment,
}: HighlightReviewProps) {
  const router = useRouter();
  const [highlights, setHighlights] = useState<HighlightCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localFeedback, setLocalFeedback] = useState(feedbackBySegment);

  useEffect(() => {
    // In production, fetch highlights from artifactUri via signed URL
    // For development, use mock data
    const loadHighlights = async () => {
      try {
        // Simulate loading from GCS
        await new Promise((resolve) => setTimeout(resolve, 500));
        setHighlights(MOCK_HIGHLIGHTS);
      } catch (err) {
        setError("Failed to load highlights");
      } finally {
        setLoading(false);
      }
    };

    loadHighlights();
  }, [artifactUri]);

  const handleSubmitFeedback = async (
    segmentId: string,
    rating: number,
    comment: string
  ) => {
    const response = await fetch(`/api/videos/${videoId}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentId, rating, comment }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to submit feedback");
    }

    // Update local feedback state
    setLocalFeedback((prev) => ({
      ...prev,
      [segmentId]: {
        avgRating: prev[segmentId]
          ? (prev[segmentId].avgRating * prev[segmentId].count + rating) /
            (prev[segmentId].count + 1)
          : rating,
        count: (prev[segmentId]?.count || 0) + 1,
      },
    }));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        <p className="mt-4 text-gray-500">ハイライト候補を読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          ハイライト候補 ({highlights.length}件)
        </h2>
        <div className="text-sm text-gray-500">
          スコア順に表示
        </div>
      </div>

      {highlights.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          ハイライト候補が見つかりませんでした
        </div>
      ) : (
        <div>
          {highlights
            .sort((a, b) => b.score - a.score)
            .map((highlight) => (
              <HighlightCard
                key={highlight.segmentId}
                highlight={highlight}
                feedback={localFeedback[highlight.segmentId]}
                onSubmitFeedback={handleSubmitFeedback}
              />
            ))}
        </div>
      )}
    </div>
  );
}
