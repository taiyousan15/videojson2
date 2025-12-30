"use client";

interface Entity {
  id: string;
  type: string;
  name: string;
  appearances: number;
}

interface EntityTableProps {
  entities: Entity[];
  onEntityClick?: (entity: Entity) => void;
}

export function EntityTable({ entities, onEntityClick }: EntityTableProps) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="border p-2">Type</th>
          <th className="border p-2">Name</th>
          <th className="border p-2">Appearances</th>
        </tr>
      </thead>
      <tbody>
        {entities.map((entity) => (
          <tr
            key={entity.id}
            className="cursor-pointer hover:bg-gray-100"
            onClick={() => onEntityClick?.(entity)}
          >
            <td className="border p-2">{entity.type}</td>
            <td className="border p-2">{entity.name}</td>
            <td className="border p-2">{entity.appearances}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
