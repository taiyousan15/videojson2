import Ajv from "ajv";
import eventSchema from "../../../../shared/schemas/event.json";

const ajv = new Ajv();
const validateEvent = ajv.compile(eventSchema);

export interface EventExtractionResult {
  eventJson: any;
  valid: boolean;
  errors?: string[];
}

export async function extractEvents(
  coarseResult: any,
  detailedResult: any,
  videoId: string,
  duration: number
): Promise<EventExtractionResult> {
  // Merge coarse and detailed results
  const eventJson = {
    version: "1.1",
    videoId,
    duration,
    chapters: coarseResult.chapters || [],
    events: mergeEvents(coarseResult.events || [], detailedResult.events || []),
    entities: detailedResult.entities || [],
    onScreenTexts: [],
  };

  // Validate against schema
  const valid = validateEvent(eventJson);

  if (!valid) {
    return {
      eventJson,
      valid: false,
      errors: validateEvent.errors?.map((e) => `${e.instancePath}: ${e.message}`) || [],
    };
  }

  return { eventJson, valid: true };
}

function mergeEvents(coarse: any[], detailed: any[]): any[] {
  // Merge coarse and detailed events, preferring detailed when overlapping
  const merged: any[] = [];
  const usedDetailed = new Set<number>();

  for (const coarseEvent of coarse) {
    const overlapping = detailed.filter(
      (d, i) =>
        !usedDetailed.has(i) &&
        d.start < coarseEvent.end &&
        d.end > coarseEvent.start
    );

    if (overlapping.length > 0) {
      for (const detail of overlapping) {
        merged.push({
          ...detail,
          parentChapter: coarseEvent.id,
        });
        usedDetailed.add(detailed.indexOf(detail));
      }
    } else {
      merged.push(coarseEvent);
    }
  }

  // Add remaining detailed events
  for (let i = 0; i < detailed.length; i++) {
    if (!usedDetailed.has(i)) {
      merged.push(detailed[i]);
    }
  }

  return merged.sort((a, b) => a.start - b.start);
}
