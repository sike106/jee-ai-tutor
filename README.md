# Website Builder + Publisher (Next.js)

A simple web app where users can:

- create a website with editable content,
- ask built-in AI to generate different webpage types from a prompt,
- preview it live,
- publish it with a shareable link (`?site=<slug>`).

Published sites are stored in browser `localStorage`, so this is a lightweight demo without a database.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## How publishing works

1. (Optional) Use **Generate with AI** and describe your desired webpage type.
2. Edit fields in the builder if needed.
3. Click **Publish website**.
4. App saves the site in localStorage and returns a URL like:
   - `http://localhost:3000?site=my-awesome-site`

## Notes

- This is local/browser-based publishing for MVP demos.
- To make it production-ready, connect publishing to a backend/database and host generated sites on a real domain.


## AI generation

The app calls `/api/chat` with `mode: "website-builder"` and asks Gemini to return structured JSON for site content, theme, CTA, and sections.
