/* ai‑assistant.js 
Light‑weight chat module for Function Junction
No hard‑coded marking‑scheme. All AI logic handled by Render backend.
Backend endpoint: https://functionjunction.onrender.com/api/gemini
Dependencies: main.js must define window.el, chatLog, chatInput, sendChat in advance
DO NOT clone/replace original page DOM elements, reuse existing ones.
*/
(function () {
    let pendingImages = [];
    let pendingFiles = [];

    function ready(fn) {
        if (window.el && window.el.chatLog) {
            fn();
        } else {
            setTimeout(() => ready(fn), 100);
        }
    }

    ready(initAIChat);

    function initAIChat() {
        const chatLogEl = document.getElementById("chatLog");
        const chatInputEl = document.getElementById("chatInput");
        const sendBtnEl = document.getElementById("sendChat");
        const chatControlsEl = document.querySelector(".chat‑controls");

        // Inject attach photo / file buttons ONLY if they do NOT already exist
        if (chatControlsEl && !document.getElementById("attachPhotoBtn")) {
            const photoBtn = document.createElement("button");
            photoBtn.id = "attachPhotoBtn";
            photoBtn.type = "button";
            photoBtn.className = "icon‑btn‑attach";
            photoBtn.title = "Upload student answer photo";
            photoBtn.textContent = "📷";

            const fileBtn = document.createElement("button");
            fileBtn.id = "attachFileBtn";
            fileBtn.type = "button";
            fileBtn.className = "icon‑btn‑attach";
            fileBtn.title = "Upload marking scheme / worksheet";
            fileBtn.textContent = "📄";

            chatControlsEl.prepend(fileBtn, photoBtn);
        }

        // Hidden file input elements
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

        // Attachment preview area
        let previewArea = document.getElementById("attachPreview");
        if (!previewArea) {
            previewArea = document.createElement("div");
            previewArea.id = "attachPreview";
            previewArea.className = "attach‑preview";
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
                chip.className = "attach‑chip";
                chip.innerHTML = <img src="${img.dataUrl}" alt="preview"><span>${escapeHTML(img.name)}</span>;
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
                chip.className = "attach‑chip";
                chip.innerHTML = <span>📄 ${escapeHTML(file.name)}</span>;
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

        // Trigger file pick dialog
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

        // Drag‑and‑drop support
        chatLogEl.addEventListener("dragover", e => {
            e.preventDefault();
            chatLogEl.classList.add("drag‑over");
        });
        chatLogEl.addEventListener("dragleave", () => chatLogEl.classList.remove("drag‑over"));
        chatLogEl.addEventListener("drop", async e => {
            e.preventDefault();
            chatLogEl.classList.remove("drag‑over");
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

        // Remove old listeners safely WITHOUT destroying original DOM elements
        sendBtnEl.onclick = null;
        const newSendHandler = async function() {
            const userText = chatInputEl.value.trim();
            if (!userText && pendingImages.length === 0) return;
            const snapshotImages = pendingImages.slice();
            const snapshotFiles = pendingFiles.slice();
            addUserMessage(userText);

            chatInputEl.value = "";
            pendingImages = [];
            pendingFiles = [];
            renderPreview();

            // Typing indicator
            const loadingDiv = document.createElement("div");
            loadingDiv.className = "msg bot loading";
            loadingDiv.textContent = "Checking answer...";
            window.el.chatLog.appendChild(loadingDiv);
            scrollChatToBottom();

            try {
                const payload = {
                    text: userText,
                    images: snapshotImages,
                    files: snapshotFiles
                };

                const res = await fetch("https://functionjunction.onrender.com/api/gemini", {
                    method: "POST",
                    headers: {
                        "Content‑Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                loadingDiv.remove();
                if (!res.ok) throw new Error("Backend service error");
                const data = await res.json();
                addBotHTML(data.reply);
            } catch (err) {
                loadingDiv.remove();
                addBotHTML("Connection error. Please try again later. " + err.message);
            }
        };

        sendBtnEl.addEventListener("click", newSendHandler);

        // Enter key send
        chatInputEl.onkeydown = null;
        chatInputEl.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                newSendHandler();
            }
        });

        function addUserMessage(text) {
            const wrap = document.createElement("div");
            wrap.className = "msg user";
            let html = text ? <div>${escapeHTML(text).replaceAll("\n", "<br>")}</div> : "";
            pendingImages.forEach(img => {
                html += <div style="margin‑top:8px"><img src="${img.dataUrl}" style="max‑width:100%;max‑height:200px;border‑radius:6px"></div>;
            });
            pendingFiles.forEach(f => {
                html += <div style="margin‑top:6px;opacity:0.85;font‑size:0.85rem">📄 ${escapeHTML(f.name)}</div>;
            });
            if (!html) html = "<em>(Only image / file submitted)</em>";
            wrap.innerHTML = html;
            window.el.chatLog.appendChild(wrap);
            scrollChatToBottom();
        }

        function scrollChatToBottom() {
            requestAnimationFrame(() => {
                window.el.chatLog.scrollTop = window.el.chatLog.scrollHeight;
                setTimeout(() => { window.el.chatLog.scrollTop = window.el.chatLog.scrollHeight; }, 80);
            });
        }

        function addBotHTML(htmlContent) {
            const msg = document.createElement("div");
            msg.className = "msg bot";
            if (window.formatMathHTML) {
                msg.innerHTML = window.formatMathHTML(htmlContent);
            } else {
                msg.textContent = htmlContent;
            }
            window.el.chatLog.appendChild(msg);
            scrollChatToBottom();
            if (window.speak) {
                try {
                    window.speak(msg.textContent.slice(0, 400));
                } catch (err) { /* ignore */ }
            }
        }
    }
})();
