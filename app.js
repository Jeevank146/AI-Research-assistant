// ResearchDesk frontend — connects to the n8n Research Assistant webhook.

// Published n8n workflow
const WEBHOOK_URL =
  "https://deaf-immune-deleted-gnu.trycloudflare.com/webhook/research-assistant";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Supported file types
const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'ppt',
  'pptx',
  'txt'
]);

// --------------------------------------------------
// DOM ELEMENTS
// --------------------------------------------------

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const browseButton = document.getElementById('browseButton');

const selectedFilePanel = document.getElementById('selectedFile');
const fileNameLabel = document.getElementById('fileName');
const fileDetailsLabel = document.getElementById('fileDetails');
const removeFileButton = document.getElementById('removeFile');

const contextInput = document.getElementById('contextInput');

const analyzeButton = document.getElementById('analyzeButton');
const buttonText = document.getElementById('buttonText');

const errorBox = document.getElementById('errorBox');

const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const resultState = document.getElementById('resultState');

const resultStatus = document.getElementById('resultStatus');
const resultFileName = document.getElementById('resultFileName');

const analysisContent = document.getElementById('analysisContent');

const copyButton = document.getElementById('copyButton');
const downloadButton = document.getElementById('downloadButton');

// --------------------------------------------------
// STATE
// --------------------------------------------------

let selectedFile = null;
let latestAnalysisText = '';


// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


function fileExtension(file) {
  if (!file || !file.name) return '';

  return file.name.includes('.')
    ? file.name.split('.').pop().toLowerCase()
    : '';
}


// --------------------------------------------------
// ERROR HANDLING
// --------------------------------------------------

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}


function clearError() {
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}


// --------------------------------------------------
// FILE HANDLING
// --------------------------------------------------

function setFile(file) {
  clearError();

  if (!file) return;

  const extension = fileExtension(file);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    showError(
      'Unsupported file type. Please select PDF, DOC, PPT, PPTX or TXT.'
    );
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    showError(
      'This file is larger than 15 MB. Please choose a smaller document.'
    );
    return;
  }

  selectedFile = file;

  fileNameLabel.textContent = file.name;

  fileDetailsLabel.textContent =
    `${extension.toUpperCase()} · ${formatBytes(file.size)}`;

  const fileTypeIcon = document.querySelector('.file-type-icon');

  if (fileTypeIcon) {
    fileTypeIcon.textContent = extension.toUpperCase().slice(0, 4);
  }

  selectedFilePanel.classList.remove('hidden');
  dropzone.classList.add('hidden');

  analyzeButton.disabled = false;
}


function clearFile() {
  selectedFile = null;

  fileInput.value = '';

  selectedFilePanel.classList.add('hidden');
  dropzone.classList.remove('hidden');

  analyzeButton.disabled = true;

  latestAnalysisText = '';
}


// --------------------------------------------------
// VIEW MANAGEMENT
// --------------------------------------------------

function setView(view) {
  emptyState.classList.toggle('hidden', view !== 'empty');
  loadingState.classList.toggle('hidden', view !== 'loading');
  resultState.classList.toggle('hidden', view !== 'result');
}


function setBusy(isBusy) {
  analyzeButton.disabled = isBusy || !selectedFile;

  buttonText.textContent = isBusy
    ? 'Analyzing document…'
    : 'Analyze research paper';

  resultStatus.innerHTML = isBusy
    ? '<span class="status-dot"></span> Analysis in progress'
    : '<span class="status-dot muted"></span> Waiting for document';
}


// --------------------------------------------------
// EXTRACT ANALYSIS FROM N8N RESPONSE
// --------------------------------------------------

function getAnalysisText(value, depth = 0) {
  if (depth > 10 || value == null) {
    return '';
  }

  // If response is a JSON string containing another JSON object,
  // parse it first.
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return '';
    }

    // Try to parse JSON string
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);

        // If parsing produced another object/string,
        // recursively extract the actual analysis.
        const extracted = getAnalysisText(parsed, depth + 1);

        if (extracted) {
          return extracted;
        }
      } catch (error) {
        // Not JSON, so treat it as normal text.
      }
    }

    return trimmed;
  }

  // Arrays
  if (Array.isArray(value)) {
    const parts = value
      .map(item => getAnalysisText(item, depth + 1))
      .filter(Boolean);

    return parts.join('\n\n');
  }

  // Objects
  if (typeof value === 'object') {
    const preferredKeys = [
      'analysis',
      'text',
      'output',
      'response',
      'answer',
      'content',
      'result',
      'message'
    ];

    for (const key of preferredKeys) {
      if (
        Object.prototype.hasOwnProperty.call(value, key)
      ) {
        const extracted = getAnalysisText(
          value[key],
          depth + 1
        );

        if (extracted) {
          return extracted;
        }
      }
    }
  }

  return '';
}

// --------------------------------------------------
// SAFE INLINE TEXT FORMATTING
// --------------------------------------------------

function cleanInlineMarkdown(text) {
  if (!text) return '';

  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '$1')

    // Italic
    .replace(/\*(.*?)\*/g, '$1')

    // Inline code
    .replace(/`([^`]+)`/g, '$1')

    // Extra markdown links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    .trim();
}


function appendInlineText(parent, text) {
  // IMPORTANT:
  // Use textContent instead of innerHTML.
  // This keeps AI output safe.

  parent.textContent = cleanInlineMarkdown(text);
}


// --------------------------------------------------
// PROFESSIONAL ANALYSIS RENDERER
// --------------------------------------------------

function renderAnalysis(text) {
  analysisContent.replaceChildren();

  if (!text || !text.trim()) {
    const empty = document.createElement('p');
    empty.textContent = 'No analysis was returned by the AI.';
    analysisContent.appendChild(empty);
    return;
  }

  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = normalizedText.split('\n');

  let list = null;
  let paragraph = [];


  // -----------------------------------------------
  // Flush paragraph
  // -----------------------------------------------

  const flushParagraph = () => {
    if (!paragraph.length) return;

    const p = document.createElement('p');

    appendInlineText(
      p,
      paragraph.join(' ')
    );

    analysisContent.appendChild(p);

    paragraph = [];
  };


  // -----------------------------------------------
  // Close list
  // -----------------------------------------------

  const closeList = () => {
    list = null;
  };


  // -----------------------------------------------
  // Create heading
  // -----------------------------------------------

  const createHeading = (text) => {
    flushParagraph();
    closeList();

    const h3 = document.createElement('h3');

    appendInlineText(h3, text);

    analysisContent.appendChild(h3);
  };


  // -----------------------------------------------
  // Process lines
  // -----------------------------------------------

  for (let index = 0; index < lines.length; index++) {

    const rawLine = lines[index];

    const line = rawLine.trim();


    // Empty line
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }


    // ---------------------------------------------
    // Markdown headings
    // Example:
    // # Research Summary
    // ## Methodology
    // ---------------------------------------------

    const markdownHeading = line.match(
      /^#{1,4}\s+(.+)$/
    );

    if (markdownHeading) {
      createHeading(
        cleanInlineMarkdown(markdownHeading[1])
      );

      continue;
    }


    // ---------------------------------------------
    // Bold numbered heading
    //
    // **1. Research Title**
    // **2. Research Summary**
    // ---------------------------------------------

    const boldNumberedHeading = line.match(
      /^\*\*(\d+(?:\.\d+)?[.)]?)\s+(.+?)\*\*:?\s*$/
    );

    if (boldNumberedHeading) {

      createHeading(
        `${boldNumberedHeading[1]} ${cleanInlineMarkdown(
          boldNumberedHeading[2]
        )}`
      );

      continue;
    }


    // ---------------------------------------------
    // Plain numbered heading
    //
    // 1. Research Title
    // 2. Methodology
    // ---------------------------------------------

    const numberedHeading = line.match(
      /^(\d+(?:\.\d+)?[.)])\s+(.+)$/
    );

    if (numberedHeading) {

      createHeading(
        `${numberedHeading[1]} ${cleanInlineMarkdown(
          numberedHeading[2]
        )}`
      );

      continue;
    }


    // ---------------------------------------------
    // Bold heading without number
    //
    // **Research Summary**
    // **Methodology**
    // ---------------------------------------------

    const boldHeading = line.match(
      /^\*\*(.+?)\*\*:?\s*$/
    );

    if (boldHeading) {

      createHeading(
        cleanInlineMarkdown(
          boldHeading[1]
        )
      );

      continue;
    }


    // ---------------------------------------------
    // Bullet points
    //
    // - Point
    // * Point
    // • Point
    // ---------------------------------------------

    const bullet = line.match(
      /^[-*•]\s+(.+)$/
    );

    if (bullet) {

      flushParagraph();

      if (!list) {
        list = document.createElement('ul');

        analysisContent.appendChild(list);
      }

      const li = document.createElement('li');

      appendInlineText(
        li,
        bullet[1]
      );

      list.appendChild(li);

      continue;
    }


    // ---------------------------------------------
    // Numbered list item
    //
    // 1) Point
    // 2) Point
    //
    // Avoid treating long research section titles
    // as list items because section headings were
    // already handled above.
    // ---------------------------------------------

    const numberedList = line.match(
      /^(\d+)[)]\s+(.+)$/
    );

    if (numberedList) {

      flushParagraph();

      if (!list) {
        list = document.createElement('ol');

        analysisContent.appendChild(list);
      }

      const li = document.createElement('li');

      appendInlineText(
        li,
        numberedList[2]
      );

      list.appendChild(li);

      continue;
    }


    // ---------------------------------------------
    // Normal paragraph
    // ---------------------------------------------

    closeList();

    const cleanedLine = cleanInlineMarkdown(line);

    paragraph.push(cleanedLine);
  }


  // Finish remaining paragraph
  flushParagraph();


  // ---------------------------------------------
  // Fallback
  // ---------------------------------------------

  if (!analysisContent.childElementCount) {

    const pre = document.createElement('pre');

    pre.textContent = text;

    analysisContent.appendChild(pre);
  }
}


// --------------------------------------------------
// SHOW RESULT
// --------------------------------------------------

function showResult(payload) {

  // Extract ONLY the analysis field.
  const text = getAnalysisText(payload);

  if (!text) {

    const fallback =
      typeof payload === 'string'
        ? payload
        : JSON.stringify(payload, null, 2);

    latestAnalysisText = fallback;

    renderAnalysis(fallback);

  } else {

    latestAnalysisText = text;

    renderAnalysis(text);
  }

  resultFileName.textContent =
    selectedFile
      ? selectedFile.name
      : 'Research document';

  resultStatus.innerHTML =
    '<span class="status-dot"></span> Analysis complete';

  setView('result');
}


// --------------------------------------------------
// DROPZONE
// --------------------------------------------------

dropzone.addEventListener('click', (event) => {

  if (event.target.closest('button')) {
    return;
  }

  fileInput.click();
});


dropzone.addEventListener('keydown', (event) => {

  if (
    event.key === 'Enter' ||
    event.key === ' '
  ) {

    event.preventDefault();

    fileInput.click();
  }
});


browseButton.addEventListener(
  'click',
  (event) => {

    event.stopPropagation();

    fileInput.click();
  }
);


fileInput.addEventListener(
  'change',
  () => {

    setFile(
      fileInput.files?.[0]
    );
  }
);


removeFileButton.addEventListener(
  'click',
  clearFile
);


// --------------------------------------------------
// DRAG & DROP
// --------------------------------------------------

for (const eventName of [
  'dragenter',
  'dragover'
]) {

  dropzone.addEventListener(
    eventName,
    (event) => {

      event.preventDefault();

      dropzone.classList.add(
        'dragging'
      );
    }
  );
}


for (const eventName of [
  'dragleave',
  'drop'
]) {

  dropzone.addEventListener(
    eventName,
    (event) => {

      event.preventDefault();

      dropzone.classList.remove(
        'dragging'
      );
    }
  );
}


dropzone.addEventListener(
  'drop',
  (event) => {

    const file =
      event.dataTransfer?.files?.[0];

    setFile(file);
  }
);


// --------------------------------------------------
// ANALYZE DOCUMENT
// --------------------------------------------------

analyzeButton.addEventListener(
  'click',
  async () => {

    if (!selectedFile) {
      return;
    }

    clearError();

    setBusy(true);

    setView('loading');


    // ---------------------------------------------
    // Create multipart form data
    // ---------------------------------------------

    const formData = new FormData();

    formData.append(
      'data',
      selectedFile,
      selectedFile.name
    );


    const context =
      contextInput.value.trim();


    if (context) {

      formData.append(
        'research_context',
        context
      );
    }


    try {

      // -------------------------------------------
      // Send file to n8n
      // -------------------------------------------

      const response =
        await fetch(
          WEBHOOK_URL,
          {
            method: 'POST',
            body: formData
          }
        );


      // -------------------------------------------
      // Read response
      // -------------------------------------------

      const raw =
        await response.text();


      let payload;


      try {

        payload =
          raw
            ? JSON.parse(raw)
            : {};

      } catch {

        payload = raw;
      }


      // -------------------------------------------
      // HTTP error
      // -------------------------------------------

      if (!response.ok) {

        const detail =
          getAnalysisText(payload) ||
          (
            typeof payload === 'string'
              ? payload
              : JSON.stringify(
                  payload
                )
          );


        throw new Error(
          `n8n returned ${response.status}. ${detail.slice(0, 700)}`
        );
      }


      // -------------------------------------------
      // n8n error object
      // -------------------------------------------

      if (
        payload &&
        typeof payload === 'object' &&
        payload.code &&
        payload.message &&
        !getAnalysisText(payload)
      ) {

        throw new Error(
          payload.message
        );
      }


      // -------------------------------------------
      // Show professional result
      // -------------------------------------------

      showResult(payload);

    } catch (error) {

      setView('empty');

      resultStatus.innerHTML =
        '<span class="status-dot muted"></span> Waiting for document';


      let message =
        error?.message ||
        'The request could not be completed.';


      if (
        message.includes('Failed to fetch') ||
        message.includes('NetworkError')
      ) {

        message =
          'Could not reach n8n. Check that n8n is running, the workflow is published, the production webhook URL is correct, and CORS allows this website origin.';
      }


      showError(message);

    } finally {

      setBusy(false);
    }
  }
);


// --------------------------------------------------
// COPY ANALYSIS
// --------------------------------------------------

copyButton.addEventListener(
  'click',
  async () => {

    if (!latestAnalysisText) {
      return;
    }


    try {

      await navigator.clipboard.writeText(
        latestAnalysisText
      );


      copyButton.textContent =
        'Copied';


      setTimeout(
        () => {

          copyButton.textContent =
            'Copy';

        },
        1600
      );

    } catch {

      showError(
        'Clipboard access was blocked by the browser. Select and copy the analysis text instead.'
      );
    }
  }
);


// --------------------------------------------------
// DOWNLOAD ANALYSIS
// --------------------------------------------------

downloadButton.addEventListener(
  'click',
  () => {

    if (!latestAnalysisText) {
      return;
    }


    const blob =
      new Blob(
        [latestAnalysisText],
        {
          type:
            'text/plain;charset=utf-8'
        }
      );


    const url =
      URL.createObjectURL(blob);


    const link =
      document.createElement('a');


    link.href = url;


    const originalName =
      selectedFile?.name ||
      'research-analysis';


    const baseName =
      originalName.replace(
        /\.[^.]+$/,
        ''
      );


    link.download =
      `${baseName}-analysis.txt`;


    document.body.appendChild(link);

    link.click();

    link.remove();


    URL.revokeObjectURL(url);
  }
);
