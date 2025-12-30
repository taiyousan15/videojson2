export interface ScoringWeights {
  action_intensity: number;
  face_presence: number;
  audio_energy: number;
  text_density: number;
  scene_change: number;
}

export interface SegmentFeatures {
  actionIntensity: number;
  facePresence: number;
  audioEnergy: number;
  textDensity: number;
  sceneChange: number;
}

export interface ScoredSegment {
  id: string;
  start: number;
  end: number;
  score: number;
  features: SegmentFeatures;
}

export function scoreSegments(
  events: any[],
  weights: ScoringWeights
): ScoredSegment[] {
  // Group events into segments
  const segments = groupIntoSegments(events);

  return segments.map((segment, i) => {
    const features = extractFeatures(segment);
    const score = computeScore(features, weights);

    return {
      id: `segment_${i}`,
      start: segment.start,
      end: segment.end,
      score,
      features,
    };
  });
}

function groupIntoSegments(events: any[]): { start: number; end: number; events: any[] }[] {
  // Group events into ~30 second segments
  const SEGMENT_DURATION = 30;
  const segments: { start: number; end: number; events: any[] }[] = [];

  if (events.length === 0) return segments;

  const maxEnd = Math.max(...events.map((e) => e.end));

  for (let start = 0; start < maxEnd; start += SEGMENT_DURATION) {
    const end = start + SEGMENT_DURATION;
    const segmentEvents = events.filter(
      (e) => e.start < end && e.end > start
    );

    if (segmentEvents.length > 0) {
      segments.push({ start, end, events: segmentEvents });
    }
  }

  return segments;
}

function extractFeatures(segment: { events: any[] }): SegmentFeatures {
  const events = segment.events;

  // Calculate feature scores (simplified)
  const actionIntensity = events.filter((e) =>
    ["action", "movement", "gesture"].includes(e.type)
  ).length / events.length;

  const facePresence = events.filter((e) =>
    e.entities?.some((id: string) => id.startsWith("person_"))
  ).length / events.length;

  const audioEnergy = events.filter((e) =>
    ["speech", "music", "sound"].includes(e.type)
  ).length / events.length;

  const textDensity = events.filter((e) =>
    e.type === "text" || e.type === "caption"
  ).length / events.length;

  const sceneChange = new Set(events.map((e) => e.chapterId)).size / events.length;

  return {
    actionIntensity: Math.min(1, actionIntensity),
    facePresence: Math.min(1, facePresence),
    audioEnergy: Math.min(1, audioEnergy),
    textDensity: Math.min(1, textDensity),
    sceneChange: Math.min(1, sceneChange),
  };
}

function computeScore(features: SegmentFeatures, weights: ScoringWeights): number {
  return (
    features.actionIntensity * weights.action_intensity +
    features.facePresence * weights.face_presence +
    features.audioEnergy * weights.audio_energy +
    features.textDensity * weights.text_density +
    features.sceneChange * weights.scene_change
  );
}
