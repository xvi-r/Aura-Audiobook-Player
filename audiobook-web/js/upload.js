// Upload Page Module - Upload Audiobooks and EPUB E-Books to Backend
import { router } from "./router.js";
import { getApiBase } from "./config.js";
import { openUploadEpubModal } from "./details.js";

export const renderUpload = () => {
  const API_BASE = getApiBase();
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;

  mainContent.innerHTML = `
    <div class="upload-container fade-in" style="max-width: 960px; margin: 0 auto; padding-bottom: 40px;">
      <div class="upload-header">
        <h1>Upload Media</h1>
        <p>Add new audiobooks or digital EPUB e-books to your server library.</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 24px; margin-top: 24px;">
        <!-- Card 1: Upload Audiobook Audio File -->
        <div class="upload-card">
          <h2 style="font-size: 1.15rem; font-weight: 700; color: #a78bfa; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="headphones" style="width: 20px; height: 20px;"></i>
            Upload Audiobook File
          </h2>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
            Upload .M4B, .MP3, or .M4A audio file. The backend auto-parses chapters and metadata.
          </p>

          <!-- Drag & Drop Dropzone -->
          <div class="upload-dropzone" id="upload-dropzone-audio" role="button" tabindex="0">
            <i data-lucide="upload-cloud" class="dropzone-icon"></i>
            <h3>Drag & drop audiobook audio here</h3>
            <p>Supports .m4b, .mp3, .m4a</p>
            <button class="btn-primary-play" style="margin-top: 14px; padding: 8px 20px; pointer-events: none;">
              Browse Audio Files
            </button>
            <input type="file" id="upload-file-input-audio" accept=".m4b,.mp3,.m4a" style="display: none;" />
          </div>

          <!-- Progress bar Section -->
          <div class="upload-progress-container" id="audio-progress-container" style="display: none;">
            <div class="upload-file-meta">
              <span class="file-name" id="audio-file-name">audiobook.m4b</span>
              <span class="file-percent" id="audio-percent">0%</span>
            </div>
            <div class="progress-bar-container" style="height: 6px; margin: 12px 0 6px 0;">
              <div class="progress-bar-fill" id="audio-progress-fill" style="width: 0%;"></div>
            </div>
            <span class="upload-status-sub" id="audio-status-sub">Uploading to server...</span>
          </div>

          <!-- Feedback Alert Panel -->
          <div class="upload-feedback" id="audio-feedback" style="display: none;">
            <div class="feedback-icon" id="audio-feedback-icon-box">
              <i data-lucide="check-circle" class="success-color"></i>
            </div>
            <h3 id="audio-feedback-title">Upload Completed!</h3>
            <p id="audio-feedback-message">Your book was successfully processed by the backend. You can now search for it in your library.</p>
            <button class="btn-primary-play" id="audio-feedback-action-btn" style="margin-top: 16px;">
              Go to Library
            </button>
          </div>
        </div>

        <!-- Card 2: Upload Digital EPUB E-Book -->
        <div class="upload-card">
          <h2 style="font-size: 1.15rem; font-weight: 700; color: #38bdf8; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="book-open" style="width: 20px; height: 20px;"></i>
            Upload Digital EPUB E-Book
          </h2>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
            Upload .EPUB document. Prompts for related Audiobook ID (or leave blank if unlinked).
          </p>

          <div class="upload-dropzone" id="upload-dropzone-epub" role="button" tabindex="0" style="border-color: rgba(56, 189, 248, 0.35);">
            <i data-lucide="book-open" class="dropzone-icon" style="color: #38bdf8;"></i>
            <h3>Drag & drop .EPUB e-book file here</h3>
            <p>Supports .epub digital books</p>
            <button class="btn-primary-play" style="margin-top: 14px; padding: 8px 20px; pointer-events: none; background: linear-gradient(135deg, #0284c7, #6366f1); border-color: rgba(56,189,248,0.4);">
              Browse EPUB File
            </button>
            <input type="file" id="upload-file-input-epub" accept=".epub" style="display: none;" />
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  setupUploadListeners();
};

const setupUploadListeners = () => {
  // 1. Audio Upload Setup
  const dropzoneAudio = document.getElementById("upload-dropzone-audio");
  const fileInputAudio = document.getElementById("upload-file-input-audio");
  const progressContainer = document.getElementById("audio-progress-container");
  const progressFill = document.getElementById("audio-progress-fill");
  const percentLabel = document.getElementById("audio-percent");
  const statusSub = document.getElementById("audio-status-sub");
  const feedback = document.getElementById("audio-feedback");
  const feedbackIconBox = document.getElementById("audio-feedback-icon-box");
  const feedbackTitle = document.getElementById("audio-feedback-title");
  const feedbackMessage = document.getElementById("audio-feedback-message");
  const feedbackActionBtn = document.getElementById("audio-feedback-action-btn");

  if (dropzoneAudio && fileInputAudio) {
    dropzoneAudio.addEventListener("click", () => fileInputAudio.click());
    dropzoneAudio.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzoneAudio.classList.add("dragover");
    });
    dropzoneAudio.addEventListener("dragleave", () => dropzoneAudio.classList.remove("dragover"));
    dropzoneAudio.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzoneAudio.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleAudioSelected(e.dataTransfer.files[0]);
      }
    });

    fileInputAudio.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleAudioSelected(e.target.files[0]);
      }
    });

    const handleAudioSelected = (file) => {
      const validExtensions = [".m4b", ".mp3", ".m4a"];
      const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!validExtensions.includes(fileExt)) {
        alert("Invalid file type. Please select an M4B, MP3, or M4A audio file.");
        return;
      }

      dropzoneAudio.style.display = "none";
      progressContainer.style.display = "block";
      feedback.style.display = "none";

      const fileNameLabel = document.getElementById("audio-file-name");
      if (fileNameLabel) fileNameLabel.textContent = file.name;

      uploadAudioFile(file);
    };

    const uploadAudioFile = (file) => {
      const API_BASE = getApiBase();
      const xhr = new XMLHttpRequest();
      xhr.withCredentials = true;
      const formData = new FormData();
      formData.append("file", file);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          progressFill.style.width = `${percent}%`;
          percentLabel.textContent = `${percent}%`;
          statusSub.textContent = `Uploading file... ${Math.round(e.loaded / 1024 / 1024)}MB of ${Math.round(e.total / 1024 / 1024)}MB`;
        }
      });

      xhr.addEventListener("load", () => {
        progressContainer.style.display = "none";
        feedback.style.display = "flex";

        if (xhr.status >= 200 && xhr.status < 300) {
          feedbackIconBox.innerHTML = `<i data-lucide="check-circle" style="color: var(--accent-primary); width: 48px; height: 48px;"></i>`;
          feedbackTitle.textContent = "Upload Completed!";
          feedbackMessage.textContent = `Your audiobook "${file.name}" was successfully uploaded and processed by the Spring Boot backend.`;
          feedbackActionBtn.textContent = "Go to Library";
          feedbackActionBtn.onclick = () => router.navigate("#library");
        } else {
          feedbackIconBox.innerHTML = `<i data-lucide="alert-triangle" style="color: #ef4444; width: 48px; height: 48px;"></i>`;
          feedbackTitle.textContent = "Upload Failed";
          feedbackMessage.textContent = `The server returned an error (HTTP ${xhr.status}): ${xhr.responseText || "Could not process file."}`;
          feedbackActionBtn.textContent = "Try Again";
          feedbackActionBtn.onclick = () => renderUpload();
        }
        if (window.lucide) window.lucide.createIcons();
      });

      xhr.addEventListener("error", () => {
        progressContainer.style.display = "none";
        feedback.style.display = "flex";
        feedbackIconBox.innerHTML = `<i data-lucide="wifi-off" style="color: #ef4444; width: 48px; height: 48px;"></i>`;
        feedbackTitle.textContent = "Network Error";
        feedbackMessage.textContent = `Could not establish a connection to ${API_BASE}. Make sure your backend server is running.`;
        feedbackActionBtn.textContent = "Try Again";
        feedbackActionBtn.onclick = () => renderUpload();
        if (window.lucide) window.lucide.createIcons();
      });

      xhr.open("POST", `${API_BASE}/api/upload`);
      xhr.send(formData);
    };
  }

  // 2. EPUB E-Book Upload Setup
  const dropzoneEpub = document.getElementById("upload-dropzone-epub");
  const fileInputEpub = document.getElementById("upload-file-input-epub");

  if (dropzoneEpub && fileInputEpub) {
    dropzoneEpub.addEventListener("click", () => fileInputEpub.click());
    dropzoneEpub.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzoneEpub.classList.add("dragover");
    });
    dropzoneEpub.addEventListener("dragleave", () => dropzoneEpub.classList.remove("dragover"));
    dropzoneEpub.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzoneEpub.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        openUploadEpubModal("", file, () => {
          localStorage.setItem("aura_library_tab", "ebooks");
          router.navigate("#library");
        });
      }
    });

    fileInputEpub.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        openUploadEpubModal("", file, () => {
          localStorage.setItem("aura_library_tab", "ebooks");
          router.navigate("#library");
        });
      }
    });
  }
};
