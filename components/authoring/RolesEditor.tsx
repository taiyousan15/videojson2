"use client";

interface Role {
  id: string;
  name: string;
  description?: string;
}

interface RolesEditorProps {
  roles: Role[];
  onAdd?: (role: Role) => void;
  onRemove?: (id: string) => void;
  onUpdate?: (role: Role) => void;
}

export function RolesEditor({ roles, onAdd, onRemove, onUpdate }: RolesEditorProps) {
  return (
    <div className="p-4 border rounded">
      <h3>Roles Editor</h3>
      <ul>
        {roles.map((role) => (
          <li key={role.id} className="flex items-center gap-2 p-2 border-b">
            <input
              type="text"
              value={role.name}
              onChange={(e) => onUpdate?.({ ...role, name: e.target.value })}
              className="border p-1"
            />
            <button
              onClick={() => onRemove?.(role.id)}
              className="text-red-500"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => onAdd?.({ id: crypto.randomUUID(), name: "New Role" })}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Add Role
      </button>
    </div>
  );
}
