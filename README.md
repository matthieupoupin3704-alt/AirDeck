# AirDeck 🎧

AirDeck is a Decky Loader plugin for the Steam Deck that integrates mobile media playback controls directly into the Quick Access Menu (QAM) via Bluetooth (BlueZ DBus).

It controls your music (Apple Music so no Cider to buy, Spotify, etc.) playing from your phone or external device right while gaming. It is really useful to play Forza Horizon 6.

---

## Features

* **Media Controls:** Play, Pause, Next, Previous, Shuffle, Repeat and Track Positioning directly from SteamOS.
* **Now Playing Info:** Displays track title, artist and cover via a Toast Notification.
* **Artwork Fetching:** Dynamically fetches (iTunes and MusicBrainz APIs) and displays album art via Bluetooth metadata, since this information is not conveyed through AVRCP.
* **As Lightweight As Possible:** Built using native BlueZ DBus interfaces (`org.bluez.MediaPlayer1`).

---

## Development & Deployment

### Prerequisites

* **Node.js & pnpm** (for the frontend React/TypeScript part)
* **Decky Loader** installed on your Steam Deck
* **SSH enabled** on your Steam Deck

### Quick Deploy (Local Development)

To avoid typing your password every time, it is highly recommended to copy your SSH key to your Steam Deck first:
```bash
ssh-copy-id deck@<YOUR_STEAM_DECK_IP>

Once set up, you can build and deploy the plugin with the following commands. Replace <YOUR_STEAM_DECK_IP> with your Deck's actual IP address:

# 1. Build the frontend
pnpm build

# 2. Deploy files to the Steam Deck
DECK_IP="<YOUR_STEAM_DECK_IP>"
PLUGIN_DIR="~/homebrew/plugins/AppleMusicDeck"

scp dist/index.js deck@$DECK_IP:$PLUGIN_DIR/dist/
scp main.py deck@$DECK_IP:$PLUGIN_DIR/

# 3. Restart Decky to apply changes (Enter your sudo password when prompted)
ssh -t deck@$DECK_IP "sudo systemctl restart plugin_loader"

Checking Logs
To monitor your plugin's backend logs and debug API fetches (iTunes/MusicBrainz) or DBus signals in real-time:

ssh deck@<YOUR_STEAM_DECK_IP> "journalctl -u plugin_loader -f --no-pager | grep -i 'bluez\|apple\|artwork'"