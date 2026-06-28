"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PoolGame from "@/components/PoolGame";
import {
  fetchState,
  joinLobby,
  postShot,
  postRematch,
  getIdentity,
  setIdentity,
  getSavedName,
  saveName,
  type GameState,
} from "@/lib/client";
import type { Shot } from "@/lib/engine";

export default function Room({ code }: { code: string }) {
  const [state, setState] = useState<GameState | null>(null);
  const [identity, setId] = useState<{ playerId: string; index: 0 | 1 } | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [needJoin, setNeedJoin] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const versionRef = useRef(0);

  const applyIncoming = useCallback((s: GameState) => {
    setState((prev) => {
      if (prev && s.version < versionRef.current) return prev;
      versionRef.current = Math.max(versionRef.current, s.version);
      return s;
    });
  }, []);

  // Initial load + identity resolution.
  useEffect(() => {
    setName(getSavedName());
    const id = getIdentity(code);
    if (id) setId(id);
    fetchState(code)
      .then((s) => {
        applyIncoming(s);
        if (!id) setNeedJoin(true);
      })
      .catch(() => setNotFound(true));
  }, [code, applyIncoming]);

  // Polling loop.
  useEffect(() => {
    if (notFound || needJoin) return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await fetchState(code);
        if (alive) applyIncoming(s);
      } catch {
        /* transient */
      }
    };
    const iv = setInterval(tick, 850);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [code, notFound, needJoin, applyIncoming]);

  async function doJoin() {
    setError("");
    setBusy(true);
    try {
      saveName(name);
      const res = await joinLobby(code, name);
      setIdentity(code, { playerId: res.playerId, index: res.index });
      setId({ playerId: res.playerId, index: res.index });
      applyIncoming(res.state);
      setNeedJoin(false);
    } catch (e: any) {
      setError(e?.message || "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  const onShoot = useCallback(
    async (resolved: GameState, _shot: Shot) => {
      // Optimistic: animate immediately, then confirm with the server.
      applyIncoming(resolved);
      const id = getIdentity(code);
      if (!id) return;
      try {
        const res = await postShot(code, id.playerId, resolved);
        applyIncoming(res.state);
      } catch (e: any) {
        setError(e?.message || "Shot failed to sync.");
      }
    },
    [code, applyIncoming]
  );

  const onRematch = useCallback(async () => {
    const id = getIdentity(code);
    if (!id) return;
    setBusy(true);
    try {
      const res = await postRematch(code, id.playerId);
      applyIncoming(res.state);
    } catch (e: any) {
      setError(e?.message || "Rematch failed.");
    } finally {
      setBusy(false);
    }
  }, [code, applyIncoming]);

  function copy(text: string, which: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(which);
        setTimeout(() => setCopied(""), 1500);
      },
      () => {}
    );
  }

  if (notFound) {
    return (
      <div className="wrap center">
        <Nav />
        <div className="card" style={{ marginTop: 30 }}>
          <h2>Lobby not found</h2>
          <p className="sub">
            This code doesn&apos;t exist or has expired. Lobbies last 6 hours.
          </p>
          <Link className="btn primary" href="/">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (needJoin) {
    return (
      <div className="wrap">
        <Nav />
        <div className="card" style={{ marginTop: 24, maxWidth: 460, margin: "24px auto 0" }}>
          <h2>Join lobby {code}</h2>
          <p className="sub">Enter a name to take your seat.</p>
          <label htmlFor="jn">Your name</label>
          <input
            id="jn"
            type="text"
            value={name}
            maxLength={16}
            placeholder="Enter a name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doJoin()}
          />
          <button
            className="btn primary block"
            style={{ marginTop: 12 }}
            onClick={doJoin}
            disabled={busy}
          >
            {busy ? "Joining…" : "Join game"}
          </button>
          <div className="error">{error}</div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="wrap">
        <Nav />
        <div className="spinner" />
        <p className="center muted">Loading lobby…</p>
      </div>
    );
  }

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/play/${code}` : "";

  return (
    <div className="wrap">
      <Nav />
      <PoolGame
        state={state}
        myIndex={identity?.index ?? null}
        onShoot={onShoot}
        onRematch={onRematch}
        busy={busy}
        topSlot={
          <div className="codeBar">
            <div>
              <div className="label">Join code</div>
              <div className="codeChip">{code}</div>
            </div>
            <div className="row" style={{ marginTop: 0 }}>
              <button className="btn copyBtn" onClick={() => copy(code, "code")}>
                {copied === "code" ? "Copied!" : "Copy code"}
              </button>
              <button className="btn copyBtn" onClick={() => copy(shareUrl, "link")}>
                {copied === "link" ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
        }
      />
      <div className="error center">{error}</div>
    </div>
  );
}

function Nav() {
  return (
    <div className="topnav">
      <Link className="brand" href="/">
        🎱 8-Ball
      </Link>
    </div>
  );
}
