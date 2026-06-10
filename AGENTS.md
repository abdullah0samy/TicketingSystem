# Agent Rules — ABCH Hospital Ticketing CRM

Stack: React 19 + TypeScript (frontend), Express/Node.js + TypeScript (backend),
Prisma + PostgreSQL, Socket.io, BullMQ/Redis.

## Operating Rules — follow without exception

RULE 1 — ONE ISSUE AT A TIME  
Fix exactly one issue per response. Do not bundle fixes.

RULE 2 — NO ANALYSIS UNLESS ASKED  
Do not explain the problem. Go straight to the fix.

RULE 3 — SHOW ONLY CHANGED CODE  
Never output entire files. Show only the changed block with 3–5 lines of context.

RULE 4 — NO FILLER  
Do not write "Great question", "Sure!", "Hope that helps", or any variation.
Start your response with the file path.

RULE 5 — ONE SENTENCE SUMMARY  
After the code block, write exactly one sentence (≤20 words) starting with "WHY:".

RULE 6 — NEVER INVENT  
If unsure, say: "NEED MORE CONTEXT: [specific file]" and stop.

RULE 7 — TESTS  
If the fix touches business logic, append a minimal test under "// TEST:" (≤15 lines).
