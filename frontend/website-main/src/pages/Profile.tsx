import { useState } from "react";
import { Camera, Music, User2 } from "lucide-react";

export default function Profile() {
  const [displayName, setDisplayName] = useState("Cathy Wang");
  const [bio, setBio] = useState("Discovering what’s next. Indie, niche, new.");

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Basic profile info (demo only).
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl border border-border bg-background">
              <User2 className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{displayName}</div>
              <div className="truncate text-sm text-muted-foreground">
                @demo_user
              </div>
            </div>
          </div>

          <button
            type="button"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm hover:bg-accent"
          >
            <Camera className="h-4 w-4" />
            Change photo
          </button>

          <div className="mt-6 space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Music className="h-4 w-4" />
              Taste: “Underground / New Releases”
            </div>
            <div className="text-muted-foreground">Location: Sydney (demo)</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-4 outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="mt-2 min-h-[110px] w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:opacity-90"
                onClick={() => console.log("Saved profile", { displayName, bio })}
              >
                Save changes
              </button>
              <button
                type="button"
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  setDisplayName("Cathy Wang");
                  setBio("Discovering what’s next. Indie, niche, new.");
                }}
              >
                Reset
              </button>
            </div>

            <div className="text-xs text-muted-foreground">
              Demo only — changes are not persisted.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
