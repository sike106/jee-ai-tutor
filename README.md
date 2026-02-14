# Website Builder + Publisher (Next.js)

A simple web app where users can:

- create a website with editable content,
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

1. Fill website details in the builder.
2. Click **Publish website**.
3. App saves the site in localStorage and returns a URL like:
   - `http://localhost:3000?site=my-awesome-site`

## Notes

- This is local/browser-based publishing for MVP demos.
- To make it production-ready, connect publishing to a backend/database and host generated sites on a real domain.
