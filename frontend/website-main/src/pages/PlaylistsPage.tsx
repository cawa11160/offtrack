import React, { useMemo, useState } from "react";
import { Plus, Music2, X } from "lucide-react";

type Playlist = {
  id: string;
  name: string;
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([
    { id: "p11", name: "My Playlist #11" },
  ]);

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");

  const sorted = useMemo(() => playlists, [playlists]);

  const openModal = () => {
    setName("");
    setIsOpen(true);
  };

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPlaylists((prev) => [{ id: makeId(), name: trimmed }, ...prev]);
    setIsOpen(false);
  };

  const remove = (id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold text-black">Playlists</div>
          <div className="text-sm text-black/50">Create and manage your playlists</div>
        </div>

        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-black hover:bg-black/5 active:scale-[0.99]"
        >
          <Plus size={18} />
          New playlist
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="text-lg font-semibold text-black">No playlists yet</div>
          <div className="mt-1 text-black/60">Click “New playlist” to create one.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-2xl border border-black/10 bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-black/5">
                  <Music2 size={18} className="text-black" />
                </div>
                <div>
                  <div className="text-base font-semibold text-black">{p.name}</div>
                  <div className="text-sm text-black/50">Public Playlist</div>
                </div>
              </div>

              <button
                onClick={() => remove(p.id)}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-black hover:bg-black/5"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-black/10 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div className="text-lg font-semibold text-black">Create a playlist</div>
              <button
                onClick={() => setIsOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-black/10 hover:bg-black/5"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-5">
              <label className="mb-2 block text-sm font-medium text-black/70">
                Playlist name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Playlist #11"
                className="w-full rounded-xl border border-black/10 px-4 py-3 text-black outline-none focus:ring-2 focus:ring-black/10"
              />

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 hover:bg-black/5"
                >
                  Cancel
                </button>
                <button
                  onClick={create}
                  disabled={!name.trim()}
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
