# ResearchDesk — AI Research Assistant frontend

This is a small, dependency-free HTML/CSS/JavaScript frontend for the n8n workflow.

## What it does
- Accepts one file per analysis: PDF, DOC,PPT, PPTX or TXT.
- Does not ask the user to enter a research topic; the AI identifies it from the document.
- Sends the file as multipart form-data using the key `data`.
- Sends `research_context` only when the optional instruction box is filled.
- Displays the n8n response and supports copying or downloading the analysis as text.

## 1. Configure the n8n webhook

In the Webhook node:
- HTTP Method: `POST`
- Path: `research-assistant`
- Respond: `Using 'Respond to Webhook' Node`
- Add Option → `Allowed Origins (CORS)`
- During local development with VS Code Live Server, allow these origins:
  `http://127.0.0.1:5500,http://localhost:5500`

Keep the Webhook binary field setting as it is in the working workflow. The browser sends the uploaded file under form-data key `data`.

## 2. Confirm the production endpoint

The frontend is configured to use:

`http://localhost:5678/webhook/research-assistant`

This is the production URL for a local n8n instance with the path above. Confirm it in the Webhook node's **Production URL** tab. If it differs, edit `WEBHOOK_URL` near the top of `app.js`.

The workflow must be **Published** before the production URL will work. The test URL (`/webhook-test/`) is only for a workflow currently listening for a test event.

## 3. Run the website

1. Extract this folder into your project workspace.
2. Open the folder in VS Code.
3. Run `index.html` with the Live Server extension.
4. Open the local site, choose one research file, and click **Analyze research paper**.

You can also serve the folder with Python from a terminal:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`.

## Notes
- The frontend checks for files up to 15 MB. n8n may enforce its own request size limit as well.
- Scanned/image-only PDFs may need OCR in the workflow; this frontend does not perform OCR.
- For deployment, replace the localhost webhook URL with your hosted n8n HTTPS production URL and set Allowed Origins (CORS) to your actual website domain. Do not expose private API keys in frontend code.
