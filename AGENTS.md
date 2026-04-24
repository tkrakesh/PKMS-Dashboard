# AGENTS.md — PKMS Dashboard

## Project
Google Apps Script web app that serves as a BASB Second Brain dashboard.
Connects to Notion via REST API. Two files only: Code.gs and Index.html.

## Rules
- NEVER use google.script.run for Notion API calls — all Notion calls happen server-side in Code.gs
- NEVER create additional .gs files — all server logic stays in Code.gs
- NEVER hardcode API keys — always read from PropertiesService.getScriptProperties()
- The HTML file must be named exactly: Index (Apps Script adds .html automatically)
- Use clasp to push files to Apps Script after every change

## Notion Database IDs (already verified)
PARA:          e6ac8d2a-5aa7-824d-9c44-8140c61c3c9c
TASKS:         d5ec8d2a-5aa7-8390-accd-01c040bcdfc2
DAILY_PAGES:   1c1c8d2a-5aa7-827c-a026-8139c5311d61
NOTES:         3e9c8d2a-5aa7-827f-abfc-01bad92e324f
READ_LATER:    7e6c8d2a-5aa7-83f9-a3aa-816ececee687
WEEKLY_REVIEW: 762c8d2a-5aa7-8309-a088-01b1d8203121

## Colour palette (Digital Core — must not change)
--accent: #A100FF  --purple: #7B2FBE  --purple-dim: #E8D5FF
--purple-faint: #F5EEFF  --blue: #2563EB  --green: #059669
--amber: #D97706  --ink: #0F0A1E  --ink2: #3D3558
--ink3: #7A6E8F  --border: #E2D4F5  --bg: #F8F4FF
