import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';

// Polyfill Promise.try for older JS engines (required by pdfjs-dist v6+)
if (typeof Promise.try !== 'function') {
  Promise.try = function(fn, ...args) {
    return new Promise((resolve, reject) => {
      try {
        resolve(fn(...args));
      } catch (err) {
        reject(err);
      }
    });
  };
}

// Polyfill Uint8Array.prototype.toHex for older JS engines (required by pdfjs-dist v6+)
if (typeof Uint8Array.prototype.toHex !== 'function') {
  Uint8Array.prototype.toHex = function() {
    return Array.from(this)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };
}

// Polyfill Uint8Array.prototype.toBase64 for older JS engines (required by pdfjs-dist v6+)
if (typeof Uint8Array.prototype.toBase64 !== 'function') {
  Uint8Array.prototype.toBase64 = function() {
    let binary = '';
    const len = this.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(this[i]);
    }
    return btoa(binary);
  };
}

// Polyfill ReadableStream.prototype[Symbol.asyncIterator] for older Chromium/Electron engines (required by pdfjs-dist)
if (typeof ReadableStream.prototype[Symbol.asyncIterator] !== 'function') {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

// Set worker source for pdfjs-dist locally
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function DocumentUploader({ onTextExtracted }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const processFile = async (file) => {
    setIsProcessing(true);
    setError(null);
    try {
      let text = '';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name.toLowerCase().endsWith('.docx')
      ) {
        text = await extractTextFromDOCX(file);
      } else if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
        text = await file.text();
      } else {
        throw new Error('Unsupported file type. Please upload a PDF, DOCX, or TXT file.');
      }
      
      onTextExtracted(text, file.name);
    } catch (err) {
      console.error('File extraction error:', err);
      setError(err.message || 'Failed to extract text from document.');
    } finally {
      setIsProcessing(false);
    }
  };

  const extractTextFromPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str);
      fullText += strings.join(' ') + '\n';
    }
    
    return fullText;
  };

  const extractTextFromDOCX = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Process files sequentially
      Array.from(e.dataTransfer.files).forEach(file => processFile(file));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(file => processFile(file));
    }
    // Reset input so the same file can be selected again if needed
    e.target.value = null;
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border-medium)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '24px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragging ? 'var(--accent-light)' : 'var(--bg-input)',
          transition: 'all 0.2s ease',
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.docx,.txt"
          multiple
          style={{ display: 'none' }}
        />
        
        {isProcessing ? (
          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            ⏳ Extracting text...
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>📄</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Click or drag documents to upload
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Supports PDF, DOCX, and TXT
            </div>
          </div>
        )}
      </div>
      
      {error && (
        <div style={{ color: 'var(--error)', fontSize: '0.8rem', marginTop: '8px', textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  );
}
