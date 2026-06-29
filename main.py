import re
import json
import subprocess
import asyncio
import aiohttp
import decky_plugin

BLUEZ_IFACE = "org.bluez.MediaPlayer1"
BLUEZ_PATH_RE = re.compile(r"/org/bluez/hci\d+/dev_[0-9A-F_]+/avrcp/player\d+$")


def _as_deck(cmd):
    return ["sudo", "-u", "deck"] + cmd


def _run(cmd, timeout=5):
    """Run a command, never raise. Returns CompletedProcess or None on failure."""
    try:
        return subprocess.run(
            _as_deck(cmd), capture_output=True, text=True, timeout=timeout
        )
    except Exception as e:
        decky_plugin.logger.warning(f"subprocess error: {e}")
        return None


def _run_json(cmd, timeout=5):
    """Run a command and parse its stdout as JSON, never raise."""
    r = _run(cmd, timeout)
    if r is None or r.returncode != 0 or not r.stdout.strip():
        return None
    try:
        return json.loads(r.stdout)
    except (json.JSONDecodeError, ValueError):
        return None


def _find_bluez_player(current: str | None = None) -> str | None:
    # Prefer whichever player is actually "playing" (a phone can expose several AVRCP players,
    # e.g. Apple Music + SoundCloud — the idle one keeps a stale, frozen Position). Fall back to
    # the current one if nothing is playing, else the first found.
    r = _run(["busctl", "--system", "tree", "org.bluez"])
    if r is None:
        return current
    players = []
    for line in r.stdout.splitlines():
        m = BLUEZ_PATH_RE.search(line)
        if m:
            players.append(m.group(0))
    if not players:
        return None
    for p in players:
        data = _run_json(["busctl", "--system", "--json=short", "get-property",
                          "org.bluez", p, BLUEZ_IFACE, "Status"])
        if data and data.get("data") == "playing":
            return p
    return current if current in players else players[0]


def _bluez_get(path, prop):
    return _run_json(["busctl", "--system", "--json=short", "get-property",
                      "org.bluez", path, BLUEZ_IFACE, prop])


def _bluez_get_all(path):
    parsed = _run_json(["busctl", "--system", "--json=short", "call",
                        "org.bluez", path, "org.freedesktop.DBus.Properties",
                        "GetAll", "s", BLUEZ_IFACE])
    if not parsed:
        return None
    items = parsed.get("data", [])
    return items[0] if items else None


def _bluez_call(path, method):
    _run(["busctl", "--system", "call", "org.bluez", path, BLUEZ_IFACE, method])


def _bluez_set(path, prop, sig, val):
    _run(["busctl", "--system", "set-property",
          "org.bluez", path, BLUEZ_IFACE, prop, sig, val])


_fetch_locks: dict = {}


async def _fetch_artwork(cache: dict, title: str, artist: str) -> str:
    key = (title, artist)
    if key in cache:
        return cache[key]
    if not title:
        return ""

    # prevent concurrent fetches for the same track
    if key in _fetch_locks:
        await _fetch_locks[key].wait()
        return cache.get(key, "")
    event = asyncio.Event()
    _fetch_locks[key] = event

    async def _from_itunes(session) -> str:
        try:
            async with session.get(
                "https://itunes.apple.com/search",
                params={"term": f"{artist} {title}", "entity": "song", "limit": "1"},
                timeout=aiohttp.ClientTimeout(total=4)
            ) as resp:
                if resp.status == 200:
                    results = (await resp.json(content_type=None)).get("results", [])
                    if results:
                        return results[0].get("artworkUrl100", "").replace("100x100bb", "600x600bb")
        except Exception:
            pass
        return ""

    async def _from_musicbrainz(session) -> str:
        try:
            async with session.get(
                "https://musicbrainz.org/ws/2/recording/",
                params={"query": f'recording:"{title}" AND artist:"{artist}"', "limit": "1", "fmt": "json"},
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                if resp.status != 200:
                    return ""
                data = await resp.json(content_type=None)
                recordings = data.get("recordings", [])
                releases = recordings[0].get("releases", []) if recordings else []
                mbid = releases[0].get("id", "") if releases else ""
            if not mbid:
                return ""
            async with session.get(
                f"https://coverartarchive.org/release/{mbid}/front-250",
                allow_redirects=False,
                timeout=aiohttp.ClientTimeout(total=5)
            ) as cover_resp:
                if cover_resp.status in (301, 302, 307, 308):
                    return cover_resp.headers.get("Location", "")
        except Exception:
            pass
        return ""

    try:
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(
            headers={"User-Agent": "AirDeck/1.0 (decky-plugin)"},
            connector=connector
        ) as session:
            # Provider priority. MusicBrainz first, iTunes as fallback.
            for provider in (_from_musicbrainz, _from_itunes):
                url = await provider(session)
                if url:
                    cache[key] = url
                    return url
            cache[key] = ""
            return ""
    except Exception as e:
        decky_plugin.logger.warning(f"artwork error: {e}")
        cache[key] = ""
        return ""
    finally:
        _fetch_locks.pop(key, None)
        event.set()


class Plugin:
    _bluez_path = None
    _artwork_cache: dict = {}

    async def get_metadata(self):
        path = self._bluez_path
        if not path:
            return {"no_device": True}
        props = _bluez_get_all(path)
        if not props:
            return {"no_device": True}
        track = props.get("Track", {}).get("data", {})
        if not isinstance(track, dict):
            track = {}

        def _s(d, key):
            v = d.get(key, {})
            v = v.get("data", "") if isinstance(v, dict) else ""
            return v if isinstance(v, str) else ""

        def _ms_to_s(d, key):
            v = d.get(key, {})
            v = v.get("data", 0) if isinstance(v, dict) else 0
            return v / 1000 if isinstance(v, (int, float)) else 0

        title = _s(track, "Title")
        artist = _s(track, "Artist")
        album = _s(track, "Album")
        duration = _ms_to_s(track, "Duration")
        raw_status = _s(props, "Status") or "stopped"
        status = "Playing" if raw_status == "playing" else "Paused" if raw_status == "paused" else "Stopped"
        pos_data = _bluez_get(path, "Position")
        position = _ms_to_s({"Position": pos_data}, "Position") if pos_data else _ms_to_s(props, "Position")
        is_repeat = _s(props, "Repeat") or "off"
        is_shuffle = _s(props, "Shuffle") or "off"
        art_url = await _fetch_artwork(self._artwork_cache, title, artist)

        return {
            "title": title,
            "artist": artist,
            "album": album,
            "art_url": art_url,
            "length": duration,
            "status": status,
            "position": position,
            "isrepeat": is_repeat,
            "isshuffle": is_shuffle,
        }

    async def play_pause(self, playing: bool):
        path = self._bluez_path
        if path:
            _bluez_call(path, "Pause" if playing else "Play")

    async def next(self):
        if self._bluez_path:
            _bluez_call(self._bluez_path, "Next")

    async def previous(self):
        if self._bluez_path:
            _bluez_call(self._bluez_path, "Previous")

    async def stop(self):
        if self._bluez_path:
            _bluez_call(self._bluez_path, "Stop")

    async def shuffle(self):
        path = self._bluez_path
        if not path:
            return
        data = _bluez_get(path, "Shuffle")
        current = data.get("data", "off") if data else "off"
        _bluez_set(path, "Shuffle", "s", "off" if current != "off" else "alltracks")

    async def repeat(self):
        path = self._bluez_path
        if not path:
            return
        data = _bluez_get(path, "Repeat")
        current = data.get("data", "off") if data else "off"
        new_val = "alltracks" if current == "off" else "off"
        _bluez_set(path, "Repeat", "s", new_val)

    async def _main(self):
        decky_plugin.logger.info("AirDeck started")
        while True:
            self._bluez_path = _find_bluez_player(self._bluez_path)
            await asyncio.sleep(5)
