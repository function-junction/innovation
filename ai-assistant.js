/* ai-assistant.js - Updated Light Version
NO HARDCODED marking scheme! Marking logic handled by Render Gemini backend
Backend: https://functionjunction.onrender.com/api/gemini
Function: Send student text + uploaded image to backend for dynamic marking & feedback
*/
(function () {
    let pendingImages = [];
    let pendingFiles = [];

    function ready(fn) {
        if (window.el && window.el.chatLog) fn();
        else setTimeout(() => ready(fn), 100);
    }

    ready(initAIChat);

    function initAIChat() {
        const chatLogEl = document.getElementById("chatLog");
        const chatInputEl = document.getElementById("chatInput");
        const sendBtnEl = document.getElementById("sendChat");
        const chatControlsEl = document.querySelector(".chat-controls");

        // Add photo & file attach button
        if (chatControlsEl && !document.getElementById("attachPhotoBtn")) {
            const photoBtn = document.createElement("button");
            photoBtn.id = "attachPhotoBtn";
            photoBtn.type = "button";
            photoBtn.className = "icon-btn-attach";
            photoBtn.title = "Upload student answer photo";
            photoBtn.textContent = "📷";

            const fileBtn = document.createElement("button");
            fileBtn.id = "attachFileBtn";
            fileBtn.type = "button";
            fileBtn.className = "icon-btn-attach";
            fileBtn.title = "Upload marking scheme / worksheet";
            fileBtn.textContent = "📄";

            chatControlsEl.prepend(fileBtn, photoBtn);
        }

        // Hidden file input
        let photoInput = document.getElementById("photoInput");
        if (!photoInput) {
            photoInput = document.createElement("input");
            photoInput.id = "photoInput";
            photoInput.type = "file";
            photoInput.accept = "image/*";
            photoInput.multiple = true;
            photoInput.style.display = "none";
            document.body.appendChild(photoInput);
        }

        let fileInput = document.getElementById("fileInput");
        if (!fileInput) {
            fileInput = document.createElement("input");
            fileInput.id = "fileInput";
            fileInput.type = "file";
            fileInput.accept = ".pdf,.txt,.docx";
            fileInput.multiple = true;
            fileInput.style.display = "none";
            document.body.appendChild(fileInput);
        }

        // Preview area
        let previewArea = document.getElementById("attachPreview");
        if (!previewArea) {
            previewArea = document.createElement("div");
            previewArea.id = "attachPreview";
            previewArea.className = "attach-preview";
            chatLogEl.parentNode.insertBefore(previewArea, chatLogEl.nextSibling);
        }

        function escapeHTML(str) {
            return String(str ?? "")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;");
        }

        function renderPreview() {
            previewArea.innerHTML = "";
            pendingImages.forEach((img, idx) => {
                const chip = document.createElement("span");
                chip.className = "attach-chip";
                chip.innerHTML = `<img src="${img.dataUrl}" alt="preview"><span>${escapeHTML(img.name)}</span>`;
                const removeBtn = document.createElement("button");
                removeBtn.textContent = "×";
                removeBtn.onclick = () => {
                    pendingImages.splice(idx, 1);
                    renderPreview();
                };
                chip.appendChild(removeBtn);
                previewArea.appendChild(chip);
            });
            pendingFiles.forEach((file, idx) => {
                const chip = document.createElement("span");
                chip.className = "attach-chip";
                chip.innerHTML = `<span>📄 ${escapeHTML(file.name)}</span>`;
                const removeBtn = document.createElement("button");
                removeBtn.textContent = "×";
                removeBtn.onclick = () => {
                    pendingFiles.splice(idx, 1);
                    renderPreview();
                };
                chip.appendChild(removeBtn);
                previewArea.appendChild(chip);
            });
        }

        function fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        function fileToText(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).slice(0, 8000));
                reader.onerror = () => resolve("");
                reader.readAsText(file);
            });
        }

        // Trigger upload
        document.getElementById("attachPhotoBtn").onclick = () => photoInput.click();
        document.getElementById("attachFileBtn").onclick = () => fileInput.click();

        photoInput.onchange = async () => {
            const files = Array.from(photoInput.files);
            for (const f of files) {
                const base64 = await fileToBase64(f);
                pendingImages.push({
                    dataUrl: base64,
                    mime: f.type,
                    name: f.name
                });
            }
            photoInput.value = "";
            renderPreview();
        };

        fileInput.onchange = async () => {
            const files = Array.from(fileInput.files);
            for (const f of files) {
                if (f.type.startsWith("image/")) {
                    const base64 = await fileToBase64(f);
                    pendingImages.push({
                        dataUrl: base64,
                        mime: f.type,
                        name: f.name
                    });
                } else {
                    const text = await fileToText(f);
                    pendingFiles.push({
                        name: f.name,
                        content: text
                    });
                }
            }
            fileInput.value = "";
            renderPreview();
        };

        // Drag & drop
        chatLogEl.addEventListener("dragover", e => {
            e.preventDefault();
            chatLogEl.classList.add("drag-over");
        });
        chatLogEl.addEventListener("dragleave", () => chatLogEl.classList.remove("drag-over"));
        chatLogEl.addEventListener("drop", async e => {
            e.preventDefault();
            chatLogEl.classList.remove("drag-over");
            const files = Array.from(e.dataTransfer.files);
            for (const f of files) {
                if (f.type.startsWith("image/")) {
                    const base64 = await fileToBase64(f);
                    pendingImages.push({
                        dataUrl: base64,
                        mime: f.type,
                        name: f.name
                    });
                } else {
                    const text = await fileToText(f);
                    pendingFiles.push({
                        name: f.name,
                        content: text
                    });
                }
            }
            renderPreview();
        });

        // Send message to Render Backend
        async function sendMessage() {
            const userText = chatInputEl.value.trim();
            if (!userText && pendingImages.length === 0) return;

            // Render user message on chat
            const userMsgDiv = document.createElement("div");
            userMsgDiv.className = "msg user";
            let msgHTML = userText ? `<div>${escapeHTML(userText).replaceAll("\n", "<br>")}</div>` : "";
            pendingImages.forEach(img => {
                msgHTML += `<div style="margin-top:8px"><img src="${img.dataUrl}" style="max-width:100%;max-height:200px;border-radius:6px"></div>`;
            });
            pendingFiles.forEach(f => {
                msgHTML += `<div style="margin-top:6px;opacity:0.85;font-size:0.85rem">📄 ${escapeHTML(f.name)}</div>`;
            });
            userMsgDiv.innerHTML = msgHTML || "<em>Only image/file submitted</em>";
            chatLogEl.appendChild(userMsgDiv);
            chatLogEl.scrollTop = chatLogEl.scrollHeight;
            chatInputEl.value = "";

            // Loading indicator
            const loadingDiv = document.createElement("div");
            loadingDiv.className = "msg bot loading";
            loadingDiv.textContent = "Checking answer...";
            chatLogEl.appendChild(loadingDiv);
            chatLogEl.scrollTop = chatLogEl.scrollHeight;

            try {
                const payload = {
                    text: userText,
                    images: pendingImages,
                    files: pendingFiles
                };
                const res = await fetch("https://functionjunction.onrender.com/api/gemini", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                loadingDiv.remove();
                if (!res.ok) throw new Error("Backend error");
                const data = await res.json();
                const botMsgDiv = document.createElement("div");
                botMsgDiv.className = "msg bot";
                if (window.formatMathHTML) {
                    botMsgDiv.innerHTML = window.formatMathHTML(data.reply);
                } else {
                    botMsgDiv.textContent = data.reply;
                }
                chatLogEl.appendChild(botMsgDiv);
            } catch (err) {
                loadingDiv.remove();
                const errorDiv = document.createElement("div");
                errorDiv.className = "msg bot";
                errorDiv.textContent = "Connection error. Please try again later.";
                chatLogEl.appendChild(errorDiv);
            }
            chatLogEl.scrollTop = chatLogEl.scrollHeight;

            // Clear attachments after send
            pendingImages = [];
            pendingFiles = [];
            renderPreview();
        }

        // Bind send button and enter key
        sendBtnEl.onclick = sendMessage;
        chatInputEl.onkeydown = e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };
    }
})();
