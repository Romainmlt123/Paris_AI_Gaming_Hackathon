<p align="center">
  <img src="docs/gameplay.gif" alt="RAGOTS gameplay: talking to Marius, a cartoon fight, then fishing" width="280" />
</p>

# RAGOTS 🏝️ — the island that gossips about you

> *Ragots* is French for "gossip". On this island, everything you say **will** be repeated… and twisted.

A cozy, mobile-first HD-2D island game where every islander is an AI with a personality, a memory and a very loose tongue.
Built in one day for the [Paris AI Gaming Hackathon](https://luma.com/par-hack) ({Tech: Europe}).

## The pitch

You wash up naked on a tiny island. Three locals live there — and they talk. To you, and **about** you.

- Insult the fisherman, and the baker will hear about it by tomorrow.
- Lie to her face, and she might catch you.
- Push someone's friendship too low, and you'll get slapped… then punched… then worse. 💀

Your goal: build the prettiest, most prestigious island in town — without becoming its favorite rumor.

## Meet the islanders

| | Who | Vibe |
|---|---|---|
| 💰 | **Gaston**, the merchant | Stingy, fast-talking hustler. Loves flattery, hates scams he didn't run himself. |
| 🥖 | **Josette**, the baker | Adorable, nosy, the island's gossip hub. Knows everything before you do. |
| 🎣 | **Marius**, the fisherman | Slow, philosophical, touchy. Best friend of Josette (so, careful). |

## What you can do

- 💬 **Talk freely** — type (or speak) anything. Islanders answer in character, with their own voice.
- 🗞️ **Leave and come back** — "Come back in 8 h" simulates island life: islanders chat, rumors spread and mutate, relations shift. Read it all in the *Gossip Gazette*.
- ❤️ **Relationships that bite** — friendship gauges go from BFF to slaps (35%), cartoon brawls (20%)… and murder (0%).
- 🎣 **Fish** — tap the water, strike when the float dips, sell your catch to Gaston or gift it to win hearts.
- 🤝 **Haggle** with Gaston, 🛋️ **shop** for furniture and clothes, 🏠 **decorate** your house and island to raise its prestige.
- 🐔 A living island: chickens, cats, crabs, seagulls, smoking chimneys.

## Sponsor tech we used ⭐

- **Google DeepMind — Gemini** (via Google AI Studio): the islanders' brain. Gemini writes every reply, emotion and relationship change, and simulates what happens while you're away (who told what to whom, and how the rumor got distorted). *The AI proposes, the game decides*: code validates and caps everything, and a local fallback keeps the game playable if the API is down.
- **Google DeepMind — Lyria 3.5**: the island's whole soundtrack. We generated one cue per game moment, and the game crossfades between them as you play (the music ducks while an islander speaks):

  | Cue | When it plays | Length |
  |---|---|---|
  | 🎬 `title` | Title screen | ~1 min 40 |
  | 🛶 `raft` | Intro: washing ashore on your raft | 30 s loop |
  | 🏝️ `island` | Walking around the island | ~2 min loop |
  | 🏠 `interior` | Inside houses and shops | 30 s loop |
  | 🌙 `night` | "Come back later": time skips while you're away | 30 s loop |
  | 😠 `tension` | An islander confronts you about a rumor | 30 s loop |
  | 🥊 `fight` | Cartoon brawl | 30 s loop |
  | 💀 `death` | Friendship hits 0%… | 12 s stinger |
  | 🗞️ `gazette` | The *Gossip Gazette* opens | 10 s stinger |

  The short `death` and `gazette` stingers play once, like big sound effects. Small UI and gameplay sounds (taps, dialogue blips, coins, slaps, punches, splashes, fish bites, doors…) are synthesized live with the Web Audio API, so they stay tiny and instant on mobile. All tracks live in `public/audio/`, and the 🔊/🔇 button mutes music, sound effects and voices together.
- **Gradium**: each islander speaks with their own voice, and you can answer them with your mic.
- **Cognition — Devin**: our AI teammate for coding, testing and shipping features during the hackathon.
- Designed for the **Voodoo** jury: portrait, one-thumb, playable in 30 seconds on a phone.

## The rest of the stack

TypeScript · Vite · Three.js (HD-2D: pixel-art sprites in a 3D diorama) · Canvas 2D interiors · small Node API · Blender scripts for assets · save in LocalStorage.

## Run it

```sh
npm install
cp .env.example .env   # add GEMINI_API_KEY and GRADIUM_API_KEY (optional: the game works offline too)
npm run dev
```

Open the URL on your phone (portrait) or desktop. Controls: tap / click to move and talk · WASD to walk · E to talk or fish · I for the bag.
Tip: add `?reset` to the URL to start a fresh island.
