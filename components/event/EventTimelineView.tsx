"use client";

interface Event {
  id: string;
  start: number;
  end: number;
  type: string;
  description?: string;
}

interface EventTimelineViewProps {
  events: Event[];
  duration: number;
  onEventSelect?: (event: Event) => void;
}

export function EventTimelineView({ events, duration, onEventSelect }: EventTimelineViewProps) {
  return (
    <div className="p-4 border rounded">
      <h3>Event Timeline</h3>
      <div className="relative h-20 bg-gray-200">
        {events.map((event) => (
          <div
            key={event.id}
            className="absolute h-full bg-blue-500 opacity-50 cursor-pointer"
            style={{
              left: `${(event.start / duration) * 100}%`,
              width: `${((event.end - event.start) / duration) * 100}%`,
            }}
            onClick={() => onEventSelect?.(event)}
          />
        ))}
      </div>
    </div>
  );
}
