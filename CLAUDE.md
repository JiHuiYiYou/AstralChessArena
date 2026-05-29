# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"星穹弈境" (Astral Chess Arena) is a single-file HTML auto-chess/auto-battler game. No build tools, no frameworks, no dependencies — open `星穹弈境.html` in any modern browser to play.

## How to Run

```
# Just open in browser — no server needed
start 星穹弈境.html
```

## File Structure

The entire game lives in `星穹弈境.html` (~5042 lines):

| Lines | Section |
|-------|---------|
| 1–1884 | CSS styles (CSS variables, layout, animations, component styles) |
| 1886–1946 | Particle background animation (canvas-based, pauses on tab switch) |
| 1953–2612 | `SoundManager` class — procedural Web Audio API sound effects and BGM (space ambient, battle BGM, UI sounds, lottery sounds, combat sounds) |
| 2613–2634 | Game constants: professions, attributes, operations, prize table |
| 2636–5026 | `Game` class — all game logic |
| 5028–5039 | Initialization and global event listeners |

## Architecture: `Game` Class

The `Game` class holds all state and renders all UI by swapping `innerHTML` of `#main-content`:

### Game State (constructor)
- **Resources**: `gold`, `prizeCount` (lottery spins), `openBoxes` (mystery boxes), `upgradeTickets`, `breakthroughTickets`, `reforgeTickets`, `drugG` (golden pills)
- **Heroes**: `heroes[]` array (both allied `isAlly: true` and enemy `isAlly: false`)
- **Cards**: `cards[]` array (consumable attribute-modifier cards), `cardIndex` counter
- **Market**: 6-item shop with dynamic stock counts
- **Battle**: `battleInProgress`, `battleSpeed` (1/2/4), `battleState`

### Navigation / Sections
`showSection(section)` replaces `#main-content` with one of 5 views:

1. **Workshop** (`renderWorkshop`) — Forge new heroes, synthesize (fuse) two heroes, display all heroes (陈列室), reforge (re-roll), rename
2. **Upgrade** (`renderUpgrade`) — Level-up heroes, breakthrough stats, use attribute cards, apply golden pills
3. **Battle** (`renderBattle`) — Select team formation, set difficulty (1.0–227.0), set speed, start auto-battle
4. **Lottery** (`renderLottery`) — Spin-the-wheel with weighted prizes, mystery box opening
5. **Shop** (`renderShop`) — Buy/sell items (golden pills, tickets, spins, boxes, reforge tickets)

Additional: `showSavePanel()` for save/load management (3 slots).

### Hero Data Model
Each hero object has these key properties:
- **Identity**: `name`, `voiceLine`, `isAlly`, `exist`, `isAlive`
- **Stats**: `baseAttack`, `HP`/`maxHP`, `recovery`, `critRate`, `critMultiplier`, `ultimateMultiplier`, `skillCooldown`, `defenseFactor`, `dodgeRate`
- **Progression**: `level`, `baseScore`, `loot` (sell value)
- **Profession**: `primaryProfession` (0-3 index into `["影刃","奥术师","圣疗者","铁卫"]`), `secondaryProfession`, `professionCounts[]`
- **Abilities**: `dualAttack`, `dualRecovery`
- **Attributes**: `attributes` object with modifier (name, operation ±×÷, lock state)

Stat caps scale with hero level via `getStatCaps(level)` — each level adds +30% to the cap ceiling.

### Combat System
- Turn-based auto-battler in `startBattle()` → `battleLoop()` → `checkBattleEnd()`
- Heroes are deep-cloned for battle; enemy HP/ATK are multiplied by `difficulty²`
- Actions follow initiative order determined by each hero's speed
- Mechanics: normal attacks, skills (ults), healing, critical hits, dodge, defense reduction, combos
- Visual feedback via `showDamageNumber()`, `showFullscreenExecute()`, `showComboFloat()`

### Save System
- **localStorage key**: `starChess_saves` (JSON array of `[{slot, data}]`, 3 slots)
- **Legacy key** (auto-migrated): `starChess_save`
- **Settings keys**: `starChess_difficulty`, `starChess_battleSpeed`, `starChess_formation`
- Auto-save to slot 1 after forge/synthesize/battle
- `clampHeroStats()` runs on load to fix any over-cap stats

### Sound System
- `SoundManager` (global `sfx`) uses Web Audio API oscillators and noise generators
- Procedural BGM: space ambient drone (brown noise + filtered oscillators), battle BGM (bass + arpeggios + percussion)
- UI sounds: hover, click, success, error, card flip
- Lottery sounds: tick, win, mystery box
- Combat sounds: hit, crit, heal, dodge, skill, execute, combo escalation
- `ensure()` lazy-initializes AudioContext on first user interaction (browser autoplay policy)
