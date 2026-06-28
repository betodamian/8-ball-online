"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLobby,
  joinLobby,
  setIdentity,
  getSavedName,
  saveName,
} from "@/lib/client";
import { normalizeCode } from "@/lib/ids";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(getSavedName());
  }, []);

  async function handleCreate() {
    setError("");
    setBusy("create");
    try {
      saveName(name);
      const res = await createLobby(name);
      setIdentity(res.code, { playerId: res.playerId, index: res.index });
      router.push(`/play/${res.code}`);
    } catch (e: any) {
      setError(e?.message || "Could not create lobby.");
      setBusy(null);
    }
  }

  async function handleJoin() {
    setError("");
    const c = normalizeCode(code);
    if (c.length < 4) {
      setError("Enter the 4-character join code.");
      return;
    }
    setBusy("join");
    try {
      saveName(name);
      const res = await joinLobby(c, name);
      setIdentity(c, { playerId: res.playerId, index: res.index });
      router.push(`/play/${c}`);
    } catch (e: any) {
      setError(e?.message || "Could not join lobby.");
      setBusy(null);
    }
  }

  return (
    <div className="wrap">
      <div className="hero">
        <div className="logo">🎱</div>
        <h1>8-Ball Pool</h1>
        <p>Private online lobbies. Share a code, rack &apos;em up.</p>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          type="text"
          placeholder="Enter a name"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="cards">
        <div className="card">
          <h2>Create a private lobby</h2>
          <p className="sub">
            You&apos;ll get a join code to share with a friend.
          </p>
          <button
            className="btn primary block"
            onClick={handleCreate}
            disabled={busy !== null}
          >
            {busy === "create" ? "Creating…" : "Create lobby"}
          </button>
        </div>

        <div className="card">
          <h2>Join with a code</h2>
          <p className="sub">Got a code from a friend? Drop it in.</p>
          <input
            className="codeInput"
            type="text"
            placeholder="ABCD"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <button
            className="btn block"
            style={{ marginTop: 12 }}
            onClick={handleJoin}
            disabled={busy !== null}
          >
            {busy === "join" ? "Joining…" : "Join lobby"}
          </button>
        </div>
      </div>

      <div className="error center">{error}</div>

      <div className="footnote">
        Want to play on one screen?{" "}
        <a href="/local">Pass &amp; Play (local 2-player)</a>
      </div>
    </div>
  );
}
