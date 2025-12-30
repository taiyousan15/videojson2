"use client";

import { useState } from "react";

interface FeedbackFormProps {
  highlightId: string;
  onSubmit?: (feedback: { rating: number; comment: string }) => void;
}

export function FeedbackForm({ highlightId, onSubmit }: FeedbackFormProps) {
  const [rating, setRating] = useState(3);
  const [comment, setComment] = useState("");

  const handleSubmit = () => {
    onSubmit?.({ rating, comment });
  };

  return (
    <div className="p-4 border rounded">
      <h3>Feedback</h3>
      <div className="mb-2">
        <label>Rating: </label>
        <input
          type="range"
          min="1"
          max="5"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        />
        <span>{rating}/5</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comments..."
        className="w-full border p-2"
      />
      <button
        onClick={handleSubmit}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Submit Feedback
      </button>
    </div>
  );
}
