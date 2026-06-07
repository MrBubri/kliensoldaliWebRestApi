import { useState, useEffect } from "react";
import type { Table } from "../types/types";
import { canPlaceTableAt, getTableSize } from "../utils/placement";

const API_URL = import.meta.env.VITE_API_URL;

function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
    "X-Neptun-Code": import.meta.env.VITE_NEPTUN_CODE ?? "",
  };
}

export function useTables(roomSize: { width: number; height: number }) {
  const [tables, setTables] = useState<Table[]>([]);

  type ApiTable = Omit<Table, "is-locked"> & { isLocked: boolean };

  useEffect(() => {
    fetch(`${API_URL}/api/v1/tables`, {
      headers: {
        "X-Neptun-Code": import.meta.env.VITE_NEPTUN_CODE ?? "",
      },
    })
      .then((res) => res.json())
      .then((data: ApiTable[]) =>
        setTables(
          data.map((t) => ({
            ...t,
            "is-locked": t.isLocked,
          })),
        ),
      )
      .catch(() => console.error("Nem sikerült betölteni az asztalokat."));
  }, []);

  const conflictingIds = new Set<number>(
    tables.flatMap((t) => {
      const ok = canPlaceTableAt(t, t.position, tables, roomSize);
      return ok ? [] : [t.id];
    }),
  );

  const handleMove = (id: number, pos: { x: number; y: number }) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t["is-locked"]) return t;

        const size = getTableSize(t.type);
        const clamped = {
          x: Math.min(
            Math.max(pos.x, size.clearance),
            roomSize.width - size.width - size.clearance,
          ),
          y: Math.min(
            Math.max(pos.y, size.clearance),
            roomSize.height - size.height - size.clearance,
          ),
        };

        return { ...t, position: clamped };
      }),
    );
  };

  const commitMove = async (id: number, pos: { x: number; y: number }) => {
    const t = tables.find((x) => x.id === id);
    if (t?.["is-locked"]) return;

    await fetch(`${API_URL}/api/v1/tables/${id}/position`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ x: pos.x, y: pos.y }),
    });
  };

  const handleDelete = async (id: number) => {
    await fetch(`${API_URL}/api/v1/tables/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setTables((prev) => prev.filter((t) => t.id !== id));
  };

  const handleUpdateStatus = (id: number, status: number) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  };

  const handleUpdateColor = (id: number, color: string) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)));
  };

  const handleUpdatePosition = (id: number, pos: { x: number; y: number }) => {
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, position: pos } : t)),
    );
  };

  const handleUpdateLocked = (id: number, locked: boolean) => {
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, "is-locked": locked } : t)),
    );
  };

  const handleSaveTable = async (id: number, updates: Partial<Table>) => {
    const body: Record<string, unknown> = {};

    if (updates.status !== undefined) body.status = updates.status;
    if (updates.color !== undefined) body.color = updates.color;
    if (updates["is-locked"] !== undefined)
      body.isLocked = updates["is-locked"];
    if (updates.position !== undefined) {
      body.x = updates.position.x;
      body.y = updates.position.y;
    }

    const res = await fetch(`${API_URL}/api/v1/tables/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      alert("Nem sikerült menteni a módosításokat.");
      return;
    }

    const updated = await res.json();
    const normalized = {
      ...updated,
      "is-locked": updated.isLocked,
    };
    setTables((prev) => prev.map((t) => (t.id === id ? normalized : t)));
  };

  const handleCreateRequest = async (partial: Omit<Table, "id">) => {
    const { width, height, clearance } = getTableSize(partial.type);
    const { x, y } = partial.position;

    if (
      x - clearance < 0 ||
      y - clearance < 0 ||
      x + width + clearance > roomSize.width ||
      y + height + clearance > roomSize.height
    ) {
      alert("Az asztal nem kerülhet a terem falán kívülre.");
      return;
    }

    const res = await fetch(`${API_URL}/api/v1/tables`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ...partial,
        isLocked: partial["is-locked"],
      }),
    });

    if (!res.ok) {
      alert("Nem sikerült létrehozni az asztalt.");
      return;
    }

    const created = await res.json();
    const normalized = { ...created, "is-locked": created.isLocked };
    setTables((prev) => [...prev, normalized]);
    return normalized;
  };

  return {
    tables,
    conflictingIds,
    handleMove,
    commitMove,
    handleDelete,
    handleUpdateStatus,
    handleUpdateColor,
    handleUpdatePosition,
    handleUpdateLocked,
    handleSaveTable,
    handleCreateRequest,
  };
}
