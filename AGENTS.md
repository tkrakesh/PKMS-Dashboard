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
PARA:          f77c8d2a-5aa7-8279-9ce3-8774a66053d8
TASKS:         ce5c8d2a-5aa7-821d-9bc0-07069607a168
DAILY_PAGES:   b34c8d2a-5aa7-8282-b69f-87ec3519c80a
NOTES:         c06c8d2a-5aa7-8368-b50e-078dacab4586
READ_LATER:    c63c8d2a-5aa7-834a-aa1d-878212dbfe4b
WEEKLY_REVIEW: 328c8d2a-5aa7-835a-8e91-879a94262dd1

## Colour palette (Digital Core — must not change)
--accent: #A100FF  --purple: #7B2FBE  --purple-dim: #E8D5FF
--purple-faint: #F5EEFF  --blue: #2563EB  --green: #059669
--amber: #D97706  --ink: #0F0A1E  --ink2: #3D3558
--ink3: #7A6E8F  --border: #E2D4F5  --bg: #F8F4FF
