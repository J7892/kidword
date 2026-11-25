export interface OpenedStoryFile {
  title: string;
  htmlContent: string;
  plainText: string;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface WindowWithFilePickers extends Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
}

function sanitizeFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ');
  return cleaned || 'My Story';
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildHtmlDocument(title: string, htmlContent: string, fontFamily: string): string {
  const safeTitle = escapeHtml(title.trim() || 'My Story');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&family=Fredoka:wght@400;500;600;700&family=Lexend:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,600;0,700;1,400;1,700&family=Nunito:ital,wght@0,400;0,600;0,700;1,400;1,700&family=Patrick+Hand&display=swap" rel="stylesheet" />
  <style>
    body {
      max-width: 740px;
      margin: 48px auto;
      padding: 0 24px;
      font-family: ${fontFamily};
      font-size: 18px;
      line-height: 1.7;
      color: #1f242b;
      background: #fbf7ee;
    }
    h1.story-title {
      font-size: 2rem;
      margin-bottom: 1.25rem;
    }
    p { margin: 0 0 0.85em 0; }
  </style>
</head>
<body>
  <h1 class="story-title">${safeTitle}</h1>
  <div class="story-body">${htmlContent}</div>
</body>
</html>
`;
}

function buildPlainTextDocument(title: string, plainText: string): string {
  const cleanTitle = title.trim();
  if (!cleanTitle) return plainText;
  return `${cleanTitle}\n${'='.repeat(Math.min(cleanTitle.length, 40))}\n\n${plainText}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveStoryToFile(
  title: string,
  htmlContent: string,
  plainText: string,
  fontFamily: string,
  preferredFormat: 'html' | 'txt' = 'html'
): Promise<boolean> {
  const baseName = sanitizeFilename(title);
  const win = window as WindowWithFilePickers;

  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const htmlType = {
        description: 'Story Web Page (.html)',
        accept: { 'text/html': ['.html'] },
      };
      const txtType = {
        description: 'Plain Text (.txt)',
        accept: { 'text/plain': ['.txt'] },
      };
      const handle = await win.showSaveFilePicker({
        suggestedName: `${baseName}.${preferredFormat}`,
        types: preferredFormat === 'txt' ? [txtType, htmlType] : [htmlType, txtType],
      });

      const isTxt = handle.name.toLowerCase().endsWith('.txt');
      const content = isTxt
        ? buildPlainTextDocument(title, plainText)
        : buildHtmlDocument(title, htmlContent, fontFamily);
      const mime = isTxt ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8';

      const writable = await handle.createWritable();
      await writable.write(new Blob([content], { type: mime }));
      await writable.close();
      return true;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        return false;
      }
      // Fall through to standard download fallback
    }
  }

  const content =
    preferredFormat === 'txt'
      ? buildPlainTextDocument(title, plainText)
      : buildHtmlDocument(title, htmlContent, fontFamily);
  const mime = preferredFormat === 'txt' ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8';
  triggerDownload(new Blob([content], { type: mime }), `${baseName}.${preferredFormat}`);
  return true;
}

function parseOpenedFile(filename: string, rawText: string): OpenedStoryFile {
  const isHtml = /\.html?$/i.test(filename);
  const fallbackTitle = filename.replace(/\.(html?|txt)$/i, '').trim() || 'Imported Story';

  if (isHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawText, 'text/html');
    doc.querySelectorAll('script, style, link, meta').forEach((el) => el.remove());

    const titleEl = doc.querySelector('h1.story-title') || doc.querySelector('title');
    const extractedTitle = titleEl?.textContent?.trim() || fallbackTitle;
    if (doc.querySelector('h1.story-title')) {
      doc.querySelector('h1.story-title')?.remove();
    }

    const bodyContainer = doc.querySelector('.story-body') || doc.body;
    const htmlContent = bodyContainer?.innerHTML?.trim() || '<p></p>';
    const plainText = bodyContainer?.textContent?.trim() || '';
    return {
      title: extractedTitle,
      htmlContent,
      plainText,
    };
  }

  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const htmlParagraphs = lines
    .map((line) => (line.trim() === '' ? '<p></p>' : `<p>${escapeHtml(line)}</p>`))
    .join('');

  return {
    title: fallbackTitle,
    htmlContent: htmlParagraphs || '<p></p>',
    plainText: rawText,
  };
}

export async function openStoryFromFile(): Promise<OpenedStoryFile | null> {
  const win = window as WindowWithFilePickers;

  if (typeof win.showOpenFilePicker === 'function') {
    try {
      const [handle] = await win.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Story files (.html, .txt)',
            accept: {
              'text/html': ['.html', '.htm'],
              'text/plain': ['.txt'],
            },
          },
        ],
      });
      if (!handle) return null;
      const file = await handle.getFile();
      const text = await file.text();
      return parseOpenedFile(file.name, text);
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        return null;
      }
      // Fall through to <input type="file">
    }
  }

  return new Promise<OpenedStoryFile | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.txt,text/html,text/plain';
    input.style.display = 'none';

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      const text = await file.text();
      cleanup();
      resolve(parseOpenedFile(file.name, text));
    });

    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });

    document.body.appendChild(input);
    input.click();
  });
}
