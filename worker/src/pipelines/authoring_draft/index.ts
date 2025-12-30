import { EventJson, AuthoringJson } from "../../../../shared/types";

export function createAuthoringDraft(eventJson: EventJson): AuthoringJson {
  return {
    version: "1.0",
    videoId: eventJson.videoId,
    baseEventJsonUri: undefined,
    overrides: [],
    script: createScriptFromEvents(eventJson),
    roles: createRolesFromEntities(eventJson),
    assets: [],
    style: {
      subtitle: {
        fontFamily: "Noto Sans JP",
        fontSize: 48,
        color: "#FFFFFF",
        backgroundColor: "#00000080",
        position: "bottom",
      },
      safeArea: {
        top: 0.1,
        bottom: 0.1,
        left: 0.05,
        right: 0.05,
      },
    },
  };
}

function createScriptFromEvents(eventJson: EventJson): AuthoringJson["script"] {
  const segments = eventJson.chapters.map((chapter) => {
    const chapterEvents = eventJson.events.filter(
      (e) => e.start >= chapter.start && e.end <= chapter.end
    );

    const narration = chapterEvents
      .filter((e) => e.description)
      .map((e) => e.description)
      .join(" ");

    return {
      id: chapter.id,
      start: chapter.start,
      end: chapter.end,
      narration: chapter.summary || narration,
      subtitle: chapter.title,
    };
  });

  return { segments };
}

function createRolesFromEntities(eventJson: EventJson): AuthoringJson["roles"] {
  const personEntities = eventJson.entities?.filter((e) => e.type === "PERSON") || [];

  return personEntities.map((entity, i) => ({
    id: `role_${i}`,
    name: entity.name || `Person ${i + 1}`,
    entityId: entity.id,
    description: undefined,
  }));
}
